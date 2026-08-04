/**
 * Sanity-check buildCalendarMonth() + the signed day-order projection it
 * depends on. Synthetic fixtures only, no live session needed.
 *
 * The backward-projection checks are the point of this file: resolveDayOrder()
 * used to return the anchor's own day-order for EVERY date before the anchor
 * (its working-day count was unsigned), which the Today view never exercised
 * but a month grid hits on every render.
 *
 *   npx tsx scripts/verify-calendar.ts
 */
import { buildCalendarMonth, shiftMonth, monthLabel } from "../lib/timetable/calendar";
import { resolveDayOrder } from "../lib/timetable/day-order";
import type { WeekSchedule } from "../lib/academia/timetable-grid";

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

const d = (key: string) => {
  const [y, m, dd] = key.split("-").map(Number);
  return new Date(y, m - 1, dd);
};

/* --------------------------------------------------------------------------
   Day-order projection, forward AND backward.
   2026-07-30 is a Thursday; anchor it to day-order 3.
   Mon 27 = 5, Tue 28 = 1, Wed 29 = 2, Thu 30 = 3, Fri 31 = 4.
-------------------------------------------------------------------------- */

const anchor = { date: "2026-07-30", dayOrder: 3 };

check("anchor date returns its own day-order", resolveDayOrder(anchor, d("2026-07-30")), 3);
check("one working day forward", resolveDayOrder(anchor, d("2026-07-31")), 4);
check("one working day back", resolveDayOrder(anchor, d("2026-07-29")), 2);
check("two working days back", resolveDayOrder(anchor, d("2026-07-28")), 1);
check("three working days back wraps to 5", resolveDayOrder(anchor, d("2026-07-27")), 5);
check("weekend is unknown, not guessed", resolveDayOrder(anchor, d("2026-08-01")), null);

// Across a weekend: Mon 2026-08-03 is 1 working day after Fri 07-31 (=4) -> 5.
check("projects across a weekend forward", resolveDayOrder(anchor, d("2026-08-03")), 5);
// Fri 2026-07-24 is 4 working days before the anchor: 3 -> 2,1,5,4.
check("projects across a weekend backward", resolveDayOrder(anchor, d("2026-07-24")), 4);

// A full 5-working-day round trip returns to the same day-order.
check("5 working days forward is a full cycle", resolveDayOrder(anchor, d("2026-08-06")), 3);
check("5 working days back is a full cycle", resolveDayOrder(anchor, d("2026-07-23")), 3);

// No anchor at all: bare weekday guess, null on weekends.
check("no anchor -> weekday guess", resolveDayOrder(null, d("2026-07-29")), 3);
check("no anchor on a weekend -> null", resolveDayOrder(null, d("2026-08-01")), null);

/* --------------------------------------------------------------------------
   Month grid shape
-------------------------------------------------------------------------- */

const week: WeekSchedule = {
  days: [
    { dayOrder: 1, classes: [{}, {}] },
    { dayOrder: 2, classes: [{}] },
    { dayOrder: 3, classes: [] },
    { dayOrder: 4, classes: [{}, {}, {}] },
    { dayOrder: 5, classes: [{}] },
  ],
  unplaced: [],
} as unknown as WeekSchedule;

{
  const m = buildCalendarMonth(2026, 6, anchor, d("2026-07-30"), week); // July 2026
  check("label", m.label, "July 2026");
  check("every row is a full week", m.weeks.every((w) => w.length === 7), true);
  check("first cell of the grid is a Monday", m.weeks[0][0].dateKey, "2026-06-29");

  const all = m.weeks.flat();
  check("July has 31 in-month days", all.filter((c) => c.inMonth).length, 31);
  check("no trailing all-padding row", m.weeks[m.weeks.length - 1].some((c) => c.inMonth), true);

  const jul30 = all.find((c) => c.dateKey === "2026-07-30")!;
  check("today flagged", jul30.isToday, true);
  check("today carries the anchor day-order", jul30.dayOrder, 3);
  check("day-order 3 has 0 classes", jul30.classCount, 0);

  const jul31 = all.find((c) => c.dateKey === "2026-07-31")!;
  check("next working day projects to 4", jul31.dayOrder, 4);
  check("day-order 4 has 3 classes", jul31.classCount, 3);

  const sat = all.find((c) => c.dateKey === "2026-08-01")!;
  check("weekend flagged", sat.isWeekend, true);
  check("weekend has no day-order", sat.dayOrder, null);
  check("weekend has no classes", sat.classCount, 0);

  const jul27 = all.find((c) => c.dateKey === "2026-07-27")!;
  check("past date projects backward, not to the anchor", jul27.dayOrder, 5);
}

// Before the client clock mounts there's no `today` — the grid must render
// without projecting anything, so server and client markup match.
{
  const m = buildCalendarMonth(2026, 6, anchor, null, week);
  const all = m.weeks.flat();
  check("no clock -> no day-orders at all", all.every((c) => c.dayOrder === null), true);
  check("no clock -> nothing marked today", all.every((c) => !c.isToday), true);
  check("no clock -> no class counts", all.every((c) => c.classCount === 0), true);
}

// February 2026 starts on a Sunday — the worst case for Monday-first padding.
{
  const m = buildCalendarMonth(2026, 1, anchor, d("2026-07-30"), week);
  check("Feb 2026 label", m.label, "February 2026");
  check("Feb 2026 has 28 in-month days", m.weeks.flat().filter((c) => c.inMonth).length, 28);
  check("Feb rows still full weeks", m.weeks.every((w) => w.length === 7), true);
}

// A null week schedule must not crash the grid.
{
  const m = buildCalendarMonth(2026, 6, anchor, d("2026-07-30"), null);
  check("null week -> zero class counts", m.weeks.flat().every((c) => c.classCount === 0), true);
}

/* --------------------------------------------------------------------------
   Month arithmetic
-------------------------------------------------------------------------- */

check("shift forward across a year", shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
check("shift back across a year", shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
check("shift within a year", shiftMonth(2026, 6, 1), { year: 2026, month: 7 });
check("monthLabel", monthLabel(2027, 0), "January 2027");

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
