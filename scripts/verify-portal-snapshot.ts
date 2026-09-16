/**
 * Checks for the "Send to Grid" path, end to end and offline:
 *   bookmarklet code (actually executed, with the portal stubbed)
 *     -> the form it submits -> buildPortalSnapshot() -> cookie encode/decode.
 *
 * Pass real captures to drive the bookmarklet with real portal pages:
 *   npx tsx scripts/verify-portal-snapshot.ts scripts/.capture-attendance.html \
 *     scripts/.capture-marks.html scripts/.capture-marks-inner.html
 * Prints counts only, never personal data.
 */
import { readFileSync } from "node:fs";
import { buildBookmarklet } from "../lib/portal/bookmarklet";
import { buildPortalSnapshot, decodeSnapshot, encodeSnapshot, looksLoggedOut } from "../lib/portal/snapshot";

process.env.SESSION_SECRET ??= "x".repeat(64);

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

const ATT = `<div>COURSE WISE ATTENDANCE - During the Period: 21/Jul/2026 To 16/Sep/2026</div>
<table><tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr>
<tr><td>21CSC302J</td><td>COMPUTER NETWORKS</td><td>38</td><td>36</td><td>2</td><td>94.74</td></tr></table>`;
const MARKS = `<table><thead><tr><th>Code</th><th>Description</th><th>Mark / Max. Mark</th><th></th></tr></thead><tbody>
<tr><td>21MAB302T</td><td>DISCRETE MATHEMATICS</td><td>4.50 / 5.00</td><td><button onclick="funViewComponentWiseMarks('11111', '21MAB302T', 'DISCRETE MATHEMATICS',2)">View Details</button></td></tr></tbody></table>`;
const INNER = `<table><thead><tr><th>Entered on</th><th>Component</th><th>Mark / Max. Mark</th></tr></thead><tbody><tr><td>12/Aug/2026</td><td>FT-I</td><td>4.50 / 5.00</td></tr></tbody></table>`;
const LOGIN_LOADER = `<html><head><title>Please wait login screen is loading...</title></head><script>function callme(){ document.getElementById('.theGR8LoginLoader').action="../../students/loginManager/youLogin.jsp"; }</script></html>`;

type Submitted = { action: string; method: string; fields: Record<string, string> };

/** Execute the bookmarklet as a browser would, on a stubbed portal page. */
async function runBookmarklet(
  pages: { att: string; marks: string; inner: string },
  origin = "https://sp.srmist.edu.in",
) {
  const code = decodeURIComponent(buildBookmarklet("https://grid.example").slice("javascript:".length));
  const requests: { url: string; body: string }[] = [];
  const alerts: string[] = [];
  const box: { submitted: Submitted | null } = { submitted: null };

  const fetchStub = async (url: string, init: { body: string }) => {
    requests.push({ url, body: init.body });
    const body = url.includes("Inner") ? pages.inner : url.includes("InternalMark") ? pages.marks : pages.att;
    return { text: async () => body };
  };
  const fields: { name: string; value: string }[] = [];
  const form = {
    method: "",
    action: "",
    style: {},
    appendChild(t: { name: string; value: string }) {
      fields.push(t);
    },
    submit() {
      box.submitted = {
        action: form.action,
        method: form.method,
        fields: Object.fromEntries(fields.map((f) => [f.name, f.value])),
      };
    },
  };
  const documentStub = {
    createElement: (tag: string) => (tag === "form" ? form : { name: "", value: "" }),
    body: { appendChild() {} },
  };

  const run = new Function("location", "fetch", "document", "alert", `return ${code.replace(/;$/, "")}`);
  await run({ origin }, fetchStub, documentStub, (m: string) => alerts.push(m));
  return { requests, alerts, submitted: box.submitted };
}

async function main() {
  // ---- bookmarklet, stubbed portal
  const run = await runBookmarklet({ att: ATT, marks: MARKS, inner: INNER });
  check("bookmarklet is valid JS and submits a form", run.submitted !== null, true);
  check("posts to Grid's import route", run.submitted?.action, "https://grid.example/portal/import");
  check("uses POST", run.submitted?.method, "POST");
  check("3 portal requests (attendance, marks, one detail)", run.requests.length, 3);
  check(
    "attendance body",
    run.requests.find((r) => r.url.endsWith("studentAttendanceDetails.jsp"))?.body,
    "iden=9&filter=&hdnFormDetails=1&csrfPreventionSalt=",
  );
  check(
    "detail body uses ids from the onclick",
    run.requests.find((r) => r.url.includes("Inner"))?.body,
    "iden=1&hdnSubjectId=11111&status=2",
  );
  check("details keyed by subjectId", JSON.parse(run.submitted?.fields.details ?? "{}")["11111"], INNER);

  const wrongSite = await runBookmarklet({ att: ATT, marks: MARKS, inner: INNER }, "https://academia.srmist.edu.in");
  check("wrong site: alerts instead of reading", wrongSite.alerts.length === 1 && wrongSite.submitted === null, true);

  // ---- snapshot builder
  const f = run.submitted?.fields ?? {};
  const built = buildPortalSnapshot(
    { attendance: f.attendance ?? "", marks: f.marks ?? "", details: JSON.parse(f.details ?? "{}") },
    1_789_000_000_000,
  );
  check("snapshot ok", built.state, "ok");
  if (built.state === "ok") {
    check("attendance rows", built.snapshot.attendance.rows.length, 1);
    check("marks with components", built.snapshot.marks[0]?.components[0]?.label, "FT-I");
    check("component stores only label,scored,max", Object.keys(built.snapshot.marks[0].components[0]).join(), "label,scored,max");

    const token = encodeSnapshot(built.snapshot);
    check("cookie token well under 4 KB", token.length < 3000, true);
    check("round-trips", decodeSnapshot(token)?.marks[0]?.total, 4.5);
    const tampered = token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    check("tampered token rejected", decodeSnapshot(tampered), null);
    check("garbage token rejected", decodeSnapshot("v1.a.b.c"), null);
  }

  check(
    "signed-out tab -> expired",
    buildPortalSnapshot({ attendance: LOGIN_LOADER, marks: LOGIN_LOADER, details: {} }).state,
    "expired",
  );
  check("login page detector", looksLoggedOut(LOGIN_LOADER), true);
  check("real report isn't flagged as logged out", looksLoggedOut(ATT + MARKS), false);
  check(
    "unrelated page -> error",
    buildPortalSnapshot({ attendance: "<html>maintenance</html>", marks: "", details: {} }).state,
    "error",
  );

  // ---- real captures through the whole path
  const [attFile, marksFile, innerFile] = process.argv.slice(2);
  if (attFile && marksFile && innerFile) {
    const read = (p: string) => readFileSync(p, "utf8");
    const real = await runBookmarklet({ att: read(attFile), marks: read(marksFile), inner: read(innerFile) });
    const rf = real.submitted?.fields ?? {};
    const snap = buildPortalSnapshot({
      attendance: rf.attendance ?? "",
      marks: rf.marks ?? "",
      details: JSON.parse(rf.details ?? "{}"),
    });
    check("real: snapshot ok", snap.state, "ok");
    if (snap.state === "ok") {
      const token = encodeSnapshot(snap.snapshot);
      console.log(
        `  real: ${real.requests.length} portal requests, ${snap.snapshot.attendance.rows.length} attendance rows, ` +
          `${snap.snapshot.marks.length} marked courses, cookie ${token.length} bytes`,
      );
      check("real: every marked course has components", snap.snapshot.marks.every((m) => m.components.length > 0), true);
      check("real: cookie decodes", decodeSnapshot(token)?.attendance.rows.length, snap.snapshot.attendance.rows.length);
    }
  }

  console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main();
