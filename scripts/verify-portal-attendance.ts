/**
 * Offline checks for the Student Portal attendance parser.
 *
 * The fixture reproduces a REAL captured report (Sept 2026) — same columns,
 * same seven courses, same numbers — so these assert against what the portal
 * actually sends, not an invented shape.
 */
import { parsePortalAttendance, resolveColumns } from "../lib/portal/parse";
import { planAttendance, ATTENDANCE_THRESHOLD } from "../lib/academia/attendance-planner";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

const COURSES: [string, string, number, number, number, string][] = [
  ["21CSC301T", "FORMAL LANGUAGE AND AUTOMATA", 21, 18, 3, "85.71"],
  ["21CSC302J", "COMPUTER NETWORKS", 38, 36, 2, "94.74"],
  ["21CSC305P", "MACHINE LEARNING", 23, 21, 2, "91.30"],
  ["21CSE323P", "MASTERING SKILLS IN CLOUD-BASED CRM AND SAAS", 6, 6, 0, "100.00"],
  ["21LEM301T", "INDIAN ART FORM", 12, 12, 0, "100.00"],
  ["21MAB302T", "DISCRETE MATHEMATICS", 30, 26, 4, "86.67"],
  ["21MEO112T", "RENEWABLE ENERGY SOURCES AND APPLICATIONS", 22, 20, 2, "90.91"],
];

const courseRows = COURSES.map(
  ([code, title, max, att, abs, pct]) =>
    `<tr><td>${code}</td><td>${title}</td><td>${max}</td><td>${att}</td><td>${abs}</td><td>${pct}</td></tr>`,
).join("");

const html = `
<div>Course Wise Attendance (%)</div>
<div>Attendance Hours</div>
<div>COURSE WISE ATTENDANCE - During the Period: <b>21/Jul/2026</b> To <b>16/Sep/2026</b></div>
<table>
  <tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr>
  ${courseRows}
</table>
<div>Cumulative Attendance (In Hours)</div>
<table>
  <tr><th>Month / Year</th><th>Present</th><th>Absent</th></tr>
  <tr><td>Jul-2026</td><td>37</td><td>0</td></tr>
  <tr><td>Aug-2026</td><td>67</td><td>11</td></tr>
  <tr><td>Sep-2026</td><td>35</td><td>2</td></tr>
</table>
<div>Absent Details</div>`;

const parsed = parsePortalAttendance(html);
check("the report parses", parsed !== null, true);

if (parsed) {
  check("all seven courses are found", parsed.rows.length, 7);

  const cn = parsed.rows.find((r) => r.code === "21CSC302J");
  check("course code", cn?.code, "21CSC302J");
  check("title comes from Description", cn?.title, "COMPUTER NETWORKS");
  // The mapping that makes the existing planner work untouched.
  check("Max. hours -> hoursConducted", cn?.hoursConducted, 38);
  check("Absent hours -> hoursAbsent", cn?.hoursAbsent, 2);
  check("Total Percentage -> attendancePct", cn?.attendancePct, 94.74);

  // Fields the portal genuinely doesn't publish stay empty, never invented.
  check("category is empty, not guessed from the code suffix", cn?.category, "");
  check("faculty is empty", cn?.faculty, "");

  check("a 100% course parses zero absences", parsed.rows.find((r) => r.code === "21LEM301T")?.hoursAbsent, 0);
  check(
    "a long title with hyphens survives",
    parsed.rows.find((r) => r.code === "21CSE323P")?.title,
    "MASTERING SKILLS IN CLOUD-BASED CRM AND SAAS",
  );

  check("the reporting period is captured", parsed.period?.from, "21/Jul/2026");
  check("period end is captured", parsed.period?.to, "16/Sep/2026");

  check("cumulative months are parsed", parsed.cumulative.length, 3);
  check("August present hours", parsed.cumulative[1]?.present, 67);
  check("August absent hours", parsed.cumulative[1]?.absent, 11);
  check("the header row is not mistaken for data", parsed.cumulative[0]?.month, "Jul-2026");

  check("the portal's own arithmetic checks out", parsed.inconsistent.length, 0);

  /* ---- the actual point: existing engine works on portal data unchanged ---- */
  const plans = planAttendance(parsed.rows);
  check("the skip-planner runs on portal rows", plans.length, 7);
  const fla = plans.find((p) => p.code === "21CSC301T");
  // 18 attended of 21 conducted = 85.71%, comfortably above the 75% line.
  check("attended is derived as conducted - absent", fla?.attended, 18);
  check("conducted comes straight from Max. hours", fla?.conducted, 21);
  check("the planner recomputes the percentage itself", fla?.percent.toFixed(2), "85.71");
  check("a course above the line reads as safe", fla?.status, "safe");
  // The whole reason attendance matters: real skips remaining.
  check("skips remaining are computed", typeof fla?.skips === "number" && fla.skips > 0, true);
  check(
    "nothing is below the threshold in this capture",
    parsed.rows.filter((r) => r.attendancePct < ATTENDANCE_THRESHOLD).length,
    0,
  );
}

/* ------------------------------ failure modes ----------------------------- */

check("a login page yields null, not empty data", parsePortalAttendance("<form><input type='password'></form>"), null);
check("an empty body yields null", parsePortalAttendance(""), null);
check(
  "a table with no course codes yields null rather than junk rows",
  parsePortalAttendance("<table><tr><th>Code</th><th>Absent hours</th></tr><tr><td>-</td><td>-</td></tr></table>"),
  null,
);

// Arithmetic disagreement must be surfaced, not smoothed over.
const bad = parsePortalAttendance(
  `<table><tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr>
   <tr><td>21CSC302J</td><td>X</td><td>38</td><td>30</td><td>2</td><td>94.74</td></tr></table>`,
);
check("a course whose hours don't add up is flagged", bad?.inconsistent[0], "21CSC302J");

/* ------------------------- markup we haven't seen ------------------------- */
/*
 * The fixture above was reconstructed from a RENDERED screenshot, so the exact
 * source markup is still unverified. These pin the variants that would
 * otherwise produce confident, wrong numbers rather than an honest failure.
 */

const reordered = parsePortalAttendance(`<table>
  <tr><th>Code</th><th>Description</th><th>Total Percentage</th><th>Absent hours</th><th>Att. hours</th><th>Max. hours</th></tr>
  <tr><td>21CSC302J</td><td>COMPUTER NETWORKS</td><td>94.74</td><td>2</td><td>36</td><td>38</td></tr>
</table>`);
check("reordered columns still map correctly", reordered?.rows[0]?.hoursConducted, 38);
check("…and absent doesn't get swapped with attended", reordered?.rows[0]?.hoursAbsent, 2);
check("…and the percentage follows its header", reordered?.rows[0]?.attendancePct, 94.74);

const extraCol = parsePortalAttendance(`<table>
  <tr><th>S.No</th><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr>
  <tr><td>1</td><td>21CSC302J</td><td>COMPUTER NETWORKS</td><td>38</td><td>36</td><td>2</td><td>94.74</td></tr>
</table>`);
check("an inserted leading column doesn't shift every number", extraCol?.rows[0]?.hoursConducted, 38);
check("…title still resolves", extraCol?.rows[0]?.title, "COMPUTER NETWORKS");

const tdHeaders = parsePortalAttendance(`<table>
  <tr><td>Code</td><td>Description</td><td>Max. hours</td><td>Att. hours</td><td>Absent hours</td><td>Total Percentage</td></tr>
  <tr><td>21CSC302J</td><td>COMPUTER NETWORKS</td><td>38</td><td>36</td><td>2</td><td>94.74</td></tr>
</table>`);
check("headers in <td> instead of <th> still work", tdHeaders?.rows[0]?.hoursAbsent, 2);

const nested = parsePortalAttendance(`<table>
  <tr><th>Code</th><th>Description</th><th>Max. hours</th><th>Att. hours</th><th>Absent hours</th><th>Total Percentage</th></tr>
  <tr><td><font face="x">21CSC302J</font></td><td><b>COMPUTER&nbsp;NETWORKS</b></td><td>38</td><td>36</td><td>2</td><td>94.74</td></tr>
</table>`);
check("nested font/b tags in cells are stripped", nested?.rows[0]?.code, "21CSC302J");
check("&nbsp; in a title becomes a space", nested?.rows[0]?.title, "COMPUTER NETWORKS");

const noHeader = parsePortalAttendance(`<table>
  <tr><td>Code</td><td>Description</td></tr>
  <tr><td>21CSC302J</td><td>COMPUTER NETWORKS</td><td>38</td><td>36</td><td>2</td><td>94.74</td></tr>
</table>`);
check("a table with no usable header falls back to observed order", noHeader?.rows[0]?.hoursConducted, 38);

// The swap this guards against: "Absent hours" must never satisfy the "att" test.
check(
  "absent is never mistaken for attended",
  resolveColumns(["Code", "Description", "Max. hours", "Att. hours", "Absent hours", "Total Percentage"])?.absent,
  4,
);
check(
  "attended resolves to its own column",
  resolveColumns(["Code", "Description", "Max. hours", "Att. hours", "Absent hours", "Total Percentage"])?.attended,
  3,
);
check("a non-header row resolves to null", resolveColumns(["21CSC302J", "COMPUTER NETWORKS"]), null);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
