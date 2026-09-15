/**
 * Pure composition of a dashboard from the two page fetches.
 *
 * Split out of dashboard.ts so it can actually be tested: that file imports
 * `server-only` and `next/headers` and cannot be loaded outside a Next request.
 * The decisions in here are the ones that have broken twice — first conflating
 * "couldn't parse" with "logged out", then treating one missing page as a
 * whole-dashboard failure — so they belong somewhere a verify script can reach.
 * No I/O, no session, no Next imports.
 */
import { uniqueCourses } from "./courses-table";
import { buildSchedule, type WeekSchedule } from "./timetable-grid";
import { ATTENDANCE_THRESHOLD } from "./attendance-planner";
import type { PageResult } from "./data";
import type { AttendanceData, StudentInfo, TimetableData } from "./data-types";

export type DashboardData = {
  student: StudentInfo;
  timetable: TimetableData;
  /**
   * null when Academia no longer serves attendance at all — SRM moved it off
   * academia.srmist.edu.in to the SRM Student Portal (reported Sept 2026).
   * Everything Grid reads from that one page goes with it: attendance rows AND
   * the internal marks feeding /marks and /gpa. `attendanceIssue` says why.
   */
  attendance: AttendanceData | null;
  /** Diagnostic for a null `attendance`; null when it loaded fine. */
  attendanceIssue: string | null;
  week: WeekSchedule;
  summary: {
    courseCount: number;
    totalCredits: number;
    avgAttendance: number | null; // null when nothing conducted, or no source
    /** Courses under 75% among those with conducted hours. null when there's
     *  no attendance source to count — which is NOT the same as zero. */
    belowThreshold: number | null;
    batch: string;
  };
};

export type DashboardResult =
  | { ok: true; data: DashboardData }
  | {
      ok: false;
      /** "misconfigured" = the DEPLOYMENT is broken (no SESSION_SECRET) and
       *  "page_unavailable" = ACADEMIA changed under us. Neither is the user's
       *  session, and both are worth saying differently, so nobody tries to fix
       *  them by logging in again. */
      reason:
        | "no_session"
        | "session_expired"
        | "fetch_failed"
        | "misconfigured"
        | "page_unavailable";
      message: string;
    };

/**
 * Cached per-request so the shared layout and a page can both call this
 * without triggering two live Academia fetches (and two extendSession()
 * writes) for the same navigation.
 */
/**
 * Fold the two fetches into one result.
 *
 * Fatal: a dead session (either page returning the sign-in shell), and a
 * missing TIMETABLE — courses, credits, the week grid and the student record
 * all come from it, so without it there is no dashboard.
 *
 * Not fatal: missing ATTENDANCE. SRM moved attendance off Academia to the
 * Student Portal, and treating that as a whole-dashboard failure took the
 * timetable, courses and calendar down with it — every page dead over one page
 * those three never needed.
 */
export function composeDashboard(
  timetable: PageResult<TimetableData>,
  attendance: PageResult<AttendanceData>,
): DashboardResult {
  const loggedOut =
    (!timetable.ok && timetable.reason === "logged_out") ||
    (!attendance.ok && attendance.reason === "logged_out");
  if (loggedOut) {
    return {
      ok: false,
      reason: "session_expired",
      message: "Your Academia session expired. Sign in again to reconnect.",
    };
  }

  if (!timetable.ok) {
    return {
      ok: false,
      reason: "page_unavailable",
      message:
        "You're signed in, but Academia didn't return the timetable page. " +
        "That's a change on the portal's side — signing in again won't help. " +
        timetable.detail,
    };
  }

  const timetableData = timetable.data;
  const attendanceData = attendance.ok ? attendance.data : null;
  const attendanceIssue = attendance.ok ? null : attendance.detail;

  const batch =
    (timetableData.student.batch || attendanceData?.student.batch || "").match(/\d+/)?.[0] ?? "1";
  const week = buildSchedule(timetableData.courses, batch);

  // Deduped for the headline counts. `timetable.courses` lists a lab-based
  // course once per registration (theory + lab), both rows carrying the same
  // credit — so counting the raw list reported 9 courses / 25 credits while the
  // Courses, Marks and GPA pages all said 8 / 21. Same data, two answers, on
  // the same screen. buildSchedule() above still gets the RAW list, because it
  // needs every slot registration to place classes.
  const registered = uniqueCourses(timetableData.courses);

  // Attendance stats over courses that have actually met. With no source at all
  // these stay null rather than reading as a confident 0 — "nothing below 75%"
  // and "we can't see your attendance" are different claims.
  const conducted = (attendanceData?.rows ?? []).filter((r) => r.hoursConducted > 0);
  const avgAttendance = conducted.length
    ? conducted.reduce((s, r) => s + r.attendancePct, 0) / conducted.length
    : null;
  const belowThreshold = attendanceData
    ? conducted.filter((r) => r.attendancePct < ATTENDANCE_THRESHOLD).length
    : null;

  // Prefer the richer student record (attendance page carries specialization).
  const student = attendanceData?.student.specialization
    ? attendanceData.student
    : timetableData.student;

  return {
    ok: true,
    data: {
      student,
      timetable: timetableData,
      attendance: attendanceData,
      attendanceIssue,
      week,
      summary: {
        courseCount: registered.length,
        totalCredits: registered.reduce((s, c) => s + c.credit, 0),
        avgAttendance,
        belowThreshold,
        batch,
      },
    },
  };
}
