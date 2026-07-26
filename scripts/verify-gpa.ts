/**
 * Sanity-check the GPA estimation math against hand-worked fixtures — no
 * test framework in this repo, same convention as verify-custom.ts /
 * verify-attendance-planner.ts.
 */
import {
  markToGrade,
  estimateSubject,
  estimateSemester,
  gradeRequirements,
  EXTERNAL_WEIGHT,
  type SubjectEstimate,
} from "../lib/academia/gpa";
import type { Course, SubjectMarks } from "../lib/academia/data-types";

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

function course(code: string, credit: number, title = `Course ${code}`): Course {
  return {
    code,
    title,
    credit,
    category: "Core",
    courseType: "Theory",
    faculty: "Dr. X",
    slot: "A",
    room: "R1",
    academicYear: "AY2026-27-ODD",
  };
}

// --- markToGrade: exact boundary checks -------------------------------------

check("markToGrade 90 -> A+", markToGrade(90), "A+");
check("markToGrade 91 -> O", markToGrade(91), "O");
check("markToGrade 80 -> A", markToGrade(80), "A");
check("markToGrade 81 -> A+", markToGrade(81), "A+");
check("markToGrade 55 -> C", markToGrade(55), "C");
check("markToGrade 56 -> B", markToGrade(56), "B");
check("markToGrade 49 -> RA", markToGrade(49), "RA");
check("markToGrade 50 -> C", markToGrade(50), "C");
check("markToGrade 0 -> RA", markToGrade(0), "RA");
check("markToGrade 100 -> O", markToGrade(100), "O");

// --- estimateSubject ---------------------------------------------------------

{
  const c = course("21ABC101", 4);
  const bothSet: SubjectEstimate = { internal: 20, external: 60 };
  const r = estimateSubject(c, 10, bothSet);
  check("estimateSubject: totalInternal = portal + estimate", r.totalInternal, 30);
  check(
    "estimateSubject: external 60/75 converts exactly to 32",
    r.externalConverted,
    60 * EXTERNAL_WEIGHT,
  );
  check("estimateSubject: totalMark = 30 + 32 = 62", r.totalMark, 30 + 60 * EXTERNAL_WEIGHT);
  check("estimateSubject: grade for totalMark ~62 is B+", r.grade, "B+");
  check("estimateSubject: points for B+ is 7", r.points, 7);
}

{
  const c = course("21ABC102", 3);
  const internalOnly: SubjectEstimate = { internal: 30, external: null };
  const r = estimateSubject(c, 0, internalOnly);
  check("estimateSubject: only internal set -> totalMark null", r.totalMark, null);
  check("estimateSubject: only internal set -> grade null", r.grade, null);
  check("estimateSubject: only internal set -> points null", r.points, null);
  check("estimateSubject: totalInternal still computed", r.totalInternal, 30);
  check("estimateSubject: externalConverted stays null", r.externalConverted, null);
}

{
  const c = course("21ABC103", 3);
  const neitherSet: SubjectEstimate = { internal: null, external: null };
  const r = estimateSubject(c, 5, neitherSet);
  check("estimateSubject: nothing entered -> totalInternal null", r.totalInternal, null);
  check("estimateSubject: nothing entered -> totalMark null", r.totalMark, null);
}

// --- estimateSemester ---------------------------------------------------------

{
  const courses = [course("21A", 4), course("21B", 3), course("21C", 3)];
  const marks: SubjectMarks[] = [];
  const r = estimateSemester(courses, marks, {});
  check("estimateSemester: nothing estimated -> sgpa null", r.sgpa, null);
  check("estimateSemester: nothing estimated -> estimatedCount 0", r.estimatedCount, 0);
  check("estimateSemester: totalCount matches courses", r.totalCount, 3);
  check("estimateSemester: totalCredits sums correctly", r.totalCredits, 10);
}

{
  // Hand-worked: 4cr O(10) + 3cr B+(7) + 3cr C(5) = (40+21+15)/10 = 7.6
  const courses = [course("21A", 4), course("21B", 3), course("21C", 3)];
  const estimates = {
    "21A": { internal: 60, external: 75 }, // total 100 -> O
    "21B": { internal: 40, external: 45 }, // total 40 + 45*40/75=24 = 64 -> B+
    "21C": { internal: 30, external: 30 }, // total 30 + 30*40/75=16 = 46 -> RA... adjust
  };
  // Recompute 21C to land squarely on C (50-55): internal 35 + external 40*40/75? keep simple:
  // total needs to be in [50,55]. internal 35 + external 30 -> converted 16 -> total 51 -> C(5)
  estimates["21C"] = { internal: 35, external: 30 };
  const r = estimateSemester(courses, [], estimates);
  check("estimateSemester: all estimated -> estimatedCount 3", r.estimatedCount, 3);
  const expectedSgpa = (4 * 10 + 3 * 7 + 3 * 5) / 10;
  check("estimateSemester: hand-worked weighted SGPA", r.sgpa, expectedSgpa);
  check("estimateSemester: estimatedCredits === totalCredits", r.estimatedCredits, 10);
}

{
  // Partial: only one of two courses fully estimated.
  const courses = [course("21X", 4), course("21Y", 4)];
  const estimates = {
    "21X": { internal: 60, external: 75 }, // O -> 10
    "21Y": { internal: 30, external: null }, // incomplete
  };
  const r = estimateSemester(courses, [], estimates);
  check("estimateSemester: partial -> estimatedCount 1", r.estimatedCount, 1);
  check("estimateSemester: partial -> sgpa is the complete course's own point", r.sgpa, 10);
  check("estimateSemester: partial -> totalCount still 2", r.totalCount, 2);
  check("estimateSemester: partial -> totalCredits still 8", r.totalCredits, 8);
}

{
  // Single course -> exact point.
  const courses = [course("21Z", 4)];
  const r = estimateSemester(courses, [], { "21Z": { internal: 55, external: 60 } });
  // total = 55 + 60*40/75 = 55 + 32 = 87 -> A+ (9)
  check("estimateSemester: single course sgpa equals its own point", r.sgpa, 9);
}

{
  // Duplicate course code (real data has this: theory + lab rows share a code).
  const courses = [course("21DUP", 4), course("21DUP", 4)];
  const r = estimateSemester(courses, [], {});
  check("estimateSemester: duplicate code counted once", r.totalCount, 1);
}

{
  // portalInternal wired from real SubjectMarks.components.
  const courses = [course("21W", 4)];
  const marks: SubjectMarks[] = [
    { code: "21W", courseType: "Theory", components: [{ label: "CT-I", scored: 12, max: 15 }] },
  ];
  const r = estimateSemester(courses, marks, { "21W": { internal: 10, external: 40 } });
  check("estimateSemester: portalInternal summed from components", r.subjects[0].portalInternal, 12);
  check("estimateSemester: totalInternal = portal + estimate", r.subjects[0].totalInternal, 22);
}

// --- gradeRequirements ---------------------------------------------------------

{
  const reqs = gradeRequirements(0);
  const oReq = reqs.find((r) => r.grade === "O")!;
  check("gradeRequirements(0): O status unreachable", oReq.status, "unreachable");
  check(
    "gradeRequirements(0): O required raw = ceil(91 * 75/40) = 171",
    oReq.requiredExternalRaw,
    Math.ceil(91 / EXTERNAL_WEIGHT),
  );
  const raReq = reqs.find((r) => r.grade === "RA")!;
  check("gradeRequirements(0): RA is always secured", raReq.status, "secured");
  check("gradeRequirements(0): RA has no required raw mark", raReq.requiredExternalRaw, null);
}

{
  // Max internal (60) alone doesn't secure the top grades (O needs a 91
  // total, 60 < 91) — it just makes every grade reachable via external,
  // since even the largest gap (O: 31 converted points short) needs only
  // ceil(31 / (40/75)) = 59 raw marks, comfortably under the 75 cap.
  const reqs = gradeRequirements(60);
  check(
    "gradeRequirements(60): nothing is unreachable",
    reqs.every((r) => r.status !== "unreachable"),
    true,
  );
  const secured = reqs.filter((r) => r.status === "secured").map((r) => r.grade);
  check("gradeRequirements(60): RA/C/B secured by internal alone", secured, ["B", "C", "RA"]);
  const oReq = reqs.find((r) => r.grade === "O")!;
  check("gradeRequirements(60): O reachable, needs 59/75", oReq.status, "reachable");
  check("gradeRequirements(60): O raw mark is 59", oReq.requiredExternalRaw, 59);
}

{
  const reqs = gradeRequirements(45);
  const bReq = reqs.find((r) => r.grade === "B")!; // needs total >= 56
  // requiredConverted = 56 - 45 = 11; raw = ceil(11 / (40/75)) = ceil(20.625) = 21
  check("gradeRequirements(45): B raw mark ceil-rounds to 21", bReq.requiredExternalRaw, 21);
  check("gradeRequirements(45): B is reachable", bReq.status, "reachable");

  const oReq = reqs.find((r) => r.grade === "O")!; // needs total >= 91
  // requiredConverted = 91 - 45 = 46; raw = ceil(46 / (40/75)) = ceil(86.25) = 87 -> unreachable
  check("gradeRequirements(45): O raw mark 87 exceeds 75 -> unreachable", oReq.status, "unreachable");
  check("gradeRequirements(45): O raw mark computed as 87", oReq.requiredExternalRaw, 87);
}

{
  // Exact boundary: raw === 75 (reachable) vs raw === 76 (unreachable).
  // requiredConverted such that raw = ceil(requiredConverted / (40/75)) = 75
  // => requiredConverted in (74*(40/75), 75*(40/75)] = (39.4667, 40]
  const totalInternalFor75 = 91 - 40; // requiredConverted exactly 40 -> raw = ceil(40/(40/75)) = 75
  const req75 = gradeRequirements(totalInternalFor75).find((r) => r.grade === "O")!;
  check("gradeRequirements boundary: raw exactly 75 is reachable", req75.status, "reachable");
  check("gradeRequirements boundary: raw value is 75", req75.requiredExternalRaw, 75);

  const totalInternalFor76 = totalInternalFor75 - 1; // one less internal mark
  const req76 = gradeRequirements(totalInternalFor76).find((r) => r.grade === "O")!;
  check("gradeRequirements boundary: raw > 75 is unreachable", req76.status, "unreachable");
}

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
