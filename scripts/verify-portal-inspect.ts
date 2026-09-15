/**
 * Offline checks for lib/portal/inspect.ts — the masked forensics used to
 * write a parser for a portal nobody here can reach.
 *
 * The thing under test is mostly a SAFETY property: a capture contains the
 * student's name, register number, marks and live session cookies, and the
 * report is the artifact that gets shared. So these checks are less about
 * "does it summarise nicely" and more about "does anything real survive into
 * the output". This repo has already caught one genuine PII leak from a probe
 * script printing an unmasked cell; that's the failure being prevented.
 */
import {
  describeJson,
  findEndpointCandidates,
  looksLikeHeaderRow,
  looksLikeLogin,
  maskValue,
  summarizeResponse,
} from "../lib/portal/inspect";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

/* -------------------------------- masking -------------------------------- */

check("a register number is fully masked", maskValue("RA2111003010123"), "xx#############");
check("a name is fully masked", maskValue("Pranay"), "xxxxxx");
check("punctuation survives so format stays readable", maskValue("60.5%"), "##.#%");

/* ----------------------------- header safety ----------------------------- */

check(
  "real column labels are recognised",
  looksLikeHeaderRow(["Course Code", "Course Title", "Attn %"]),
  true,
);
// The exact shape that leaked last time: a label/value pair, not a header.
check(
  "a label/value row with a long digit run is NOT treated as a header",
  looksLikeHeaderRow(["Registration Number", "RA2111003010123"]),
  false,
);
check("a single cell is never a header", looksLikeHeaderRow(["Attendance"]), false);

/* --------------------------------- JSON ---------------------------------- */

const shape = describeJson({
  studentName: "Pranay",
  regNo: "RA2111003010123",
  percentage: 82.5,
  active: true,
  courses: [{ code: "21CSC302J", conducted: 10 }],
});
check("JSON keys are preserved verbatim", shape.includes("studentName"), true);
check("nested array keys survive", shape.includes("conducted"), true);
check("array length is reported", shape.includes("(1 items)"), true);
check("numbers report as a type, not a value", shape.includes("82.5"), false);
check("string VALUES do not survive", shape.includes("Pranay"), false);
check("register numbers do not survive", shape.includes("RA2111003010123"), false);

/* ------------------------------- endpoints ------------------------------- */

const page = `<script>fetch("/api/v1/attendance?sem=5").then(r=>r.json())</script>
  <link href="/static/app.css"><script src="/static/bundle.js"></script>
  <img src="/img/logo.png">`;
const endpoints = findEndpointCandidates(page);
check("the data endpoint is found", endpoints.includes("/api/v1/attendance?sem=5"), true);
check("stylesheets are filtered out", endpoints.includes("/static/app.css"), false);
check("bundles are filtered out", endpoints.includes("/static/bundle.js"), false);
check("images are filtered out", endpoints.includes("/img/logo.png"), false);

/* ------------------------------ login detect ----------------------------- */

check(
  "a password field marks this as a login page",
  looksLikeLogin('<form><input type="password" name="pw"></form>'),
  true,
);
check("a data page is not a login page", looksLikeLogin("<table><tr><td>x</td></tr></table>"), false);

/* ---------------------------- the whole report --------------------------- */

const html = `<html><body>
  <table>
    <tr><th>Course Code</th><th>Course Title</th><th>Attn %</th></tr>
    <tr><td>21CSC302J</td><td>Computer Networks</td><td>60.5</td></tr>
  </table>
  <div>Registration Number : RA2111003010123 Name : Pranay</div>
</body></html>`;
const report = summarizeResponse({
  url: "https://example.invalid/attendance",
  status: 200,
  contentType: "text/html",
  body: html,
});

check("column headers survive (a parser needs them)", report.includes("Course Code"), true);
check("row count is reported", report.includes("rows=2"), true);
// The whole point of the exercise.
check("the register number does NOT survive", report.includes("RA2111003010123"), false);
check("the student name does NOT survive", report.includes("Pranay"), false);
check("a course title in a DATA row does not survive", report.includes("Computer Networks"), false);
check("the masked sample row is present instead", report.includes("##xxx###x"), true);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
