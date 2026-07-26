/**
 * "Can I skip today's class and still be safe?" — per-row attendance math.
 *
 * Academia tracks Theory and Practical for a course as two independent rows
 * with their own hour counts, so this plans each row separately rather than
 * blending them into one per-course figure.
 *
 * All math is done on the row's own hoursConducted/hoursAbsent (recomputed,
 * integer arithmetic) rather than trusting the portal's rounded
 * `attendancePct` — avoids boundary drift from display rounding.
 */
import type { AttendanceRow } from "./data-types";

export const ATTENDANCE_THRESHOLD = 75;

export type PlanStatus = "safe" | "tight" | "recover";

export type AttendancePlan = {
  code: string;
  title: string;
  category: string;
  conducted: number;
  attended: number;
  /** Recomputed, exact — not the portal's (possibly rounded) attendancePct. */
  percent: number;
  status: PlanStatus;
  /** Max consecutive classes that can still be missed and stay >= threshold. 0 when status === "recover". */
  skips: number;
  /** Consecutive classes that must be attended (none missed) to reach the threshold. 0 unless status === "recover". */
  mustAttend: number;
};

/**
 * Rows with hoursConducted === 0 are omitted entirely — nothing to plan yet
 * (same convention dashboard.ts uses to exclude them from the average).
 * Sorted by urgency: recover (worst mustAttend first), then tight, then safe
 * (fewest skips first).
 */
export function planAttendance(
  rows: AttendanceRow[],
  threshold: number = ATTENDANCE_THRESHOLD,
): AttendancePlan[] {
  const plans: AttendancePlan[] = [];

  for (const r of rows) {
    if (r.hoursConducted <= 0) continue;

    const conducted = r.hoursConducted;
    const attended = conducted - r.hoursAbsent;
    const percent = (attended * 100) / conducted;

    let status: PlanStatus;
    let skips = 0;
    let mustAttend = 0;

    if (100 * attended >= threshold * conducted) {
      skips = Math.max(0, Math.floor((100 * attended - threshold * conducted) / threshold));
      status = skips <= 1 ? "tight" : "safe";
    } else {
      mustAttend = Math.max(
        1,
        Math.ceil((threshold * conducted - 100 * attended) / (100 - threshold)),
      );
      status = "recover";
    }

    plans.push({
      code: r.code,
      title: r.title,
      category: r.category,
      conducted,
      attended,
      percent,
      status,
      skips,
      mustAttend,
    });
  }

  const rank: Record<PlanStatus, number> = { recover: 0, tight: 1, safe: 2 };
  return plans.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === "recover") return b.mustAttend - a.mustAttend;
    return a.skips - b.skips;
  });
}
