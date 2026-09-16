/**
 * Offline checks for lib/portal/client.ts — the request side of the Student
 * Portal client, pinned to the two REAL captured requests (attendance iden=9,
 * internal marks iden=13). No network: the fetch itself is stubbed so we assert
 * the exact URL, headers and body the portal expects are reproduced.
 */
import {
  REPORTS,
  fetchReport,
  hasRequiredCookies,
  parseCookieHeader,
  type PortalSession,
} from "../lib/portal/client";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

/* --------------------------- endpoint constants -------------------------- */

check("attendance iden is 9", REPORTS.attendance.iden, 9);
check("internal-marks iden is 13", REPORTS.internalMarks.iden, 13);
check(
  "attendance path matches the capture",
  REPORTS.attendance.path,
  "/srmiststudentportal/students/report/studentAttendanceDetails.jsp",
);
check(
  "marks path matches the capture",
  REPORTS.internalMarks.path,
  "/srmiststudentportal/students/report/studentInternalMarkDetails.jsp",
);

/* ------------------------------ cookie logic ----------------------------- */

const bundle = parseCookieHeader(
  "JSESSIONID=48CD5D2B34C9A70079ABC6F6B7E5F430.worker3; TS9dec798a027=08de21a0deadbeef",
);
check("JSESSIONID (with worker suffix) is parsed", bundle.JSESSIONID, "48CD5D2B34C9A70079ABC6F6B7E5F430.worker3");
check("the F5 TS cookie is parsed", bundle.TS9dec798a027, "08de21a0deadbeef");

check("both cookies present -> ready", hasRequiredCookies({ cookies: bundle }), true);
check(
  "JSESSIONID alone is NOT enough (F5 cookie required)",
  hasRequiredCookies({ cookies: { JSESSIONID: "x.worker3" } }),
  false,
);
check(
  "the F5 cookie alone is NOT enough either",
  hasRequiredCookies({ cookies: { TS9dec798a027: "x" } }),
  false,
);

/* ------------------- fetchReport reproduces the capture ------------------ */

const session: PortalSession = { cookies: bundle };
const calls: { url: string; init: RequestInit }[] = [];
const realFetch = globalThis.fetch;
// @ts-expect-error - minimal stub, we only read what we assert below
globalThis.fetch = async (url: string, init: RequestInit) => {
  calls.push({ url: String(url), init });
  return new Response("<table></table>", { status: 200 });
};

async function main() {
  const res = await fetchReport(session, REPORTS.attendance);
  globalThis.fetch = realFetch;

  const call = calls[0];
  const h = new Headers(call.init.headers);
  const body = String(call.init.body);

  check("posts to the attendance URL", call.url, "https://sp.srmist.edu.in/srmiststudentportal/students/report/studentAttendanceDetails.jsp");
  check("uses POST", call.init.method, "POST");
  check("sends the XHR header the portal requires", h.get("x-requested-with"), "XMLHttpRequest");
  check("sends the Origin the WAF checks", h.get("origin"), "https://sp.srmist.edu.in");
  check(
    "Referer points at HRDSystem.jsp",
    h.get("referer"),
    "https://sp.srmist.edu.in/srmiststudentportal/students/template/HRDSystem.jsp",
  );
  check("replays BOTH cookies", h.get("cookie")?.includes("JSESSIONID=") && h.get("cookie")?.includes("TS9dec798a027="), true);
  check("body carries iden=9", body.includes("iden=9"), true);
  check("body sets hdnFormDetails=1", body.includes("hdnFormDetails=1"), true);
  check("body includes the (empty) csrf salt field", body.includes("csrfPreventionSalt="), true);
  check("response body is returned raw for later parsing", res.body, "<table></table>");

  const detail = calls[1];
  const dh = new Headers(detail.init.headers);
  check("detail posts to the Inner URL", detail.url, "https://sp.srmist.edu.in/srmiststudentportal/students/report/studentInternalMarkDetailsInner.jsp");
  check("detail body matches the portal's own $.post", String(detail.init.body), "iden=1&hdnSubjectId=42782&status=2");
  check("detail sends the XHR header too", dh.get("x-requested-with"), "XMLHttpRequest");

  console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main();
