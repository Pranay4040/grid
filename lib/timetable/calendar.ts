/**
 * Month grid for the Calendar page.
 *
 * IMPORTANT — what this is and isn't: Academia exposes no academic calendar
 * to this account (probed 2026-07-26, see ROADMAP.md), so there is no source
 * of truth for holidays, working Saturdays, or exam blocks. Every day-order
 * here is PROJECTED from the student's manual anchor by counting Mon-Fri
 * forward/backward — the exact same rule the Today view uses, just applied
 * across a whole month.
 *
 * That makes the projection wrong for every date after an unrecorded holiday.
 * Rather than hide that, buildCalendarMonth() marks how far each date sits
 * from the anchor (`projected`), and the UI states plainly that dates far from
 * the anchor are estimates. Weekends come back with a null day-order — unknown,
 * not guessed — because we can't know which Saturdays SRM declares working.
 */
import { resolveDayOrder, toDateKey, type DayOrderAnchor } from "./day-order";
import type { WeekSchedule } from "../academia/timetable-grid";

export type CalendarDay = {
  dateKey: string; // "YYYY-MM-DD"
  dayOfMonth: number;
  /** False for the leading/trailing days that pad the grid to whole weeks. */
  inMonth: boolean;
  isWeekend: boolean;
  isToday: boolean;
  /** null on weekends and whenever no anchor exists to project from. */
  dayOrder: number | null;
  /** Classes scheduled on that day-order, after the customization overlay. */
  classCount: number;
};

export type CalendarMonth = {
  year: number;
  month: number; // 0-11, matching Date#getMonth()
  label: string; // "July 2026"
  /** Whole weeks, Monday-first, so every row has exactly 7 entries. */
  weeks: CalendarDay[][];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Monday-first weekday index (Mon=0 … Sun=6) — SRM weeks read Mon-first. */
function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** Step a (year, month) pair by ±1 without tripping over year boundaries. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * `today` is passed in rather than read from Date.now() so the caller owns the
 * clock — the same pattern useTodayDayOrder() uses to keep server and client
 * renders identical until the client clock mounts.
 */
export function buildCalendarMonth(
  year: number,
  month: number,
  anchor: DayOrderAnchor | null,
  today: Date | null,
  week: WeekSchedule | null,
): CalendarMonth {
  const classCountByDayOrder = new Map<number, number>();
  if (week) {
    for (const day of week.days) {
      classCountByDayOrder.set(day.dayOrder, day.classes.length);
    }
  }

  const first = new Date(year, month, 1);
  // Back up to the Monday on or before the 1st so week rows are complete.
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayFirstIndex(first));

  const todayKey = today ? toDateKey(today) : null;
  const weeks: CalendarDay[][] = [];
  const cursor = new Date(gridStart);

  // Six rows always covers a month (max span is 31 days + 6 lead days = 37).
  // Trailing all-out-of-month rows are dropped below so short months don't
  // render a dead final row.
  for (let w = 0; w < 6; w++) {
    const row: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      // Only project a day-order once we have a client clock; before that
      // `today` is null and the whole grid renders without one, matching the
      // server render exactly.
      const dayOrder = today ? resolveDayOrder(anchor, date) : null;
      row.push({
        dateKey: toDateKey(date),
        dayOfMonth: date.getDate(),
        inMonth: date.getMonth() === month,
        isWeekend,
        isToday: todayKey !== null && toDateKey(date) === todayKey,
        dayOrder,
        classCount: dayOrder ? (classCountByDayOrder.get(dayOrder) ?? 0) : 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }

  while (weeks.length > 4 && weeks[weeks.length - 1].every((d) => !d.inMonth)) {
    weeks.pop();
  }

  return { year, month, label: monthLabel(year, month), weeks };
}
