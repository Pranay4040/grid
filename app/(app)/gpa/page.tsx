import { GpaBoard } from "@/components/gpa-board";
import { NotConnected } from "@/components/not-connected";
import { AttendanceUnavailable } from "@/components/attendance-unavailable";
import { getDashboard } from "@/lib/academia/dashboard";
import { getPortal } from "@/lib/portal/data";

export default async function GpaPage() {
  const [result, portal] = await Promise.all([getDashboard(), getPortal()]);

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance } = result.data;
  // The estimator seeds each subject from its published internal marks; with no
  // marks source every subject would silently seed from 0 and quote a
  // confident, wrong SGPA.
  const marks = portal.state === "ok" ? portal.marks : attendance?.marks;
  if (!marks) {
    return <AttendanceUnavailable what="Marks" />;
  }

  return <GpaBoard courses={timetable.courses} marks={marks} />;
}
