/**
 * Builds the Courses page's rows: the full registration detail Academia holds
 * for each course (credit, category, type, faculty, slot, room), joined to
 * whatever attendance has accrued against it.
 *
 * A single course code can carry BOTH a Theory and a Practical attendance row
 * (they're tracked independently by SRM), so attendance is a list per course
 * rather than one number — the same split attendance-cards.ts preserves.
 *
 * Same "nothing silently vanishes" contract as buildMarksRows()/
 * buildAttendanceCards(): every registered course produces a row, and a
 * course code that only appears in attendance still surfaces.
 */
import type { AttendanceRow, Course } from "./data-types";

export type CourseAttendance = {
  category: string; // "Theory" | "Practical"
  percent: number;
  conducted: number;
  absent: number;
};

export type CourseRow = {
  code: string;
  title: string;
  /** null when the row came from attendance with no matching registration. */
  credit: number | null;
  category: string;
  courseType: string;
  faculty: string;
  slot: string;
  room: string;
  /** Empty until a class has actually been conducted for this course. */
  attendance: CourseAttendance[];
};

export type CoursesSummary = {
  courseCount: number;
  totalCredits: number;
  /** Credit total per category, highest first — e.g. Professional Core: 12. */
  byCategory: { category: string; count: number; credits: number }[];
};

/**
 * Academia appends the staff ID to faculty names ("Dr.Maivizhi R (103033)").
 * The ID is noise for a student reading the page, so it's dropped for display
 * — but only when it's clearly that trailing all-digit tag, never mid-name
 * text that happens to sit in parentheses.
 */
export function cleanFaculty(raw: string): string {
  return raw.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/**
 * Registered courses deduped by code.
 *
 * A course registered as both theory and lab (e.g. a "Lab Based Theory"
 * course) appears TWICE in the scrape, and both entries carry the same credit
 * value — so summing the raw list both over-counts the course and
 * double-counts its credits. Anything reporting "how many courses / how many
 * credits" must go through this, or it will disagree with the Courses, Marks
 * and GPA pages, which all dedupe.
 */
export function uniqueCourses(courses: Course[]): Course[] {
  const seen = new Set<string>();
  const out: Course[] = [];
  for (const c of courses) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    out.push(c);
  }
  return out;
}

export function buildCourseRows(
  courses: Course[],
  attendance: AttendanceRow[],
): CourseRow[] {
  // Group attendance by code — a code can legitimately have several rows
  // (Theory + Practical), and each keeps its own percentage.
  const attByCode = new Map<string, CourseAttendance[]>();
  for (const row of attendance) {
    const list = attByCode.get(row.code) ?? [];
    list.push({
      category: row.category,
      percent: row.attendancePct,
      conducted: row.hoursConducted,
      absent: row.hoursAbsent,
    });
    attByCode.set(row.code, list);
  }

  const seen = new Set<string>();
  const rows: CourseRow[] = [];

  for (const course of courses) {
    // A course registered as both theory and lab appears twice in `courses`;
    // the first entry carries the detail we show, so dedupe on code.
    if (seen.has(course.code)) continue;
    seen.add(course.code);
    rows.push({
      code: course.code,
      title: course.title,
      credit: course.credit,
      category: course.category,
      courseType: course.courseType,
      faculty: cleanFaculty(course.faculty),
      slot: course.slot,
      room: course.room,
      attendance: attByCode.get(course.code) ?? [],
    });
  }

  // Attendance rows with no registration entry — surfaced rather than dropped.
  const orphans = [...attByCode.keys()]
    .filter((code) => !seen.has(code))
    .sort((a, b) => a.localeCompare(b));
  for (const code of orphans) {
    const first = attendance.find((r) => r.code === code)!;
    rows.push({
      code,
      title: first.title,
      credit: null,
      category: "",
      courseType: first.category,
      faculty: cleanFaculty(first.faculty),
      slot: first.slot,
      room: first.room,
      attendance: attByCode.get(code) ?? [],
    });
  }

  return rows;
}

export function summarizeCourses(rows: CourseRow[]): CoursesSummary {
  const byCategory = new Map<string, { count: number; credits: number }>();
  let totalCredits = 0;

  for (const row of rows) {
    totalCredits += row.credit ?? 0;
    // Rows with no registration record have no category to group under;
    // counting them as "" would invent a bucket that isn't real.
    if (!row.category) continue;
    const entry = byCategory.get(row.category) ?? { count: 0, credits: 0 };
    entry.count++;
    entry.credits += row.credit ?? 0;
    byCategory.set(row.category, entry);
  }

  return {
    courseCount: rows.length,
    totalCredits,
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.credits - a.credits || a.category.localeCompare(b.category)),
  };
}
