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
      /** "misconfigured" = the DEPLOYMENT is broken (no SESSION_SECRET), not
       *  the user's session — worth saying differently so nobody tries to fix
       *  it by logging in again. */
      reason: "no_session" | "session_expired" | "fetch_failed" | "misconfigured";
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
    if (!timetable || !attendance) {
      // Both parsers return null specifically when the page's view container
      // is missing — the signature of Academia serving the logged-out shell
      // rather than real content, not a partial-parse issue.
      return {
        ok: false,
        reason: "session_expired",
        message: "Your Academia session expired. Sign in again to reconnect.",
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

    const batch = (timetable.student.batch || attendance.student.batch).match(/\d+/)?.[0] ?? "1";
    const week = buildSchedule(timetable.courses, batch);

    // Attendance average over courses that have actually met.
    const conducted = attendance.rows.filter((r) => r.hoursConducted > 0);
    const avgAttendance = conducted.length
      ? conducted.reduce((s, r) => s + r.attendancePct, 0) / conducted.length
      : null;
    const belowThreshold = conducted.filter((r) => r.attendancePct < ATTENDANCE_THRESHOLD).length;

    // Prefer the richer student record (attendance page carries specialization).
    const student = attendance.student.specialization
      ? attendance.student
      : timetable.student;

    return {
      ok: true,
      data: {
        student,
        timetable,
        attendance,
        week,
        summary: {
          courseCount: timetable.courses.length,
          totalCredits: timetable.courses.reduce((s, c) => s + c.credit, 0),
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
