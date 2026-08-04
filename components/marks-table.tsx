import { Panel } from "@/components/panel";
import type { MarksRow } from "@/lib/academia/marks-table";

function StatusPill({ status }: { status: MarksRow["status"] }) {
  const cls =
    status === "graded"
      ? "bg-[var(--success-soft)] text-success"
      : "bg-[var(--panel-hover)] text-muted";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {status === "graded" ? "Graded" : "Not graded yet"}
    </span>
  );
}

export function MarksTable({ rows }: { rows: MarksRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel className="p-8 text-center text-muted">
        No registered courses.
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">Marks</h2>
      </div>
      <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.code} className="rounded-xl border border-[var(--line)] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium">
                  {r.title || <span className="text-faint">—</span>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  <span className="font-mono">{r.code}</span>
                  {r.courseType ? ` · ${r.courseType}` : ""}
                  {r.credit !== null ? ` · ${r.credit} cr` : ""}
                </p>
              </div>
              <StatusPill status={r.status} />
            </div>
            {r.components.length > 0 ? (
              <p className="mt-1 text-xs text-muted">
                {r.components.map((c) => `${c.label}: ${c.scored}/${c.max}`).join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
