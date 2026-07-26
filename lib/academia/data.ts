/** High-level data fetchers: authenticated fetch + parse in one call. */
import type { FetchAs } from "./client";
import { parseAttendance, parseTimetable } from "./parse";
import type { AttendanceData, TimetableData } from "./data-types";

const PAGE = "/srm_university/academia-academic-services/page";

// The timetable page link name is historically "..._2023_24"; SRM updates its
// contents each term rather than renaming it. Kept as a constant so a future
// rename is a one-line change.
export const TIMETABLE_VIEW = "My_Time_Table_2023_24";

// Takes a shared FetchAs (one per dashboard load, see dashboard.ts) rather
// than a session, so both calls refresh the same cookie jar — needed to
// persist a single, consistent extended session afterward.

export async function getAttendance(fetchAs: FetchAs): Promise<AttendanceData | null> {
  const html = await (await fetchAs(`${PAGE}/My_Attendance`)).text();
  return parseAttendance(html);
}

export async function getTimetable(fetchAs: FetchAs): Promise<TimetableData | null> {
  const html = await (await fetchAs(`${PAGE}/${TIMETABLE_VIEW}`)).text();
  return parseTimetable(html, TIMETABLE_VIEW);
}
