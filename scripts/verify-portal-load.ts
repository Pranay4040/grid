/**
 * Offline checks for the Student Portal connect path: cookie extraction from a
 * pasted cURL/header, and loadPortal()'s ok / expired / error classification.
 * fetch is stubbed; pass real captures to replay them through the loader:
 *
 *   npx tsx scripts/verify-portal-load.ts scripts/.capture-attendance.html \
 *     scripts/.capture-marks.html scripts/.capture-marks-inner.html
 *
 * Output never prints personal data — counts only.
 */
import { readFileSync } from "node:fs";
import { extractPortalCookies, hasRequiredCookies } from "../lib/portal/client";
import { loadPortal } from "../lib/portal/load";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

/* ---------------------------- cookie extraction --------------------------- */

const curlB = `curl --url 'https://sp.srmist.edu.in/srmiststudentportal/students/report/studentAttendanceDetails.jsp' \\
  -H 'Accept: text/html, */*; q=0.01' \\
  -b 'JSESSIONID=ABC123.worker3; TS9dec798a027=08de21a0deadbeef' \\
  --data-raw 'iden=9&filter=&hdnFormDetails=1&csrfPreventionSalt='`;
const fromB = extractPortalCookies(curlB);
check("cURL -b: JSESSIONID with worker suffix", fromB.JSESSIONID, "ABC123.worker3");
check("cURL -b: F5 TS cookie", fromB.TS9dec798a027, "08de21a0deadbeef");
check("cURL -b: only the two session cookies kept", Object.keys(fromB).length, 2);
check("cURL -b: ready", hasRequiredCookies({ cookies: fromB }), true);

const curlH = `curl 'https://sp.srmist.edu.in/x' -H 'cookie: _ga=GA1.1; JSESSIONID=XYZ.worker1; TS01ab23cd=ffee99' -H 'origin: https://sp.srmist.edu.in'`;
const fromH = extractPortalCookies(curlH);
check("cURL -H cookie: analytics cookie dropped", "_ga" in fromH, false);
check("cURL -H cookie: ready", hasRequiredCookies({ cookies: fromH }), true);

const cmd = `curl "https://x" -b "JSESSIONID=Q1.worker2; TS9dec798a027=aa11"`; // Copy as cURL (cmd)
check("double-quoted cmd cURL", extractPortalCookies(cmd).TS9dec798a027, "aa11");
check("bare header", extractPortalCookies("JSESSIONID=A; TS9dec798a027=B").JSESSIONID, "A");
check("junk: nothing extracted", Object.keys(extractPortalCookies("hello world")).length, 0);
check("JSESSIONID alone is not ready", hasRequiredCookies({ cookies: extractPortalCookies("JSESSIONID=A") }), false);

/* ------------------------------- loadPortal ------------------------------- */

const session = { cookies: { JSESSIONID: "A.worker1", TS9dec798a027: "B" } };
const realFetch = globalThis.fetch;
type Route = (url: string) => Response;
function stub(route: Route) {
  // @ts-expect-error - minimal stub
  globalThis.fetch = async (url: string) => route(String(url));
}

const ATT = `<div>COURSE WISE ATTENDANCE - During the Period: 21/Jul/2026 To 16/Sep/2026</div>
<table><tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr>
<tr><td>21CSC302J</td><td>COMPUTER NETWORKS</td><td>38</td><td>36</td><td>2</td><td>94.74</td></tr></table>`;
const MARKS = `<table><thead><tr><th>Code</th><th>Description</th><th>Mark / Max. Mark</th><th></th></tr></thead><tbody>
<tr><td>21MAB302T</td><td>DISCRETE MATHEMATICS</td><td>4.50 / 5.00</td><td><button onclick="funViewComponentWiseMarks('11111', '21MAB302T', 'DISCRETE MATHEMATICS',2)">View Details</button></td></tr></tbody></table>`;
const INNER = `<table><thead><tr><th>Entered on</th><th>Component</th><th>Mark / Max. Mark</th></tr></thead><tbody><tr><td>12/Aug/2026</td><td>FT-I</td><td>4.50 / 5.00</td></tr></tbody></table>`;

function portalRoute(att: string, marks: string, inner: string): Route {
  return (url) =>
    new Response(url.includes("Inner") ? inner : url.includes("InternalMark") ? marks : att, { status: 200 });
}

async function main() {
  stub(portalRoute(ATT, MARKS, INNER));
  const ok = await loadPortal(session);
  check("ok state", ok.state, "ok");
  if (ok.state === "ok") {
    check("attendance rows", ok.attendance.rows.length, 1);
    check("marks rows", ok.marks.length, 1);
    check("components fetched per course", ok.marks[0].components[0]?.label, "FT-I");
  }

  stub(() => new Response("", { status: 302, headers: { location: "/login" } }));
  check("redirect -> expired", (await loadPortal(session)).state, "expired");

  stub(() => new Response(`<form><img src="SCaptchaServlet"><input type="password"></form>`, { status: 200 }));
  check("login page with captcha -> expired", (await loadPortal(session)).state, "expired");

  stub(
    () =>
      new Response(
        `<html><head><title>Please wait login screen is loading...</title></head><script>function callme(){ document.getElementById('.theGR8LoginLoader').action="../../students/loginManager/youLogin.jsp"; }</script><body onload='callme()'><form id='.theGR8LoginLoader' method="post"></form></body></html>`,
        { status: 200 },
      ),
  );
  check("real dead-session page (HTTP 200 login loader) -> expired", (await loadPortal(session)).state, "expired");

  stub(() => new Response("<html>maintenance</html>", { status: 200 }));
  check("unrecognised page -> error, not expired", (await loadPortal(session)).state, "error");

  stub(() => {
    throw new TypeError("fetch failed");
  });
  check("network failure -> error", (await loadPortal(session)).state, "error");

  const [attFile, marksFile, innerFile] = process.argv.slice(2);
  if (attFile && marksFile && innerFile) {
    const read = (f: string) => readFileSync(f, "utf8");
    stub(portalRoute(read(attFile), read(marksFile), read(innerFile)));
    const real = await loadPortal(session);
    check("real captures -> ok", real.state, "ok");
    if (real.state === "ok") {
      console.log(`  real: ${real.attendance.rows.length} attendance rows, ${real.marks.length} assessed courses`);
      check("real: every assessed course got components", real.marks.every((m) => m.components.length > 0), true);
    }
  }

  globalThis.fetch = realFetch;
  console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main();
