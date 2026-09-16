import { MarksTable } from "@/components/marks-table";
import { NotConnected } from "@/components/not-connected";
import { AttendanceUnavailable } from "@/components/attendance-unavailable";
import { getDashboard } from "@/lib/academia/dashboard";
import { getPortal } from "@/lib/portal/data";
import { buildMarksRows } from "@/lib/academia/marks-table";

export default async function MarksPage() {
  const [result, portal] = await Promise.all([getDashboard(), getPortal()]);

  // Registered courses (and credits) still come from the Academia timetable.
  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance } = result.data;
  // Student Portal first. With no marks source at all, an empty table would
  // read as "nothing uploaded yet", which is a different and wrong claim.
  const marks = portal.state === "ok" ? portal.marks : attendance?.marks;
  if (!marks) {
    return <AttendanceUnavailable what="Marks" />;
  }

  return <MarksTable rows={buildMarksRows(timetable.courses, marks)} />;
}
