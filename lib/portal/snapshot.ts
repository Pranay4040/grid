/**
 * Turns the raw report pages the "Send to Grid" bookmarklet read inside the
 * student's signed-in portal tab into the compact snapshot Grid stores.
 *
 * WHY A SNAPSHOT, NOT A SESSION: the portal's sign-in needs a captcha plus
 * browser fingerprint/telemetry payloads (fpPayload, telemetryPayload, a
 * honeypot field — confirmed on the live login page). Grid won't fake those,
 * so it can never sign in or replay a session server-side. The bookmarklet
 * runs where the student is already signed in, and this only parses what it
 * sent. No I/O, no Next imports — see scripts/verify-portal-snapshot.ts.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { decryptBytes, encryptBytes } from "../auth/session-crypto";
import { parsePortalAttendance, parsePortalMarkComponents, parsePortalMarks, type PortalAttendance } from "./parse";
import type { SubjectMarks } from "../academia/data-types";

export type PortalSnapshot = {
  /** ms epoch — when the bookmarklet read the portal. */
  takenAt: number;
  attendance: PortalAttendance;
  marks: SubjectMarks[];
};

export type PortalImport =
  | { state: "ok"; snapshot: PortalSnapshot }
  /** The tab wasn't signed in: the portal served its login loader instead. */
  | { state: "expired" }
  | { state: "error"; message: string };

/** What the bookmarklet posts: report bodies, detail bodies keyed by subjectId. */
export type PortalPages = {
  attendance: string;
  marks: string;
  details: Record<string, string>;
};

/** The sign-in page served in place of a report. Confirmed live (Sept 2026):
 *  a dead session gets HTTP 200 with a ~466-byte "Please wait login screen is
 *  loading..." page that auto-posts to loginManager/youLogin.jsp. */
export function looksLoggedOut(body: string): boolean {
  return /youLogin\.jsp|login screen is loading|SCaptchaServlet|name=["']password["']/i.test(body);
}

export function buildPortalSnapshot(pages: PortalPages, takenAt = Date.now()): PortalImport {
  if (looksLoggedOut(pages.attendance) || looksLoggedOut(pages.marks)) return { state: "expired" };

  const attendance = parsePortalAttendance(pages.attendance);
  if (!attendance) {
    return {
      state: "error",
      message: `The portal sent a page (${pages.attendance.length} bytes) that isn't the attendance report.`,
    };
  }

  // Only courses with uploaded marks are listed; the rest aren't uploaded yet.
  const marks: SubjectMarks[] = parsePortalMarks(pages.marks).map((row) => ({
    code: row.code,
    courseType: row.courseType,
    total: row.total,
    maxTotal: row.maxTotal,
    components: parsePortalMarkComponents(pages.details[row.subjectId] ?? "").map(({ label, scored, max }) => ({
      label,
      scored,
      max,
    })),
  }));

  return { state: "ok", snapshot: { takenAt, attendance, marks } };
}

/* ------------------------- cookie encoding (server) ------------------------ */

/** Deflate then AES-GCM encrypt. A real snapshot is ~800 bytes as a cookie and
 *  an end-of-semester one (10 courses x 8 tests) ~900, well under the 4 KB cap. */
export function encodeSnapshot(snapshot: PortalSnapshot): string {
  return encryptBytes(deflateRawSync(JSON.stringify(snapshot)));
}

/** null for anything that isn't a snapshot this build wrote. */
export function decodeSnapshot(token: string | undefined | null): PortalSnapshot | null {
  const bytes = decryptBytes(token);
  if (!bytes) return null;
  try {
    const s = JSON.parse(inflateRawSync(bytes).toString("utf8")) as PortalSnapshot;
    const ok = typeof s.takenAt === "number" && Array.isArray(s.attendance?.rows) && Array.isArray(s.marks);
    return ok ? s : null;
  } catch {
    return null;
  }
}
