/**
 * Fetch + parse everything Grid reads from the Student Portal for one session.
 * No Next imports, so scripts/verify-portal-load.ts can run it with fetch stubbed.
 */
import { REPORTS, fetchMarkComponents, fetchReport, type PortalSession, type ReportResponse } from "./client";
import { parsePortalAttendance, parsePortalMarkComponents, parsePortalMarks, type PortalAttendance } from "./parse";
import type { SubjectMarks } from "../academia/data-types";

export type PortalResult =
  | { state: "ok"; attendance: PortalAttendance; marks: SubjectMarks[] }
  /** No portal cookie at all. */
  | { state: "not_connected" }
  /** The portal no longer accepts this session — reconnecting fixes it. */
  | { state: "expired" }
  /** Session looked fine but the response wasn't what we parse. */
  | { state: "error"; message: string };

/** A redirect, or the sign-in page served in place of a report. Confirmed
 *  live (Sept 2026): a dead session gets HTTP 200 with a ~466-byte "Please wait
 *  login screen is loading..." page that auto-posts to loginManager/youLogin.jsp. */
function looksLoggedOut(res: ReportResponse): boolean {
  if (res.status >= 300 && res.status < 400) return true;
  return /youLogin\.jsp|login screen is loading|captcha|j_security_check|type=["']password["']|session\s+(has\s+)?expired/i.test(res.body);
}

export async function loadPortal(session: PortalSession): Promise<PortalResult> {
  try {
    const [attRes, marksRes] = await Promise.all([
      fetchReport(session, REPORTS.attendance),
      fetchReport(session, REPORTS.internalMarks),
    ]);
    if (looksLoggedOut(attRes) || looksLoggedOut(marksRes)) return { state: "expired" };

    const attendance = parsePortalAttendance(attRes.body);
    if (!attendance) {
      return {
        state: "error",
        message: `The Student Portal answered (HTTP ${attRes.status}, ${attRes.body.length} bytes) but not with an attendance table.`,
      };
    }

    // Only assessed courses are listed; the rest simply aren't uploaded yet.
    const summary = parsePortalMarks(marksRes.body);
    const marks: SubjectMarks[] = await Promise.all(
      summary.map(async (row) => {
        if (!row.subjectId) return row;
        const detail = await fetchMarkComponents(session, row.subjectId, row.status);
        return { ...row, components: parsePortalMarkComponents(detail.body) };
      }),
    );

    return { state: "ok", attendance, marks };
  } catch (err) {
    return {
      state: "error",
      message: `Couldn't reach the Student Portal: ${err instanceof Error ? err.message : "unknown error"}.`,
    };
  }
}
