/**
 * Regression check for how composeDashboard() folds two page fetches into one
 * dashboard. These are the decisions that have broken the app twice:
 *
 *   1. Treating "couldn't parse" as "logged out", which told people with a
 *      correct password that their session had expired, forever.
 *   2. Treating ANY missing page as a whole-dashboard failure. When SRM moved
 *      attendance off Academia to the Student Portal (Sept 2026), that took the
 *      timetable, courses and calendar down with it — every page dead over one
 *      page those three never needed.
 *
 * Pure/offline — fixtures only, no session or network needed.
 */
import { composeDashboard } from "../lib/academia/dashboard-data";
import type { PageResult } from "../lib/academia/data";
import type { AttendanceData, TimetableData } from "../lib/academia/data-types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

const student = {
  registrationNumber: "RA0000000000000",
  name: "Test",
  program: "B.Tech",
  department: "CSE",
  specialization: "",
  semester: "3",
  batch: "1",
};

const timetable: PageResult<TimetableData> = {
  ok: true,
  view: "My_Time_Table_2023_24",
  data: {
    student,
    title: "My Time Table",
    courses: [
      {
        code: "21CSC302J",
        title: "Computer Networks",
        credit: 4,
        category: "Professional Core",
        courseType: "Theory",
        faculty: "Dr Someone",
        slot: "A",
        room: "CLS524",
        academicYear: "AY2026-27-ODD",
      },
    ],
  },
};

const attendance: PageResult<AttendanceData> = {
  ok: true,
  view: "My_Attendance",
  data: {
    student,
    rows: [
      {
        code: "21CSC302J",
        title: "Computer Networks",
        category: "Theory",
        faculty: "Dr Someone",
        slot: "A",
        room: "CLS524",
        hoursConducted: 10,
        hoursAbsent: 4,
        attendancePct: 60,
      },
    ],
    marks: [],
  },
};

const attendanceGone: PageResult<AttendanceData> = {
  ok: false,
  reason: "unreadable",
  detail: "My_Attendance: HTTP 404, 812 bytes, no view container.",
};
const timetableGone: PageResult<TimetableData> = {
  ok: false,
  reason: "unreadable",
  detail: "No timetable view found.",
};
const deadSession = {
  ok: false as const,
  reason: "logged_out" as const,
  detail: "Academia served its sign-in shell.",
};

/* ------------------------------ happy path ------------------------------ */

const full = composeDashboard(timetable, attendance);
check("both pages present -> ok", full.ok, true);
check("attendance is populated", full.ok ? full.data.attendance !== null : "(failed)", true);
check("no attendance issue is recorded", full.ok ? full.data.attendanceIssue : "x", null);
check("average attendance is computed", full.ok ? full.data.summary.avgAttendance : -1, 60);
check("below-threshold counts the 60% course", full.ok ? full.data.summary.belowThreshold : -1, 1);

/* ------------------- attendance gone: MUST still render ------------------- */

const degraded = composeDashboard(timetable, attendanceGone);
check("attendance missing is NOT fatal", degraded.ok, true);
check(
  "the timetable still comes through",
  degraded.ok ? degraded.data.timetable.courses.length : -1,
  1,
);
check(
  "the week grid is still built",
  degraded.ok ? degraded.data.week.days.length > 0 : false,
  true,
);
check("courses/credits still counted", degraded.ok ? degraded.data.summary.totalCredits : -1, 4);
check("attendance is explicitly null", degraded.ok ? degraded.data.attendance : "x", null);
check(
  "and the reason is carried for the UI",
  degraded.ok ? degraded.data.attendanceIssue : null,
  attendanceGone.ok ? null : attendanceGone.detail,
);
// A confident 0 here would read as "nothing below 75%", which is a claim we
// have no source for.
check(
  "belowThreshold is null, not 0, with no source",
  degraded.ok ? degraded.data.summary.belowThreshold : -1,
  null,
);
check(
  "avgAttendance is null with no source",
  degraded.ok ? degraded.data.summary.avgAttendance : -1,
  null,
);
check(
  "student record falls back to the timetable page",
  degraded.ok ? degraded.data.student.registrationNumber : "x",
  "RA0000000000000",
);

/* ---------------------------- still fatal cases --------------------------- */

const noTimetable = composeDashboard(timetableGone, attendance);
check("a missing timetable IS fatal", noTimetable.ok, false);
check(
  "and reports a portal change, not an expiry",
  noTimetable.ok ? "(ok)" : noTimetable.reason,
  "page_unavailable",
);

const expired = composeDashboard(deadSession, attendance);
check(
  "a logged-out timetable is an expired session",
  expired.ok ? "(ok)" : expired.reason,
  "session_expired",
);
const expiredViaAttendance = composeDashboard(timetable, deadSession);
check(
  "a logged-out attendance page is an expired session too",
  expiredViaAttendance.ok ? "(ok)" : expiredViaAttendance.reason,
  "session_expired",
);
// Precedence matters: a dead session must not be misreported as a portal change.
check(
  "a dead session beats a missing page",
  (() => {
    const r = composeDashboard(timetableGone, deadSession);
    return r.ok ? "(ok)" : r.reason;
  })(),
  "session_expired",
);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
