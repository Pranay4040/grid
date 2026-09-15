import { MarksTable } from "@/components/marks-table";
import { NotConnected } from "@/components/not-connected";
import { AttendanceUnavailable } from "@/components/attendance-unavailable";
import { getDashboard } from "@/lib/academia/dashboard";
import { buildMarksRows } from "@/lib/academia/marks-table";

export default async function MarksPage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance, attendanceIssue } = result.data;
  // Internal marks were only ever scraped off the attendance page, so they
  // left Academia with it. An empty table here would read as "no assessments
  // held yet", which is a different and wrong claim.
  if (!attendance) {
    return <AttendanceUnavailable what="Marks" issue={attendanceIssue} />;
  }

  const rows = buildMarksRows(timetable.courses, attendance.marks);

  return <MarksTable rows={rows} />;
}
