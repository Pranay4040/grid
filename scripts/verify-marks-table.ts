/**
 * Sanity-check buildMarksRows() — same convention as verify-attendance-cards.ts.
 */
import { buildMarksRows } from "../lib/academia/marks-table";
import type { Course, SubjectMarks } from "../lib/academia/data-types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

function course(code: string, credit = 3): Course {
  return {
    code,
    title: `Course ${code}`,
    credit,
    category: "Core",
    courseType: "Theory",
    faculty: "Dr. X",
    slot: "A",
    room: "R1",
    academicYear: "AY2026-27-ODD",
  };
}

function marks(code: string, components: SubjectMarks["components"] = []): SubjectMarks {
  return { code, courseType: "Theory", components };
}

// --- N courses -> N rows -----------------------------------------------------

{
  const courses = [course("A"), course("B"), course("C")];
  const rows = buildMarksRows(courses, []);
  check("3 courses in -> 3 rows out", rows.length, 3);
  check(
    "every row is awaiting when there's no marks data",
    rows.every((r) => r.status === "awaiting"),
    true,
  );
}

// --- Marks row without a matching course still surfaces --------------------

{
  const rows = buildMarksRows([course("A")], [marks("A"), marks("ORPHAN")]);
  check("marks-only code still surfaces", rows.length, 2);
  const orphan = rows.find((r) => r.code === "ORPHAN");
  check("orphan row has credit null", orphan?.credit, null);
}

// --- Course without a marks row still surfaces as awaiting ------------------

{
  const rows = buildMarksRows([course("A"), course("B")], [marks("A")]);
  const b = rows.find((r) => r.code === "B");
  check("course with no marks row still surfaces", b !== undefined, true);
  check("course with no marks row is awaiting", b?.status, "awaiting");
  check("course with no marks row has real credit", b?.credit, 3);
}

// --- Non-empty components -> graded ------------------------------------------

{
  const rows = buildMarksRows(
    [course("A")],
    [marks("A", [{ label: "CT-I", scored: 12, max: 15 }])],
  );
  check("non-empty components -> status graded", rows[0].status, "graded");
}

// --- Duplicate course code ----------------------------------------------------

{
  const rows = buildMarksRows([course("DUP"), course("DUP")], []);
  check("duplicate course code counted once", rows.length, 1);
}

// --- Empty input ---------------------------------------------------------------

check("empty input -> empty output", buildMarksRows([], []).length, 0);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
