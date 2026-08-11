/** High-level data fetchers: authenticated fetch + parse in one call. */
import type { FetchAs } from "./client";
import { classifyPage, parseAttendance, parseTimetable, viewContainerNames } from "./parse";
import type { AttendanceData, TimetableData } from "./data-types";

const PAGE = "/srm_university/academia-academic-services/page";

export const ATTENDANCE_VIEW = "My_Attendance";

// The timetable page link name is historically "..._2023_24"; SRM updates its
// contents each term rather than renaming it. Kept as a constant so a future
// rename is a one-line change — and see timetableViewCandidates() below, which
// is what actually saves us when SRM does eventually roll it.
export const TIMETABLE_VIEW = "My_Time_Table_2023_24";

/**
 * Why a page didn't yield data. The distinction matters to the USER, not just
 * to us: `logged_out` is fixed by signing in again, `unreadable` never is.
 * Reporting the second as the first is what produced an endless "your session
 * expired → sign in → your session expired" loop against a correct password.
 */
export type PageFailure = {
  reason: "logged_out" | "unreadable";
  /** Diagnostics safe to show a user and safe to log: view names, HTTP status
   *  and byte counts only — never page content, which carries PII. */
  detail: string;
};

export type PageResult<T> =
  | { ok: true; data: T; view: string }
  | ({ ok: false } & PageFailure);

/**
 * Candidate link names for the timetable page, most likely first.
 *
 * SRM has left the page named `My_Time_Table_2023_24` while swapping its
 * contents every term, so the pinned name stays first. But "they never rename
 * it" is an observation, not a guarantee, and the day it stops holding the
 * dashboard has no way to tell that apart from a dead session. Deriving the
 * surrounding academic years costs one extra request only when the pinned name
 * has actually stopped working.
 *
 * SRM's academic year starts in July, so months Jul–Dec belong to `Y_Y+1`.
 */
export function timetableViewCandidates(now: Date = new Date()): string[] {
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const names = [TIMETABLE_VIEW];
  for (let back = 0; back <= 3; back++) {
    const y = startYear - back;
    names.push(`My_Time_Table_${y}_${String(y + 1).slice(2)}`);
  }
  names.push("My_Time_Table");
  return [...new Set(names)];
}

/** Classify a response we couldn't parse. Content never leaves this function. */
function diagnose(view: string, status: number, html: string): PageFailure {
  if (classifyPage(html) === "logged_out") {
    return {
      reason: "logged_out",
      detail: `Academia served its sign-in shell for ${view}.`,
    };
  }
  const found = viewContainerNames(html);
  return {
    reason: "unreadable",
    detail:
      `${view}: HTTP ${status}, ${html.length} bytes, ` +
      (found.length ? `views [${found.join(", ")}]` : "no view container") +
      ".",
  };
}

export async function getAttendance(
  fetchAs: FetchAs,
): Promise<PageResult<AttendanceData>> {
  const res = await fetchAs(`${PAGE}/${ATTENDANCE_VIEW}`);
  const html = await res.text();
  const data = parseAttendance(html);
  if (data) return { ok: true, data, view: data.view ?? ATTENDANCE_VIEW };
  return { ok: false, ...diagnose(ATTENDANCE_VIEW, res.status, html) };
}

/**
 * Tries each candidate link name until one parses. The happy path is still a
 * single request — extra names are only fetched after the pinned one has
 * already failed, and a logged-out response short-circuits immediately rather
 * than replaying a dead session against every candidate.
 */
export async function getTimetable(
  fetchAs: FetchAs,
  now: Date = new Date(),
): Promise<PageResult<TimetableData>> {
  const tried: string[] = [];
  let firstFailure: PageFailure | null = null;

  for (const view of timetableViewCandidates(now)) {
    const res = await fetchAs(`${PAGE}/${view}`);
    const html = await res.text();
    const data = parseTimetable(html, view);
    if (data) return { ok: true, data, view: data.view ?? view };

    const failure = diagnose(view, res.status, html);
    if (failure.reason === "logged_out") return { ok: false, ...failure };
    tried.push(view);
    firstFailure ??= failure;
  }

  return {
    ok: false,
    reason: "unreadable",
    detail: `No timetable view found. Tried ${tried.join(", ")}. ${firstFailure?.detail ?? ""}`.trim(),
  };
}
