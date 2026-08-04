/**
 * Resolve today's SRM day-order (1-5) for the "Today / Now" view.
 *
 * SRM's rotation skips holidays, so it can't be derived from the weekday
 * alone. Verified 2026-07-26 (`scripts/probe-day-order.ts`, see
 * `ROADMAP.md`) that Academia exposes no day-order or calendar/planner view
 * to this account — every `Academic_Planner_*`/`Calendar` page either 404s
 * or 403s, and the two current-year planner pages that do return 200 render
 * an empty shell. The manual anchor below is the permanent source of record,
 * not a placeholder — re-probe only if SRM changes what this account can see.
 *
 * The anchor the student confirms once ("today is day order N") advances by
 * one working day at a time. A wrong guess after a holiday is a single
 * correction, and every day after inherits the fix. Since we can't verify a
 * correction against a real calendar, `workingDaysSinceAnchor` flags one that
 * hasn't been reconfirmed in a while as likely drifted (see day-order-store.ts).
 */

export type DayOrderAnchor = { date: string; dayOrder: number };

/** Local-time midnight for a "YYYY-MM-DD" key, avoiding UTC day-shift bugs. */
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Signed count of Mon–Fri dates strictly between `from` and `to`, counting
 * `to` itself: positive when `to` is after `from`, negative when before, 0 on
 * the same date.
 *
 * The sign matters for the calendar, which projects the anchor both forward
 * AND backward across a whole month. An earlier unsigned version returned 0
 * for every date before the anchor, which made every past weekday report the
 * anchor's own day-order.
 */
function workingDaysBetweenExclusive(from: Date, to: Date): number {
  if (toDateKey(from) === toDateKey(to)) return 0;
  const forward = to > from;
  const [start, end] = forward ? [from, to] : [to, from];

  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  while (cur <= end) {
    if (!isWeekend(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return forward ? count : -count;
}

/**
 * Returns the anchor's day-order directly when `today` IS the anchor date —
 * even on a weekend, since SRM does hold working Saturdays sometimes and a
 * student correcting "today is day order N" is ground truth for that day
 * regardless of what the calendar weekday suggests. Only *projecting*
 * forward assumes Mon–Fri are the working days (we have no calendar telling
 * us which future weekends are working days, so those come back null —
 * unknown rather than guessed). With no anchor at all: null on a plain
 * weekend, otherwise the rough weekday guess (Mon→1 … Fri→5).
 */
export function resolveDayOrder(
  anchor: DayOrderAnchor | null,
  today: Date,
): number | null {
  if (anchor) {
    const anchorDate = parseDateKey(anchor.date);
    if (toDateKey(anchorDate) === toDateKey(today)) return anchor.dayOrder;
    if (isWeekend(today)) return null;
    const diff = workingDaysBetweenExclusive(anchorDate, today);
    // Floored modulo — `diff` is negative for dates before the anchor, and
    // JS's `%` keeps the sign of the dividend, so a bare `% 5` would land
    // outside 1-5 when projecting backward.
    const rotated = (((anchor.dayOrder - 1 + diff) % 5) + 5) % 5;
    return rotated + 1;
  }

  if (isWeekend(today)) return null;
  return today.getDay(); // Date#getDay(): Mon=1 … Fri=5
}

/** Working days since the anchor was set — 0 if today IS the anchor date,
 *  negative for a date before it (see workingDaysBetweenExclusive).
 *  A large positive value means the anchor has been silently projecting
 *  forward for a while with no way to know whether a holiday desynced it. */
export function workingDaysSinceAnchor(anchor: DayOrderAnchor, today: Date): number {
  return workingDaysBetweenExclusive(parseDateKey(anchor.date), today);
}

/** Past this many working days without reconfirmation, treat an anchored
 *  value as "unconfirmed" rather than settled fact — see day-order-store.ts. */
export const STALE_ANCHOR_WORKING_DAYS = 10;

/** "HH:MM" strings compare correctly as plain strings since they're zero-padded. */
export function nowHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
