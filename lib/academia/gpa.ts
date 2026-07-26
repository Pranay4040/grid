/**
 * SGPA estimator modeling SRM's actual 60/40 internal/external split.
 *
 * Each subject is out of 100: 60 marks internal (uploaded to Academia
 * progressively through the semester) + 40 marks external (the end-semester
 * exam, itself written out of 75 and scaled to 40).
 *
 * Internal: whatever Academia has already published is fixed/ground truth
 * (summed from SubjectMarks.components — always 0 today, since components is
 * always [] until assessments are held; this is deliberately NOT trying to
 * classify which future component labels count as "internal" vs "external",
 * since that's unknowable until real labeled data exists). The student types
 * an estimate for the remaining not-yet-published internal marks.
 *
 * External: the student types an estimate on the exam's native 75-mark scale;
 * it's converted to its 40-mark contribution via × 40/75.
 *
 * No clamping happens anywhere in this file — a total that mathematically
 * exceeds 60 or 100 is returned as-is. Surfacing that is the UI's job, not
 * this module's; silently coercing bad input would hide a real data-entry
 * mistake from the student.
 */
import type { Course, SubjectMarks } from "./data-types";

export const GRADE_POINTS = {
  O: 10,
  "A+": 9,
  A: 8,
  "B+": 7,
  B: 6,
  C: 5,
  RA: 0,
} as const;

export type GradeLetter = keyof typeof GRADE_POINTS;

/**
 * Total-mark (/100) → grade cutoffs, highest first, first match wins.
 * COMMONLY-CITED, UNVERIFIED against an official SRM document — confirm
 * before trusting the displayed grade. One-place edit if it's wrong.
 */
export const MARK_GRADE_CUTOFFS: { min: number; grade: GradeLetter }[] = [
  { min: 91, grade: "O" },
  { min: 81, grade: "A+" },
  { min: 71, grade: "A" },
  { min: 61, grade: "B+" },
  { min: 56, grade: "B" },
  { min: 50, grade: "C" },
  { min: 0, grade: "RA" },
];

export function markToGrade(totalMark: number): GradeLetter {
  for (const cutoff of MARK_GRADE_CUTOFFS) {
    if (totalMark >= cutoff.min) return cutoff.grade;
  }
  return "RA";
}

export const INTERNAL_MAX = 60;
export const EXTERNAL_MAX = 75; // the exam's native scale
export const EXTERNAL_WEIGHT = 40 / EXTERNAL_MAX; // converts to the 40-mark contribution

/** One course's estimate inputs — both optional (not-yet-entered), never
 *  defaulted to 0, so a partial entry doesn't silently score as "attempted 0". */
export type SubjectEstimate = { internal: number | null; external: number | null };
export type EstimateMap = Record<string, SubjectEstimate>; // course code -> inputs

export type SubjectResult = {
  code: string;
  title: string;
  credit: number;
  /** From real scraped SubjectMarks.components; always 0 today. */
  portalInternal: number;
  /** Your estimate for the NOT-yet-published remainder. */
  internalEstimate: number | null;
  /** portalInternal + internalEstimate; null iff internalEstimate is null. */
  totalInternal: number | null;
  /** Your estimate, out of 75. */
  externalEstimate: number | null;
  /** externalEstimate * EXTERNAL_WEIGHT; null iff externalEstimate is null. */
  externalConverted: number | null;
  /** totalInternal + externalConverted; null unless BOTH are present. */
  totalMark: number | null;
  grade: GradeLetter | null;
  points: number | null;
};

export function estimateSubject(
  course: Course,
  portalInternal: number,
  estimate: SubjectEstimate,
): SubjectResult {
  const totalInternal =
    estimate.internal === null ? null : portalInternal + estimate.internal;
  const externalConverted =
    estimate.external === null ? null : estimate.external * EXTERNAL_WEIGHT;
  const totalMark =
    totalInternal === null || externalConverted === null
      ? null
      : totalInternal + externalConverted;
  const grade = totalMark === null ? null : markToGrade(totalMark);

  return {
    code: course.code,
    title: course.title,
    credit: course.credit,
    portalInternal,
    internalEstimate: estimate.internal,
    totalInternal,
    externalEstimate: estimate.external,
    externalConverted,
    totalMark,
    grade,
    points: grade === null ? null : GRADE_POINTS[grade],
  };
}

export type SemesterEstimate = {
  /** One per course, timetable order. */
  subjects: SubjectResult[];
  /** Credit-weighted avg over subjects with totalMark !== null; never NaN. */
  sgpa: number | null;
  estimatedCount: number;
  totalCount: number;
  estimatedCredits: number;
  totalCredits: number;
};

export function estimateSemester(
  courses: Course[],
  marks: SubjectMarks[],
  estimates: EstimateMap,
): SemesterEstimate {
  const marksByCode = new Map<string, SubjectMarks>();
  for (const m of marks) if (!marksByCode.has(m.code)) marksByCode.set(m.code, m);

  const seen = new Set<string>();
  const subjects: SubjectResult[] = [];
  for (const course of courses) {
    if (seen.has(course.code)) continue; // dedupe — a course can have both a
    seen.add(course.code); // theory row and a lab row sharing one code
    const portalInternal =
      marksByCode.get(course.code)?.components.reduce((s, c) => s + c.scored, 0) ?? 0;
    const estimate = estimates[course.code] ?? { internal: null, external: null };
    subjects.push(estimateSubject(course, portalInternal, estimate));
  }

  let creditPoints = 0;
  let estimatedCredits = 0;
  let estimatedCount = 0;
  let totalCredits = 0;
  for (const s of subjects) {
    totalCredits += s.credit;
    if (s.totalMark === null || s.points === null) continue;
    estimatedCount++;
    estimatedCredits += s.credit;
    creditPoints += s.credit * s.points;
  }

  return {
    subjects,
    sgpa: estimatedCredits > 0 ? creditPoints / estimatedCredits : null,
    estimatedCount,
    totalCount: subjects.length,
    estimatedCredits,
    totalCredits,
  };
}

/* ---------------------------------------------------------------------------
   Grade slider math — "what external mark do I need for each grade?", given
   a fixed internal total. Pure visualization support: the UI passes
   portalInternal + (internalEstimate ?? 0), a live what-if that is NOT the
   same as the stricter null-when-unset totalInternal used above.
--------------------------------------------------------------------------- */

export type GradeRequirement = {
  grade: GradeLetter;
  /** The cutoff's min, e.g. 81 for A+. */
  requiredTotal: number;
  status: "secured" | "reachable" | "unreachable";
  /** Ceil'd raw /75 mark needed — "at least this" guarantees the grade.
   *  null only for "secured" (no external needed at all). Shown even when
   *  "unreachable" (e.g. 82/75) — surfacing an impossible number is more
   *  informative than hiding it. */
  requiredExternalRaw: number | null;
};

export function gradeRequirements(totalInternal: number): GradeRequirement[] {
  return MARK_GRADE_CUTOFFS.map((cutoff) => {
    const requiredConverted = cutoff.min - totalInternal;
    if (requiredConverted <= 0) {
      return {
        grade: cutoff.grade,
        requiredTotal: cutoff.min,
        status: "secured" as const,
        requiredExternalRaw: null,
      };
    }
    const raw = Math.ceil(requiredConverted / EXTERNAL_WEIGHT);
    return {
      grade: cutoff.grade,
      requiredTotal: cutoff.min,
      status: raw > EXTERNAL_MAX ? ("unreachable" as const) : ("reachable" as const),
      requiredExternalRaw: raw,
    };
  });
}
