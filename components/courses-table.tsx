import { Panel } from "@/components/panel";
import type { CourseRow, CoursesSummary } from "@/lib/academia/courses-table";
import { ATTENDANCE_THRESHOLD } from "@/lib/academia/attendance-planner";

function attendanceTone(percent: number): string {
  return percent >= ATTENDANCE_THRESHOLD ? "text-success" : "text-danger";
}

/** One "Theory 82%" / "Practical 95%" chip. */
function AttendanceChip({
  category,
  percent,
}: {
  category: string;
  percent: number;
}) {
  return (
    <span className="rounded-full bg-[var(--panel-hover)] px-2 py-0.5 text-xs whitespace-nowrap">
      <span className="text-muted">{category} </span>
      <span className={`font-semibold tabular-nums ${attendanceTone(percent)}`}>
        {percent.toFixed(0)}%
      </span>
    </span>
  );
}

/** Small label/value pair used for the registration detail grid. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] font-medium tracking-wide text-faint uppercase">
        {label}
      </p>
      <p className="truncate text-xs text-muted" title={value}>
        {value || "—"}
      </p>
    </div>
  );
}

export function CoursesTable({
  rows,
  summary,
}: {
  rows: CourseRow[];
  summary: CoursesSummary;
}) {
  if (rows.length === 0) {
    return (
      <Panel className="p-8 text-center text-muted">No registered courses.</Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">Courses</h2>
        {summary.byCategory.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {summary.byCategory.map((c) => (
              <span
                key={c.category}
                className="rounded-full bg-[var(--panel-hover)] px-2 py-0.5 text-xs text-muted"
              >
                {c.category}
                <span className="ml-1 font-semibold tabular-nums text-foreground">
                  {c.credits}
                </span>
                <span className="text-faint"> cr</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {rows.map((r) => (
          <li
            key={r.code}
            className="flex flex-col gap-2 rounded-xl border border-[var(--line)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium" title={r.title}>
                  {r.title || <span className="text-faint">—</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  <span className="font-mono">{r.code}</span>
                  {r.courseType ? ` · ${r.courseType}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {r.credit ?? "—"}
                </p>
                <p className="text-[0.65rem] text-faint">credits</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--line)] pt-2">
              <Detail label="Faculty" value={r.faculty} />
              <Detail label="Room" value={r.room} />
              <Detail label="Slot" value={r.slot} />
              <Detail label="Category" value={r.category} />
            </div>

            {r.attendance.length > 0 ? (
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                {r.attendance.map((a) => (
                  <AttendanceChip
                    key={a.category}
                    category={a.category}
                    percent={a.percent}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-auto pt-1 text-xs text-faint">No classes conducted yet</p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
