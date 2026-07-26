/**
 * Reconciles every registered course against the scraped SubjectMarks rows
 * for the read-only Marks page — a course with no marks row yet still shows
 * (status "awaiting"), and a marks row without a matching course still
 * surfaces too. Same "nothing silently vanishes" contract as
 * attendance-cards.ts's buildAttendanceCards().
 */
import type { Course, MarkComponent, SubjectMarks } from "./data-types";

export type MarksRow = {
  code: string;
  title: string;
  /** null when this row came from a marks entry with no matching course. */
  credit: number | null;
  courseType: string;
  /** "graded" iff components.length > 0 — always "awaiting" today, since
   *  Academia's assessment data is empty until CTs are held. */
  status: "graded" | "awaiting";
  components: MarkComponent[];
};

export function buildMarksRows(courses: Course[], marks: SubjectMarks[]): MarksRow[] {
  const marksByCode = new Map<string, SubjectMarks>();
  for (const m of marks) if (!marksByCode.has(m.code)) marksByCode.set(m.code, m);

  const seen = new Set<string>();
  const rows: MarksRow[] = [];
  for (const course of courses) {
    if (seen.has(course.code)) continue; // dedupe — a course can have both a
    seen.add(course.code); // theory row and a lab row sharing one code
    const m = marksByCode.get(course.code);
    const components = m?.components ?? [];
    rows.push({
      code: course.code,
      title: course.title,
      credit: course.credit,
      courseType: m?.courseType ?? course.courseType,
      status: components.length > 0 ? "graded" : "awaiting",
      components,
    });
  }

  const extra = marks
    .filter((m) => !seen.has(m.code))
    .sort((a, b) => a.code.localeCompare(b.code));
  for (const m of extra) {
    rows.push({
      code: m.code,
      title: "",
      credit: null,
      courseType: m.courseType,
      status: m.components.length > 0 ? "graded" : "awaiting",
      components: m.components,
    });
  }

  return rows;
}
