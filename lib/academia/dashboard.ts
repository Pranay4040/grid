/**
 * Server-side dashboard loader. Multi-user: the session comes from the
 * caller's own encrypted cookie (lib/auth/session-cookie.ts), so two students
 * hitting the same deployment get their own data. Everything downstream
 * (fetch → parse → grid → stats) is identical regardless of whose session it is.
 */
import "server-only";
import { cache } from "react";
import { authedFetch } from "./client";
import { getAttendance, getTimetable } from "./data";
import { uniqueCourses } from "./courses-table";
import { readSession, sessionSecretMissing } from "../auth/session-cookie";
import { buildSchedule, type WeekSchedule } from "./timetable-grid";
import { ATTENDANCE_THRESHOLD } from "./attendance-planner";
import type { AttendanceData, StudentInfo, TimetableData } from "./data-types";

export type DashboardData = {
  student: StudentInfo;
  timetable: TimetableData;
  attendance: AttendanceData;
  week: WeekSchedule;
  summary: {
    courseCount: number;
    totalCredits: number;
    avgAttendance: number | null; // null when nothing has been conducted yet
    belowThreshold: number; // courses under 75% among those with conducted hours
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
export const getDashboard = cache(loadDashboard);

export async function loadDashboard(): Promise<DashboardResult> {
  // A missing SESSION_SECRET means nobody can log in at all. Report it as a
  // server problem rather than letting every user see "not connected" and
  // retry a login that cannot possibly succeed.
  if (sessionSecretMissing()) {
    return {
      ok: false,
      reason: "misconfigured",
      message:
        "This deployment is missing its SESSION_SECRET environment variable, " +
        "so sessions can't be encrypted. Nothing you do will fix this from here.",
    };
  }

  const session = await readSession();
  if (!session) {
    return { ok: false, reason: "no_session", message: "No active Academia session." };
  }

  try {
    const fetchAs = authedFetch(session);
    const [timetable, attendance] = await Promise.all([
      getTimetable(fetchAs),
      getAttendance(fetchAs),
    ]);
    if (!timetable.ok || !attendance.ok) {
      const failed = [
        ...(timetable.ok ? [] : [timetable]),
        ...(attendance.ok ? [] : [attendance]),
      ];

      // Only Academia's actual sign-in shell means the session is dead. A page
      // that rendered but carried a view we couldn't read is a PORTAL change —
      // signing in again cannot fix it, and saying "session expired" sent
      // people back to /login to retype a password that was never wrong.
      if (failed.some((f) => f.reason === "logged_out")) {
        return {
          ok: false,
          reason: "session_expired",
          message: "Your Academia session expired. Sign in again to reconnect.",
        };
      }

      return {
        ok: false,
        reason: "page_unavailable",
        message:
          "You're signed in, but Academia didn't return the pages Grid reads. " +
          "That's a change on the portal's side — signing in again won't help. " +
          failed.map((f) => f.detail).join(" "),
      };
    }

    // NOTE: we deliberately do NOT re-save the session here. This runs during
    // a Server Component render, and Next forbids setting cookies once
    // streaming has begun (see node_modules/next/dist/docs/.../cookies.md).
    // Nothing is actually lost: `expiresAt` was already documented as purely
    // informational (nothing gates on it — only `issuedAt` + the 30-day
    // backstop do), and probe-session-liveness.ts confirmed Academia reissues
    // no cookies on a data fetch. The cookie's own max-age carries the
    // lifetime instead.

    const timetableData = timetable.data;
    const attendanceData = attendance.data;

    const batch =
      (timetableData.student.batch || attendanceData.student.batch).match(/\d+/)?.[0] ?? "1";
    const week = buildSchedule(timetableData.courses, batch);

    // Deduped for the headline counts. `timetable.courses` lists a lab-based
    // course once per registration (theory + lab), both rows carrying the same
    // credit — so counting the raw list reported 9 courses / 25 credits while
    // the Courses, Marks and GPA pages all said 8 / 21. Same data, two
    // answers, on the same screen. buildSchedule() above still gets the RAW
    // list, because it needs every slot registration to place classes.
    const registered = uniqueCourses(timetableData.courses);

    // Attendance average over courses that have actually met.
    const conducted = attendanceData.rows.filter((r) => r.hoursConducted > 0);
    const avgAttendance = conducted.length
      ? conducted.reduce((s, r) => s + r.attendancePct, 0) / conducted.length
      : null;
    const belowThreshold = conducted.filter((r) => r.attendancePct < ATTENDANCE_THRESHOLD).length;

    // Prefer the richer student record (attendance page carries specialization).
    const student = attendanceData.student.specialization
      ? attendanceData.student
      : timetableData.student;

    return {
      ok: true,
      data: {
        student,
        timetable: timetableData,
        attendance: attendanceData,
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
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}
