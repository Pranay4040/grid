import { StatTile } from "@/components/panel";
import { AttendanceCards } from "@/components/attendance-cards";
import { NotConnected } from "@/components/not-connected";
import { AttendanceUnavailable } from "@/components/attendance-unavailable";
import { getDashboard } from "@/lib/academia/dashboard";
import { attendanceStats } from "@/lib/academia/dashboard-data";
import { getPortal } from "@/lib/portal/data";
import { ATTENDANCE_THRESHOLD } from "@/lib/academia/attendance-planner";

export default async function AttendancePage() {
  const [result, portal] = await Promise.all([getDashboard(), getPortal()]);

  // The Student Portal is the source now; Academia's copy is only a fallback
  // for as long as it still serves one. Attendance needs nothing else from
  // Academia, so a connected portal shows even without an Academia session.
  const rows =
    portal.state === "ok" ? portal.attendance.rows : result.ok ? (result.data.attendance?.rows ?? null) : null;

  if (!rows) {
    if (!result.ok && portal.state === "not_connected") {
      return <NotConnected reason={result.reason} message={result.message} />;
    }
    return <AttendanceUnavailable what="Attendance" portal={portal} />;
  }

  const { avgAttendance, belowThreshold } = attendanceStats(rows);
  const attnTone =
    avgAttendance == null ? "neutral" : avgAttendance >= ATTENDANCE_THRESHOLD ? "success" : "danger";

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <StatTile
          label="Attendance"
          value={avgAttendance == null ? "—" : avgAttendance.toFixed(0)}
          unit={avgAttendance == null ? undefined : "%"}
          hint={avgAttendance == null ? "No classes conducted yet" : "Average"}
          tone={attnTone}
        />
        <StatTile
          label={`Below ${ATTENDANCE_THRESHOLD}%`}
          value={belowThreshold ?? "—"}
          hint={belowThreshold ? "Needs attention" : "All good"}
          tone={belowThreshold ? "danger" : "success"}
        />
      </div>
      {portal.state === "ok" && portal.attendance.period ? (
        <p className="text-xs text-faint">
          From the SRM Student Portal · {portal.attendance.period.from} → {portal.attendance.period.to}
        </p>
      ) : null}
      <AttendanceCards rows={rows} />
    </>
  );
}
