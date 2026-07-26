/**
 * Sanity-check applyCustom() and resolveDayOrder() against hand-built fixtures
 * — no test framework is wired up in this project, so this follows the same
 * `npx tsx` verify-script convention as verify-grid.ts / verify-parse.ts.
 */
import { applyCustom, currentAndNextClass, type WeekSchedule } from "../lib/academia/timetable-grid";
import { resolveDayOrder, toDateKey, workingDaysSinceAnchor } from "../lib/timetable/day-order";

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

function course(code: string, title: string) {
  return {
    code,
    title,
    credit: 3,
    category: "Professional Core",
    courseType: "Theory",
    faculty: "Dr. X",
    slot: "A",
    room: "CLS101",
    academicYear: "AY2026-27-ODD",
  };
}

const week: WeekSchedule = {
  days: [
    {
      dayOrder: 1,
      classes: [
        { period: 1, start: "08:00", end: "08:50", course: course("21CSC101", "Data Structures") },
        { period: 2, start: "08:50", end: "09:40", course: course("21CSC102", "Algorithms") },
      ],
    },
    { dayOrder: 2, classes: [] },
    { dayOrder: 3, classes: [] },
    { dayOrder: 4, classes: [] },
    { dayOrder: 5, classes: [] },
  ],
  unplaced: [course("21CSL201", "Networks Lab")],
};

// --- applyCustom -----------------------------------------------------------

const removed = applyCustom(week, { optional: [], removed: ["21CSC102"], added: [] });
check("removed course disappears from its day", removed.days[0].classes.map((c) => c.course.code), ["21CSC101"]);

const optional = applyCustom(week, { optional: ["21CSC101"], removed: [], added: [] });
check("optional flag set on the matching course", optional.days[0].classes[0].optional, true);
check("non-optional course left untouched", optional.days[0].classes[1].optional, undefined);

const added = applyCustom(week, {
  optional: [],
  removed: [],
  added: [{ id: "c1", title: "Guitar club", dayOrder: 1, period: 3 }],
});
check(
  "added custom class appears on the right day/period",
  added.days[0].classes.map((c) => ({ period: c.period, title: c.course.title, custom: c.custom })),
  [
    { period: 1, title: "Data Structures", custom: undefined },
    { period: 2, title: "Algorithms", custom: undefined },
    { period: 3, title: "Guitar club", custom: true },
  ],
);

const removedLab = applyCustom(week, { optional: [], removed: ["21CSL201"], added: [] });
check("removed course also clears from unplaced", removedLab.unplaced.length, 0);

// --- currentAndNextClass -----------------------------------------------------

const cn = currentAndNextClass(week.days[0].classes, "08:10");
check("current class detected mid-period", cn.current?.course.code, "21CSC101");
check("next class detected", cn.next?.course.code, "21CSC102");

const optionalExcluded = currentAndNextClass(
  [{ ...week.days[0].classes[0], optional: true }, week.days[0].classes[1]],
  "08:10",
);
check("optional class excluded from current", optionalExcluded.current, undefined);

// --- resolveDayOrder ---------------------------------------------------------

// Derive Mon/Fri/next-Mon/Sat relative to *some* Monday rather than trusting
// memorized weekdays for hardcoded dates — keeps the fixture self-consistent.
const mon = new Date(2026, 6, 1);
while (mon.getDay() !== 1) mon.setDate(mon.getDate() + 1);
const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
const nextMon = new Date(mon); nextMon.setDate(mon.getDate() + 7);

check("no anchor: weekday guess for Monday", resolveDayOrder(null, mon), 1);
check("weekend returns null", resolveDayOrder(null, sat), null);

const anchor = { date: toDateKey(mon), dayOrder: 3 };
check("same-day anchor returns anchor value", resolveDayOrder(anchor, mon), 3);
// Tue,Wed,Thu,Fri = 4 working days after the anchor: (3-1+4)%5+1 = 2
check("anchor advances one working day at a time", resolveDayOrder(anchor, fri), 2);
// +5 working days (Tue..Fri, then Mon) wraps back near the start: (3-1+5)%5+1 = 3
check("anchor wraps across the weekend", resolveDayOrder(anchor, nextMon), 3);

// A same-day correction must win even on a weekend (SRM sometimes runs a
// working Saturday) — this used to be silently overridden by a hardcoded
// "weekend = no classes" check that ran before the anchor was even read.
const satAnchor = { date: toDateKey(sat), dayOrder: 4 };
check("same-day anchor wins on a weekend", resolveDayOrder(satAnchor, sat), 4);
// Projecting forward from a working-Saturday anchor still treats an
// *ordinary* future weekend as unknown, since we don't know it's a working day.
const satPlusOneWeek = new Date(sat); satPlusOneWeek.setDate(sat.getDate() + 7);
check("projecting onto a later weekend is unknown", resolveDayOrder(satAnchor, satPlusOneWeek), null);

// --- workingDaysSinceAnchor ---------------------------------------------------

check(
  "workingDaysSinceAnchor: same day is 0",
  workingDaysSinceAnchor({ date: toDateKey(mon), dayOrder: 1 }, mon),
  0,
);
check(
  "workingDaysSinceAnchor: Friday anchor to the next Monday is 1",
  workingDaysSinceAnchor({ date: toDateKey(fri), dayOrder: 1 }, nextMon),
  1,
);
const monPlus14 = new Date(mon);
monPlus14.setDate(mon.getDate() + 14);
check(
  "workingDaysSinceAnchor: +14 calendar days (2 weekends) is 10 working days",
  workingDaysSinceAnchor({ date: toDateKey(mon), dayOrder: 1 }, monPlus14),
  10,
);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
