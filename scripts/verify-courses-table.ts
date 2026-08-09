/**
 * Sanity-check buildCourseRows()/summarizeCourses()/cleanFaculty() —
 * same convention as verify-marks-table.ts. Synthetic fixtures only,
 * no live session needed.
 *
 *   npx tsx scripts/verify-courses-table.ts
 */
import {
  buildCourseRows,
  cleanFaculty,
  summarizeCourses,
  uniqueCourses,
} from "../lib/academia/courses-table";
import type { AttendanceRow, Course } from "../lib/academia/data-types";

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

function course(code: string, over: Partial<Course> = {}): Course {
  return {
    code,
    title: `Course ${code}`,
    credit: 3,
    category: "Professional Core",
    courseType: "Theory",
    faculty: "Dr. X (103033)",
    slot: "A",
    room: "R1",
    academicYear: "AY2026-27-ODD",
    ...over,
  };
}

function attRow(code: string, over: Partial<AttendanceRow> = {}): AttendanceRow {
  return {
    code,
    title: `Course ${code}`,
    category: "Theory",
    faculty: "Dr. X (103033)",
    slot: "A",
    room: "R1",
    hoursConducted: 10,
    hoursAbsent: 2,
    attendancePct: 80,
    ...over,
  };
}

// --- cleanFaculty -------------------------------------------------------------

check("strips trailing staff id", cleanFaculty("Dr.Maivizhi R (103033)"), "Dr.Maivizhi R");
check("leaves a name with no id alone", cleanFaculty("Dr. Anitha"), "Dr. Anitha");
check("keeps non-numeric parenthetical", cleanFaculty("Dr. X (Visiting)"), "Dr. X (Visiting)");
check("trims surrounding space", cleanFaculty("  Dr. Y (12)  "), "Dr. Y");

// --- basic mapping ------------------------------------------------------------

{
  const rows = buildCourseRows([course("A"), course("B"), course("C")], []);
  check("3 courses in -> 3 rows out", rows.length, 3);
  check("faculty cleaned on the row", rows[0].faculty, "Dr. X");
  check("no attendance -> empty list", rows[0].attendance, []);
}

// --- attendance join ----------------------------------------------------------

{
  const rows = buildCourseRows([course("A")], [attRow("A", { attendancePct: 91 })]);
  check("attendance attached", rows[0].attendance.length, 1);
  check("percent carried through", rows[0].attendance[0].percent, 91);
  check("conducted carried through", rows[0].attendance[0].conducted, 10);
  check("absent carried through", rows[0].attendance[0].absent, 2);
}

// --- Theory + Practical stay separate ----------------------------------------

{
  const rows = buildCourseRows(
    [course("A")],
    [
      attRow("A", { category: "Theory", attendancePct: 80 }),
      attRow("A", { category: "Practical", attendancePct: 95 }),
    ],
  );
  check("one row for the course", rows.length, 1);
  check("both attendance categories kept", rows[0].attendance.length, 2);
  check(
    "categories preserved",
    rows[0].attendance.map((a) => a.category),
    ["Theory", "Practical"],
  );
}

// --- dedupe -------------------------------------------------------------------

{
  const rows = buildCourseRows([course("DUP"), course("DUP")], []);
  check("duplicate course code counted once", rows.length, 1);
}

// --- orphan attendance rows still surface ------------------------------------

{
  const rows = buildCourseRows([course("A")], [attRow("ORPHAN")]);
  check("orphan attendance surfaced", rows.length, 2);
  const orphan = rows.find((r) => r.code === "ORPHAN")!;
  check("orphan has null credit", orphan.credit, null);
  check("orphan keeps its attendance", orphan.attendance.length, 1);
}

// --- summary ------------------------------------------------------------------

{
  const rows = buildCourseRows(
    [
      course("A", { credit: 4, category: "Professional Core" }),
      course("B", { credit: 3, category: "Professional Core" }),
      course("C", { credit: 2, category: "Elective" }),
    ],
    [],
  );
  const s = summarizeCourses(rows);
  check("course count", s.courseCount, 3);
  check("total credits", s.totalCredits, 9);
  check("categories sorted by credits desc", s.byCategory.map((c) => c.category), [
    "Professional Core",
    "Elective",
  ]);
  check("core credits summed", s.byCategory[0].credits, 7);
  check("core count", s.byCategory[0].count, 2);
}

// --- summary ignores category-less orphan rows -------------------------------

{
  const rows = buildCourseRows([course("A", { credit: 4 })], [attRow("ORPHAN")]);
  const s = summarizeCourses(rows);
  check("orphan counted in courseCount", s.courseCount, 2);
  check("orphan adds no credits", s.totalCredits, 4);
  check("orphan invents no category bucket", s.byCategory.length, 1);
}

// --- uniqueCourses: the Overview count regression ----------------------------
// A lab-based course is registered twice (theory + lab), both entries carrying
// the same credit. The Overview stat tiles summed the raw list and reported
// 9 courses / 25 credits while Courses, Marks and GPA all said 8 / 21 — two
// different answers to the same question, on the same screen.

{
  const raw = [
    course("21CSC302J", { credit: 4 }), // theory registration
    course("21CSC302J", { credit: 4 }), // lab registration, same course
    course("21MAB302T", { credit: 4 }),
    course("21CSC301T", { credit: 3 }),
  ];

  check("raw list double-counts the course", raw.length, 4);
  check(
    "raw list double-counts its credits",
    raw.reduce((s, c) => s + c.credit, 0),
    15,
  );

  const unique = uniqueCourses(raw);
  check("deduped course count", unique.length, 3);
  check("deduped credit total", unique.reduce((s, c) => s + c.credit, 0), 11);
  check("first registration is the one kept", unique[0].code, "21CSC302J");
  check(
    "order otherwise preserved",
    unique.map((c) => c.code),
    ["21CSC302J", "21MAB302T", "21CSC301T"],
  );

  // The headline count MUST agree with what the Courses page renders.
  check(
    "uniqueCourses agrees with buildCourseRows",
    unique.length,
    buildCourseRows(raw, []).length,
  );
  check(
    "credit total agrees with summarizeCourses",
    unique.reduce((s, c) => s + c.credit, 0),
    summarizeCourses(buildCourseRows(raw, [])).totalCredits,
  );
}

check("uniqueCourses on empty input", uniqueCourses([]).length, 0);
check("uniqueCourses leaves an already-unique list alone", uniqueCourses([course("A"), course("B")]).length, 2);

// --- empty --------------------------------------------------------------------

check("empty input -> empty output", buildCourseRows([], []).length, 0);
check("empty summary total", summarizeCourses([]).totalCredits, 0);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
