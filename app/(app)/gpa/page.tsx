import { GpaBoard } from "@/components/gpa-board";
import { NotConnected } from "@/components/not-connected";
import { AttendanceUnavailable } from "@/components/attendance-unavailable";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function GpaPage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance, attendanceIssue } = result.data;
  // The estimator seeds each subject from its published internal mark; with no
  // marks source every subject would silently seed from 0 and quote a
  // confident, wrong SGPA.
  if (!attendance) {
    return <AttendanceUnavailable what="Marks" issue={attendanceIssue} />;
  }

  return <GpaBoard courses={timetable.courses} marks={attendance.marks} />;
}
