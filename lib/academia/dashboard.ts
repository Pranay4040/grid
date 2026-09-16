/**
 * Server-side dashboard loader. Multi-user: the session comes from the
 * caller's own encrypted cookie (lib/auth/session-cookie.ts), so two students
 * hitting the same deployment get their own data. Everything downstream
 * (fetch → parse → grid → stats) is identical regardless of whose session it is.
 *
 * This file owns only the I/O — session, fetches, and the failure modes that
 * come from the deployment rather than the portal. How the two page fetches
 * fold into a dashboard lives in dashboard-data.ts, which is pure and testable;
 * see scripts/verify-dashboard-compose.ts.
 */
import "server-only";
import { cache } from "react";
import { authedFetch } from "./client";
import { getAttendance, getTimetable } from "./data";
import { readSession, sessionSecretMissing } from "../auth/session-cookie";
import { composeDashboard } from "./dashboard-data";
import type { DashboardResult } from "./dashboard-data";

export type { DashboardData, DashboardResult } from "./dashboard-data";

/**
 * Cached per-request so the shared layout and a page can both call this
 * without triggering two live Academia fetches for the same navigation.
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

    // NOTE: we deliberately do NOT re-save the session here. This runs during
    // a Server Component render, and Next forbids setting cookies once
    // streaming has begun (see node_modules/next/dist/docs/.../cookies.md).
    // Nothing is actually lost: `expiresAt` was already documented as purely
    // informational (nothing gates on it — only `issuedAt` + the 30-day
    // backstop do), and probe-session-liveness.ts confirmed Academia reissues
    // no cookies on a data fetch. The cookie's own max-age carries the
    // lifetime instead.

    return composeDashboard(timetable, attendance);
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      message: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}
