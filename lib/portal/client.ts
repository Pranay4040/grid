/**
 * SRM Student Portal client — the report-fetch layer.
 *
 * The portal (sp.srmist.edu.in, a Java/Tomcat webapp — NOT the Zoho-based
 * Academia site) is where SRM moved attendance and internal marks in Sept 2026.
 * It publishes no API, so this reads it the way lib/academia/ reads Academia:
 * replay the exact request the portal's own frontend makes.
 *
 * WHAT'S CONFIRMED (from two real captured requests, Sept 2026):
 *   - Data comes from POST <report>.jsp with an `iden` selecting the report.
 *   - The body is `iden=<n>&filter=&hdnFormDetails=1&csrfPreventionSalt=`.
 *     csrfPreventionSalt was EMPTY in both captures and still worked.
 *   - Required headers: X-Requested-With: XMLHttpRequest (same trick Academia
 *     needs), plus Origin + Referer pointing at HRDSystem.jsp — the WAF very
 *     likely checks these.
 *   - Auth is TWO cookies: JSESSIONID (Tomcat, carries a `.worker<n>` load-
 *     balancer affinity suffix) AND a `TS…` cookie (an F5 BIG-IP ASM / WAF
 *     cookie). Replay needs BOTH — the F5 cookie is not optional.
 *
 * Response parsing lives in ./parse.ts, written against real captures.
 *
 * WHAT'S NOT YET KNOWN:
 *   - Whether the F5 session survives replay from a different IP/User-Agent
 *     than the browser that logged in. If the WAF pins the session to the
 *     client, replaying from Vercel's servers may be rejected — the same
 *     "unknown until real traffic" risk Academia already carries for Zoho.
 *     Do not assume this works server-side until it's been tried end to end.
 *
 * WHY LOGIN ISN'T AUTOMATED HERE (and won't be): the portal login has a
 * mandatory captcha (SCaptchaServlet) and a bot-detection telemetry script
 * (resources/js/secure2.js — canvas fingerprint, mouse/keystroke cadence,
 * navigator.webdriver). Getting a headless script past that is bypassing bot
 * protection, which this project treats as a hard line (see CLAUDE.md). The
 * session is captured from a real human login instead; this module only
 * replays it.
 */

const ORIGIN = "https://sp.srmist.edu.in";
const CONTEXT = "/srmiststudentportal";
const HRD_SYSTEM = `${ORIGIN}${CONTEXT}/students/template/HRDSystem.jsp`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** A report endpoint and the `iden` that selects it. Both values are from real
 *  captured requests — attendance iden=9, internal marks iden=13. */
export type ReportEndpoint = { path: string; iden: number };

export const REPORTS = {
  attendance: {
    path: `${CONTEXT}/students/report/studentAttendanceDetails.jsp`,
    iden: 9,
  },
  internalMarks: {
    path: `${CONTEXT}/students/report/studentInternalMarkDetails.jsp`,
    iden: 13,
  },
} as const satisfies Record<string, ReportEndpoint>;

export type ReportName = keyof typeof REPORTS;

/**
 * A replayable portal session: the cookie bundle from a human browser login.
 * Both cookies matter (see file header). This is the ONLY thing persisted, and
 * — exactly like AcademiaSession — it is captured post-login, so no password
 * ever reaches this module.
 */
export type PortalSession = {
  cookies: Record<string, string>;
};

/** Parse a browser `Cookie:` header (or a curl `-b` string) into a bundle. */
export function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(session: PortalSession): string {
  return Object.entries(session.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/** True once the portal has handed us the cookies a report replay needs. */
export function hasRequiredCookies(session: PortalSession): boolean {
  const names = Object.keys(session.cookies);
  const hasJsession = names.some((n) => /^JSESSIONID$/i.test(n));
  const hasWaf = names.some((n) => /^TS[0-9a-f]+$/i.test(n));
  return hasJsession && hasWaf;
}

export type ReportResponse = {
  status: number;
  /** Raw response body. Parsing waits on a captured sample — see file header. */
  body: string;
};

/**
 * Replay one report request. Mirrors the two captured cURLs exactly: same POST
 * body, same headers the WAF checks. Runs wherever sp.srmist.edu.in is
 * reachable (a real browser IP, or a server — untested from a server, see
 * header).
 */
export async function fetchReport(
  session: PortalSession,
  report: ReportEndpoint,
  init: { filter?: string; csrfPreventionSalt?: string } = {},
): Promise<ReportResponse> {
  return post(session, report.path, {
    iden: String(report.iden),
    filter: init.filter ?? "",
    hdnFormDetails: "1",
    csrfPreventionSalt: init.csrfPreventionSalt ?? "",
  });
}

/** Per-test breakdown for one course — what "View Details" on the marks report
 *  loads. The body is the portal's own jQuery `$.post` (iden=1, hdnSubjectId,
 *  status), NOT the report body above; ids come from parsePortalMarks(). */
export function fetchMarkComponents(
  session: PortalSession,
  subjectId: string,
  status: string,
): Promise<ReportResponse> {
  return post(session, `${CONTEXT}/students/report/studentInternalMarkDetailsInner.jsp`, {
    iden: "1",
    hdnSubjectId: subjectId,
    status,
  });
}

async function post(
  session: PortalSession,
  path: string,
  fields: Record<string, string>,
): Promise<ReportResponse> {
  const res = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "user-agent": UA,
      accept: "text/html, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      origin: ORIGIN,
      referer: HRD_SYSTEM,
      cookie: cookieHeader(session),
    },
    body: new URLSearchParams(fields),
  });

  return { status: res.status, body: await res.text() };
}

/**
 * Pull ONLY the session cookies out of whatever the user pasted: a DevTools
 * "Copy as cURL" command (-b '...' or -H 'cookie: ...'), a bare Cookie header,
 * or `document.cookie` output. Matching names anywhere in the text is what
 * makes all three work; everything else in a cURL (headers, body, URL) is
 * discarded and never stored.
 */
export function extractPortalCookies(pasted: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of pasted.matchAll(/\b(JSESSIONID|TS[0-9a-f]{6,})=([^;'"\s\\]+)/gi)) {
    out[m[1]] = m[2];
  }
  return out;
}
