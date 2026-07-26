import { StatTile } from "@/components/glass";
import { AttendanceCards } from "@/components/attendance-cards";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";
import { ATTENDANCE_THRESHOLD } from "@/lib/academia/attendance-planner";

export default async function AttendancePage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { summary, attendance } = result.data;
  const attnTone =
    summary.avgAttendance == null
      ? "neutral"
      : summary.avgAttendance >= ATTENDANCE_THRESHOLD
        ? "success"
        : "danger";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="Attendance"
          value={summary.avgAttendance == null ? "—" : summary.avgAttendance.toFixed(0)}
          unit={summary.avgAttendance == null ? undefined : "%"}
          hint={summary.avgAttendance == null ? "No classes conducted yet" : "Average"}
          tone={attnTone}
        />
        <StatTile
          label={`Below ${ATTENDANCE_THRESHOLD}%`}
          value={summary.belowThreshold}
          hint={summary.belowThreshold ? "Needs attention" : "All good"}
          tone={summary.belowThreshold ? "danger" : "success"}
        />
      </div>
      <AttendanceCards rows={attendance.rows} />
    </>
  );
}
