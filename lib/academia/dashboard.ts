/**
 * Server-side dashboard loader. For local dev it reads the saved session file;
 * the production multi-user path will pass a session resolved from our own
 * auth cookie instead. Everything downstream (fetch → parse → grid → stats) is
 * identical regardless of where the session came from.
 */
import "server-only";
import { cache } from "react";
import { authedFetch, extendSession } from "./client";
import { getAttendance, getTimetable } from "./data";
import { loadSession, saveSession } from "./session-store";
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
  | { ok: false; reason: "no_session" | "session_expired" | "fetch_failed"; message: string };

/**
 * Cached per-request so the shared layout and a page can both call this
 * without triggering two live Academia fetches (and two extendSession()
 * writes) for the same navigation.
 */
export const getDashboard = cache(loadDashboard);

export async function loadDashboard(): Promise<DashboardResult> {
  const session = loadSession();
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
        message: "Your Academia session expired. Reconnect with save-session.ts.",
      };
    }

    // Real, successful use — this is the actual signal of validity, so push
    // the soft window forward and persist whatever cookies got refreshed.
    saveSession(extendSession(session, fetchAs.jar));

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
