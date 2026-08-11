/**
 * SRM Academia (Zoho IAM v2) authentication client.
 *
 * The handshake, confirmed empirically against the live portal:
 *
 *   1. GET  /                          → base cookies + a signin <iframe>
 *   2. GET  <iframe src>               → mints the `iamcsr` CSRF cookie
 *   3. POST /signin/v2/lookup/<user>   → account exists? which auth modes?
 *   4. POST /signin/v2/primary/<id>/password  → password checked here
 *   5. GET  <redirect/serviceurl>      → lands the final Creator app session
 *
 * SECURITY INVARIANTS
 *   - The password lives only as a local parameter to `authenticate()`. It is
 *     never stored on `this`, never logged, never placed in a returned object
 *     or thrown error. The only thing that leaves this module is the cookie
 *     bundle in AcademiaSession.
 *   - Only steps 3 and later touch the network with user input; steps 1–2 are
 *     credential-free, so `discoverService()` is safe to call anytime.
 *
 * The step-4/5 response *classification* is best-effort until validated against
 * a real login (run scripts/test-auth.mjs locally). Everything the classifier
 * doesn't recognise falls through to `unexpected` with the raw message, so an
 * unmodelled response degrades loudly instead of silently "succeeding".
 */
import { CookieJar } from "./cookies";
import type {
  AcademiaSession,
  LoginFailure,
  LoginOutcome,
  LookupResult,
  ServiceConfig,
} from "./types";

const ORIGIN = "https://academia.srmist.edu.in";
const ROOT = `${ORIGIN}/`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Purely an informational "last confirmed working" stamp written by
 * extendSession() — nothing gates on it. It used to be treated as the
 * session's whole lifetime, hard-refusing to even try the cookies once this
 * guessed window passed — which caused a false "not connected" after ~24h of
 * real inactivity even though Academia still accepted the same cookies fine
 * (confirmed with scripts/probe-session-liveness.ts). Real invalidity can
 * only come from actually attempting the fetch; see isExpired().
 */
export const SESSION_SOFT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h

/** Hard outer lifetime regardless of activity — a security backstop so a
 *  session can't stay valid forever just by being opened periodically.
 *  Exported so the session cookie's own max-age can be pinned to the same
 *  deadline (see lib/auth/session-cookie.ts) — otherwise the browser would
 *  keep sending a cookie the server has already decided is dead. */
export const SESSION_ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ZohoEnvelope = {
  status_code?: number;
  message?: string;
  localized_message?: string;
  redirect_url?: string;
  cookie?: string;
  lookup?: {
    identifier?: string;
    digest?: string;
    login_id?: string;
    /** modes may arrive as objects or codes depending on Zoho build */
    hide_pwd_form?: boolean;
  };
  errors?: { code?: string; message?: string }[];
  /** The shape signin.ac actually returns on a bad password, empirically:
   *  {"t":"json","error":{"msg":"Invalid Email Address or Password"}} —
   *  singular, distinct from the plural `errors` array above. */
  error?: { msg?: string; code?: string };
  // Zoho sometimes nests the useful bits under different keys across builds.
  [key: string]: unknown;
};

async function req(
  url: string,
  jar: CookieJar,
  init: RequestInit & { csrf?: string } = {},
): Promise<{ res: Response; text: string; json: ZohoEnvelope | null }> {
  const { csrf, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    redirect: "manual",
    headers: {
      "user-agent": UA,
      accept: "application/json, text/plain, */*",
      cookie: jar.header(),
      ...(csrf ? { "x-zcsrf-token": `iamcsrcoo=${csrf}` } : {}),
      ...headers,
    },
  });
  jar.absorb(res);
  const text = await res.text();
  let json: ZohoEnvelope | null = null;
  try {
    json = JSON.parse(text) as ZohoEnvelope;
  } catch {
    /* non-JSON (HTML redirect page etc.) — leave json null */
  }
  return { res, text, json };
}

/**
 * Steps 1–2. Credential-free: fetches the portal, extracts the Zoho service
 * identifiers from the signin iframe, and primes the CSRF cookie.
 */
export async function discoverService(
  jar: CookieJar = new CookieJar(),
): Promise<{ jar: CookieJar; service: ServiceConfig; csrf: string }> {
  const root = await fetch(ROOT, { headers: { "user-agent": UA } });
  jar.absorb(root);
  const html = await root.text();

  const frameSrc = html.match(
    /<iframe[^>]+id=["']signinFrame["'][^>]+src=["']([^"']+)["']/i,
  )?.[1];
  if (!frameSrc) {
    throw new PortalShapeError("signin iframe not found on portal root");
  }

  const frameUrl = new URL(frameSrc.replace(/&amp;/g, "&"), ROOT);
  const clientId = frameUrl.pathname.match(/\/accounts\/p\/(\d+)\//)?.[1];
  const orgtype = frameUrl.searchParams.get("orgtype");
  const appPrefix =
    frameUrl.searchParams.get("css_url")?.match(/^\/(\d+)\//)?.[1] ?? "";
  if (!clientId || !orgtype) {
    throw new PortalShapeError("could not parse clientId/orgtype from iframe");
  }

  // Fetch the iframe itself — this is what sets `iamcsr`.
  const frame = await fetch(frameUrl, {
    headers: { "user-agent": UA, referer: ROOT, cookie: jar.header() },
  });
  jar.absorb(frame);

  const csrf = jar.get("iamcsr");
  if (!csrf) throw new PortalShapeError("iamcsr CSRF cookie was not issued");

  return {
    jar,
    csrf,
    service: {
      clientId,
      orgtype,
      lookupId: `${orgtype}-${clientId}`,
      appPrefix,
      frameUrl: frameUrl.toString(),
    },
  };
}

/** Step 3. Username only — no password crosses the wire here. */
export async function lookup(
  jar: CookieJar,
  service: ServiceConfig,
  csrf: string,
  username: string,
): Promise<
  { ok: true; result: LookupResult } | { ok: false; reason: LoginFailure; message: string }
> {
  const url =
    `${ORIGIN}/accounts/p/${service.lookupId}/signin/v2/lookup/` +
    encodeURIComponent(username);

  const { json } = await req(url, jar, {
    method: "POST",
    csrf,
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      referer: service.frameUrl,
      origin: ORIGIN,
    },
    body: new URLSearchParams({
      mode: "primary",
      cli_time: String(Date.now()),
      servicename: "ZohoCreator",
    }),
  });

  if (!json) return { ok: false, reason: "portal_unavailable", message: "no JSON from lookup" };

  const code = json.errors?.[0]?.code;
  if (code === "U401" || /does not exist/i.test(json.message ?? "")) {
    return { ok: false, reason: "unknown_user", message: "Account not found." };
  }
  if (json.status_code && json.status_code >= 400 && !json.lookup?.identifier) {
    return classifyError(json);
  }

  const identifier = json.lookup?.identifier;
  if (!identifier) {
    return { ok: false, reason: "unexpected", message: json.message ?? "lookup had no identifier" };
  }

  return {
    ok: true,
    result: {
      identifier,
      digest: json.lookup?.digest,
      modes: [], // Zoho reports modes inconsistently; password is the default path
    },
  };
}

/**
 * The ONLY function that receives the password. Used to build one request body,
 * then out of scope — never persisted or logged.
 *
 * Uses the classic `/accounts/signin.ac` endpoint (the flow goscraper/ClassPro
 * use). The critical step the v2 flow was missing: on success the response
 * carries `oauthorize_uri` + `access_token`, and GETting
 * `<oauthorize_uri>&access_token=<token>` (following redirects) is what
 * EXCHANGES the transient `_iamtt` ticket for the durable IAM + Creator-app
 * session cookies. Without it you're left holding only the ticket and every
 * data page bounces to the login screen.
 */
async function signinAc(
  jar: CookieJar,
  service: ServiceConfig,
  csrf: string,
  username: string,
  password: string,
): Promise<LoginOutcome> {
  const { json, text } = await req(`${ORIGIN}/accounts/signin.ac`, jar, {
    method: "POST",
    csrf,
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      origin: ORIGIN,
      referer: ROOT,
    },
    body: new URLSearchParams({
      username,
      password,
      client_portal: "true",
      portal: service.clientId,
      servicename: "ZohoCreator",
      serviceurl: ROOT,
      is_ajax: "true",
      grant_type: "password",
      service_language: "en",
    }),
  });

  if (!json) {
    // A non-JSON body is usually Zoho's bot-protection challenge page, which is
    // exactly what a deployment behind shared cloud IPs gets. Naming it beats
    // "no JSON from signin.ac", which reads like the portal is down.
    if (/captcha|recaptcha|hip_required|are you a human/i.test(text)) {
      return {
        ok: false,
        reason: "captcha_required",
        message: "Zoho served a captcha challenge — sign in once on the official portal, then retry.",
      };
    }
    return {
      ok: false,
      reason: "portal_unavailable",
      message: `Academia returned a non-JSON response to sign-in (${text.length} bytes).`,
    };
  }

  const blob = `${json.status ?? ""} ${json.code ?? ""} ${json.message ?? ""} ${json.msg ?? ""} ${json.error?.msg ?? ""}`.toLowerCase();

  // Captcha challenge.
  if (/hip_required|hip_failed|captcha/.test(blob)) {
    return { ok: false, reason: "captcha_required", message: "Captcha required — sign in once on the official portal, then retry." };
  }
  // Concurrent-session cap (user already signed in elsewhere).
  if (/concurrent|terminate|active session/.test(blob)) {
    return { ok: false, reason: "rate_limited", message: "You're signed in on another device/session. Sign out there (or wait), then retry." };
  }

  // Pull the finalize params from either the top level or a nested `data`.
  const data = (typeof json.data === "object" && json.data ? json.data : json) as ZohoEnvelope;
  const oauthorizeUri = firstString(data.oauthorize_uri, json.oauthorize_uri);
  const accessToken = firstString(data.access_token, json.access_token);

  if (!oauthorizeUri || !accessToken) {
    // Not a recognised success and not a known failure. Surface a redacted
    // snippet (never the password — it's not echoed in the response) so a
    // single run tells us exactly what shape came back.
    const known = classifyError(json);
    if (known.reason !== "unexpected") return known;
    const snippet = redactBlob(text).slice(0, 300);
    return { ok: false, reason: "unexpected", message: `Unrecognised signin.ac response: ${snippet}` };
  }

  // THE FINALIZE: exchange the ticket for the real session.
  const sep = oauthorizeUri.includes("?") ? "&" : "?";
  const finalizeUrl = new URL(
    `${oauthorizeUri}${sep}access_token=${encodeURIComponent(accessToken)}`,
    ORIGIN,
  ).toString();
  await followRedirects(finalizeUrl, jar);

  // A finalized session carries an IAM app token; the bare ticket does not.
  const finalized = jar.names().some((n) => /_iamadt_client|_z_identity/.test(n));
  if (!finalized) {
    return {
      ok: false,
      reason: "unexpected",
      message:
        "Signed in but the session didn't finalize (no app token after oauthorize). Cookies: " +
        jar.names().join(","),
    };
  }

  const now = Date.now();
  return {
    ok: true,
    session: { cookies: jar.toJSON(), expiresAt: now + SESSION_SOFT_WINDOW_MS, issuedAt: now },
  };
}

function firstString(...vals: unknown[]): string | undefined {
  return vals.find((v) => typeof v === "string" && v.length > 0) as string | undefined;
}

/** Redact long token-like runs from a raw body for safe diagnostics. */
function redactBlob(s: string): string {
  return s.replace(/\b[A-Za-z0-9_.-]{24,}\b/g, "<REDACTED>").replace(/\s+/g, " ");
}

/** Zoho's lookup expects the full email; accept a bare netid too. */
export function normalizeUsername(input: string): string {
  const u = input.trim();
  return u.includes("@") ? u : `${u}@srmist.edu.in`;
}

/** Public entry point. Orchestrates the whole flow; password used once. */
export async function login(
  username: string,
  password: string,
): Promise<LoginOutcome> {
  try {
    const { jar, service, csrf } = await discoverService();
    return await signinAc(jar, service, csrf, normalizeUsername(username), password);
  } catch (err) {
    if (err instanceof PortalShapeError) {
      return { ok: false, reason: "portal_unavailable", message: err.message };
    }
    // Never surface internals that might include request context.
    return { ok: false, reason: "unexpected", message: "Login failed unexpectedly." };
  }
}

/**
 * Replay a stored session's cookies for authenticated data calls.
 *
 * The Zoho Creator data pages serve an empty SPA shell to a plain browser GET
 * and the real rendered HTML only when the request looks like the page's own
 * XHR. `X-Requested-With: XMLHttpRequest` (with the form Content-Type + Referer)
 * is what flips it — without these you get an identical ~8KB shell every time.
 */
export type FetchAs = ((path: string, init?: RequestInit) => Promise<Response>) & {
  /** The live cookie jar, updated in place as responses refresh cookies —
   *  read `.jar.toJSON()` after a call to persist any refresh (see
   *  extendSession()). */
  jar: CookieJar;
};

export function authedFetch(session: AcademiaSession): FetchAs {
  const jar = CookieJar.fromJSON(session.cookies);
  const fetchAs = (async (path: string, init: RequestInit = {}) => {
    const url = path.startsWith("http") ? path : `${ORIGIN}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "user-agent": UA,
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        referer: ROOT,
        cookie: jar.header(),
        ...init.headers,
      },
    });
    jar.absorb(res); // pick up any session refresh
    return res;
  }) as FetchAs;
  fetchAs.jar = jar;
  return fetchAs;
}

/**
 * Only the hard 30-day backstop actually gates whether a session gets used —
 * NOT `expiresAt`. That field used to hard-refuse a session once a guessed
 * window passed, which meant we'd show "not connected" without ever trying
 * the real cookies, even when Academia would have happily accepted them
 * (confirmed empirically: a session survived 24h+ of total inactivity, far
 * past the old 6h guess). The real signal has to come from actually
 * attempting the fetch — this function only rules out the case we're
 * actually sure about. Older files from before `issuedAt` existed are
 * treated as already at the backstop — one clean re-login adopts the format.
 */
export function isExpired(session: AcademiaSession): boolean {
  if (typeof session.issuedAt !== "number") return true;
  return Date.now() - session.issuedAt >= SESSION_ABSOLUTE_MAX_MS;
}

/** Refresh the stored cookies after a successful authenticated fetch and
 *  bump `expiresAt` to now — purely an informational "last confirmed
 *  working" marker at this point, not something anything gates on.
 *  `issuedAt` is preserved so the 30-day backstop still counts from the
 *  original login. */
export function extendSession(session: AcademiaSession, jar: CookieJar): AcademiaSession {
  return {
    cookies: jar.toJSON(),
    expiresAt: Date.now() + SESSION_SOFT_WINDOW_MS,
    issuedAt: session.issuedAt,
  };
}

/* ------------------------------ helpers ------------------------------ */

async function followRedirects(start: string, jar: CookieJar, max = 6) {
  let url = start;
  for (let i = 0; i < max; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": UA, cookie: jar.header(), referer: ROOT },
    });
    jar.absorb(res);
    const loc = res.headers.get("location");
    if (!loc) return;
    url = new URL(loc, url).toString();
  }
}

export function classifyError(json: ZohoEnvelope): {
  ok: false;
  reason: LoginFailure;
  message: string;
} {
  const raw = `${json.errors?.[0]?.message ?? ""} ${json.message ?? ""} ${
    json.localized_message ?? ""
  } ${json.error?.msg ?? ""}`.toLowerCase();

  const has = (...needles: string[]) => needles.some((n) => raw.includes(n));

  if (has("captcha")) {
    return { ok: false, reason: "captcha_required", message: "Captcha required — sign in on the official portal once, then retry." };
  }
  if (has("otp", "mfa", "two factor", "two-factor", "second factor")) {
    return { ok: false, reason: "mfa_required", message: "This account has extra verification enabled." };
  }
  if (has("too many", "rate limit", "temporarily blocked")) {
    return { ok: false, reason: "rate_limited", message: "Too many attempts. Wait a few minutes and retry." };
  }
  // BEFORE bad_password, deliberately: every one of these messages contains the
  // word "password" while meaning the password was RIGHT. Ordering them after
  // the credential check told people with a correct password that it was wrong,
  // and no amount of retyping could ever clear it.
  if (has("password has expired", "password expired", "expired password", "change your password", "password change", "reset your password", "must change")) {
    return {
      ok: false,
      reason: "password_expired",
      message:
        "Your SRM password needs to be changed before you can sign in. " +
        "Do that on the official Academia portal, then come back.",
    };
  }
  if (has("locked", "disabled", "suspended", "deactivated")) {
    return {
      ok: false,
      reason: "account_locked",
      message: "SRM has locked this account. Sort it out on the official Academia portal.",
    };
  }
  if (has("does not exist", "no account", "account not found", "user not found")) {
    return { ok: false, reason: "unknown_user", message: "Account not found." };
  }
  // Narrow, deliberate phrases only. This used to match the bare words
  // "password" / "invalid" / "incorrect", which swallowed "invalid CSRF token",
  // "invalid request" and every other handshake failure and reported them all
  // as a wrong password — hiding the real fault behind an error the user can
  // never act on. An honest `unexpected` with the real message beats a
  // confident wrong answer.
  if (
    has(
      "invalid email address or password",
      "invalid username or password",
      "incorrect password",
      "invalid password",
      "wrong password",
      "invalid credential",
      "incorrect credential",
      "bad credential",
      "invalid login",
    )
  ) {
    return { ok: false, reason: "bad_password", message: "Incorrect NetID or password." };
  }
  return {
    ok: false,
    reason: "unexpected",
    message: json.localized_message || json.message || "Unrecognised login response.",
  };
}

class PortalShapeError extends Error {}
