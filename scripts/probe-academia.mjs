#!/usr/bin/env node
/**
 * Discovery probe for the SRM Academia (Zoho Creator) login flow.
 *
 * Purpose: map the real handshake empirically instead of guessing at it, so
 * the scraper is written against what the portal actually does today.
 *
 * SAFETY
 *   - Phase 1 and 2 need NO password. Phase 2 uses only your NetID, because
 *     Zoho's first step is an account lookup that takes just an identifier.
 *   - Nothing here writes your password anywhere. Phase 3 is opt-in and only
 *     runs if you explicitly set SRM_PASS.
 *   - Cookie VALUES and any token-looking strings are redacted from output.
 *     Only names, sizes and shapes are printed, which is all we need.
 *
 * USAGE
 *   node scripts/probe-academia.mjs                 # phase 1 only
 *   SRM_USER=yournetid node scripts/probe-academia.mjs
 *
 * Share the output here — it contains no secrets.
 */

const ROOT = "https://academia.srmist.edu.in/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const user = process.env.SRM_USER?.trim();

/** Never print anything that could be a credential or session value. */
function redact(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/([?&](password|passwd|pwd|token|key)=)[^&\s]+/gi, "$1<REDACTED>")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<LONG-TOKEN>");
}

function cookieNames(headers) {
  // getSetCookie() is the correct multi-value accessor; fall back for safety.
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split("=")[0].trim());
}

function section(title) {
  console.log("\n" + "=".repeat(64));
  console.log(title);
  console.log("=".repeat(64));
}

/** Follow redirects by hand so we can see every hop. */
async function trace(url, init = {}, max = 10) {
  const hops = [];
  let current = url;
  let cookies = [];

  for (let i = 0; i < max; i++) {
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      headers: { "user-agent": UA, ...(init.headers ?? {}) },
    });

    const names = cookieNames(res.headers);
    cookies.push(...names);

    const location = res.headers.get("location");
    hops.push({
      step: i + 1,
      url: redact(current),
      status: res.status,
      contentType: res.headers.get("content-type")?.split(";")[0] ?? null,
      setCookieNames: names,
      redirectsTo: location ? redact(location) : null,
    });

    if (!location) return { hops, cookies, final: res };
    current = new URL(location, current).toString();
  }
  return { hops, cookies, final: null };
}

/* ------------------------------------------------------------------ */
/* Phase 1 — what does the portal root actually do?                    */
/* ------------------------------------------------------------------ */
section("PHASE 1  ·  portal entry + redirect chain  (no credentials)");

const entry = await trace(ROOT);
console.table(entry.hops);
console.log("Cookies issued along the way:", [...new Set(entry.cookies)]);

let html = "";
if (entry.final) {
  html = await entry.final.text();
  console.log("Final document bytes:", html.length);
}

/* The real login lives in an iframe whose src carries the Zoho service
   identifiers. Parse them out rather than hardcoding values that drift. */
section("PHASE 1b ·  identifiers from the signin iframe");

const frameSrc = html.match(
  /<iframe[^>]+id=["']signinFrame["'][^>]+src=["']([^"']+)["']/i,
)?.[1];

if (!frameSrc) {
  console.log("Could not find the signin iframe. Raw markers present:");
  console.log({
    hasAccountsPath: /accounts\/p\//.test(html),
    hasIframe: /<iframe/i.test(html),
  });
}

const frameUrl = frameSrc
  ? new URL(frameSrc.replace(/&amp;/g, "&"), ROOT)
  : null;

// Path shape: /accounts/p/<clientId>/signin  — orgtype rides in the query,
// and the lookup endpoint wants them joined as "<orgtype>-<clientId>".
const clientId = frameUrl?.pathname.match(/\/accounts\/p\/(\d+)\//)?.[1] ?? null;
const orgtype = frameUrl?.searchParams.get("orgtype") ?? null;
const serviceUrl = frameUrl?.searchParams.get("serviceurl") ?? null;
const appPrefix = frameUrl?.searchParams
  .get("css_url")
  ?.match(/^\/(\d+)\//)?.[1] ?? null;

const discovered = {
  frameUrl: frameUrl ? redact(frameUrl.toString()) : null,
  clientId,
  orgtype,
  lookupIdentifier: clientId && orgtype ? `${orgtype}-${clientId}` : null,
  serviceUrl,
  appPrefix,
};
console.log(JSON.stringify(discovered, null, 2));

/* ------------------------------------------------------------------ */
/* Phase 2 — account lookup. Username only, still no password.         */
/* ------------------------------------------------------------------ */
section("PHASE 2  ·  account lookup  (username only, NO password)");

// With no SRM_USER we still validate the endpoint using a throwaway id:
// a "user does not exist" reply proves the route and reveals the envelope.
const probeUser = user ?? "zz.nonexistent.probe.0000";
if (!user) {
  console.log(
    "No SRM_USER set — probing with a dummy id to validate the endpoint.\n" +
      "Set SRM_USER=<your netid> for a real lookup (still no password).\n",
  );
}

if (!discovered.lookupIdentifier) {
  console.log("Missing client id / orgtype — cannot build the lookup URL.");
} else {
  // The signin iframe must be fetched first: it mints the CSRF cookie that
  // the lookup call is validated against.
  const frameRes = await fetch(frameUrl, {
    headers: { "user-agent": UA, referer: ROOT },
  });
  const frameCookies = frameRes.headers.getSetCookie?.() ?? [];
  const jar = frameCookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = frameCookies
    .find((c) => c.startsWith("iamcsr="))
    ?.split(";")[0]
    ?.split("=")[1];

  console.log("signin frame status:", frameRes.status);
  console.log("frame cookie names:", frameCookies.map((c) => c.split("=")[0]));
  console.log("iamcsr present:", Boolean(csrf));

  const lookupUrl =
    `https://academia.srmist.edu.in/accounts/p/${discovered.lookupIdentifier}` +
    `/signin/v2/lookup/${encodeURIComponent(probeUser)}`;

  const res = await fetch(lookupUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      accept: "*/*",
      "x-zcsrf-token": csrf ? `iamcsrcoo=${csrf}` : "iamcsrcoo=",
      cookie: jar,
      referer: frameUrl.toString(),
      origin: "https://academia.srmist.edu.in",
    },
    body: new URLSearchParams({
      mode: "primary",
      cli_time: String(Date.now()),
      servicename: "ZohoCreator",
      serviceurl: discovered.serviceUrl ?? "",
    }),
  });

  const text = await res.text();
  console.log("\nPOST", redact(lookupUrl));
  console.log("status:", res.status, res.headers.get("content-type"));
  console.log("set-cookie names:", cookieNames(res.headers));
  try {
    console.log(
      "response JSON (redacted):\n",
      redact(JSON.stringify(JSON.parse(text), null, 2)).slice(0, 2000),
    );
  } catch {
    console.log("non-JSON response, first 600 chars (redacted):");
    console.log(redact(text).slice(0, 600));
  }
}

section("NEXT");
console.log(
  [
    "Paste this output back into the chat — it contains no secrets.",
    "From the lookup response we can identify the exact password endpoint",
    "and the session cookies to keep, then implement auth against that.",
  ].join("\n"),
);
