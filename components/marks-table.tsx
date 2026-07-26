import { GlassPanel } from "@/components/glass";
import type { MarksRow } from "@/lib/academia/marks-table";

function StatusPill({ status }: { status: MarksRow["status"] }) {
  const cls =
    status === "graded"
      ? "bg-[var(--success-soft)] text-success"
      : "bg-[var(--glass-hover)] text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      {status === "graded" ? "Graded" : "Not graded yet"}
    </span>
  );
}

export function MarksTable({ rows }: { rows: MarksRow[] }) {
  if (rows.length === 0) {
    return (
      <GlassPanel className="p-8 text-center text-muted">
        No registered courses.
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">Marks</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-xs text-muted">
              <th className="p-3 font-medium sm:px-5">Course</th>
              <th className="p-3 font-medium sm:px-5">Code</th>
              <th className="p-3 font-medium sm:px-5">Type</th>
              <th className="p-3 font-medium sm:px-5">Credit</th>
              <th className="p-3 font-medium sm:px-5">Status</th>
              <th className="p-3 font-medium sm:px-5">Components</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((r) => (
              <tr key={r.code}>
                <td className="max-w-[16rem] truncate p-3 font-medium sm:px-5">
                  {r.title || <span className="text-faint">—</span>}
                </td>
                <td className="p-3 font-mono text-xs sm:px-5">{r.code}</td>
                <td className="p-3 text-muted sm:px-5">{r.courseType || "—"}</td>
                <td className="p-3 tabular-nums sm:px-5">
                  {r.credit === null ? <span className="text-faint">—</span> : r.credit}
                </td>
                <td className="p-3 sm:px-5">
                  <StatusPill status={r.status} />
                </td>
                <td className="p-3 text-xs text-muted sm:px-5">
                  {r.components.length === 0
                    ? "—"
                    : r.components.map((c) => `${c.label}: ${c.scored}/${c.max}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}
