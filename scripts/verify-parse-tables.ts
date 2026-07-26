/**
 * Regression test for the marks-table nesting bug: findTable()'s non-greedy
 * regex used to truncate at the first nested </table>, so parseAttendance()
 * only ever returned 1 of N courses' marks rows (live-confirmed: 9 courses,
 * 1 marks entry). findTableNested() fixes it. No live session needed — this
 * builds a synthetic page reproducing the real markup shape (masked
 * structure only, no real data) and exercises the public parseAttendance()
 * entry point exactly like verify-parse.ts does against the real portal.
 *
 * Same `check()` PASS/FAIL convention as verify-custom.ts / verify-attendance-planner.ts.
 */
import { parseAttendance } from "../lib/academia/parse";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log("  expected:", JSON.stringify(expected));
    console.log("  actual:  ", JSON.stringify(actual));
  }
}

/** Wrap inner HTML the way Academia's real pages do: a JS assignment calling
 *  pageSanitizer.sanitize('...'). Double-quoted attributes and no apostrophes
 *  in the inner content only — extractView() stops at the first unescaped '. */
function page(viewName: string, inner: string): string {
  return (
    `<script>document.getElementById("zc-viewcontainer_${viewName}").innerHTML = ` +
    `pageSanitizer.sanitize('${inner}');</script>`
  );
}

const STUDENT_BLOB =
  "Registration Number: RA0000000000000 Name: Test Student Program: B.Tech " +
  "Department: Computer Science (AJ1 Section) Specialization: none Semester: 5 " +
  "Batch: 1";

const ATTENDANCE_TABLE =
  "<table><tr><td>Course Code</td><td>Title</td><td>Category</td><td>Faculty</td>" +
  "<td>Slot</td><td>Room</td><td>Cond</td><td>Absent</td><td>Attn%</td></tr>" +
  "<tr><td>21ABC101</td><td>Course A</td><td>Theory</td><td>Fac A</td><td>A</td>" +
  "<td>R1</td><td>10</td><td>1</td><td>90</td></tr>" +
  "<tr><td>21ABC102</td><td>Course B</td><td>Theory</td><td>Fac B</td><td>B</td>" +
  "<td>R2</td><td>8</td><td>2</td><td>75</td></tr></table>";

/** N course rows, each with a single nested empty sub-table — the exact live
 *  shape confirmed against the real portal today. */
function marksTable(codes: string[]): string {
  const header = "<tr><td>Course Code</td><td>Course Type</td><td>Test Performance</td></tr>";
  const rows = codes
    .map(
      (code) =>
        `<tr><td>${code}</td><td>Theory</td><td><table><tbody><tr></tr></tbody></table></td></tr>`,
    )
    .join("");
  return `<table>${header}${rows}</table>`;
}

const NINE_CODES = [
  "21ABC101", "21ABC102", "21ABC103", "21ABC104", "21ABC105",
  "21ABC106", "21ABC107", "21ABC108", "21ABC109",
];

// --- Regression pin: 9 codes in, 9 marks entries out (was 1) ----------------

{
  const inner = STUDENT_BLOB + ATTENDANCE_TABLE + marksTable(NINE_CODES);
  const result = parseAttendance(page("My_Attendance", inner));
  check("parseAttendance does not return null", result !== null, true);
  check("marks.length === 9 (was 1 before the fix)", result?.marks.length, 9);
  check(
    "marks codes match and are in order",
    result?.marks.map((m) => m.code),
    NINE_CODES,
  );
  check(
    "components is [] for every marks entry",
    result?.marks.every((m) => m.components.length === 0),
    true,
  );
  check(
    "courseType captured per row",
    result?.marks.every((m) => m.courseType === "Theory"),
    true,
  );
  check(
    "co-located non-nested attendance table is unaffected",
    result?.rows.length,
    2,
  );
}

// --- Two-level-deep nesting still resolves to the full outer span ----------

{
  const codes = ["21XYZ201", "21XYZ202", "21XYZ203"];
  const header = "<tr><td>Course Code</td><td>Course Type</td><td>Test Performance</td></tr>";
  const normalRow = (code: string) =>
    `<tr><td>${code}</td><td>Theory</td><td><table><tbody><tr></tr></tbody></table></td></tr>`;
  // Row 2 nests a table inside a table inside the cell — two levels deep.
  const deepRow =
    "<tr><td>21XYZ202</td><td>Theory</td><td><table><tbody><tr><td>" +
    "<table><tbody><tr></tr></tbody></table></td></tr></tbody></table></td></tr>";
  const table = `<table>${header}${normalRow(codes[0])}${deepRow}${normalRow(codes[2])}</table>`;
  const inner = STUDENT_BLOB + table;
  const result = parseAttendance(page("My_Attendance", inner));
  check("two-level nesting: marks.length === 3", result?.marks.length, 3);
  check(
    "two-level nesting: codes still match",
    result?.marks.map((m) => m.code),
    codes,
  );
}

// --- No marks table present -------------------------------------------------

{
  const inner = STUDENT_BLOB + ATTENDANCE_TABLE; // no "test performance" table at all
  const result = parseAttendance(page("My_Attendance", inner));
  check("no marks table: does not throw, returns non-null", result !== null, true);
  check("no marks table: marks.length === 0", result?.marks.length, 0);
  check("no marks table: attendance rows still parsed", result?.rows.length, 2);
}

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
