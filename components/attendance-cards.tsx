import { GlassPanel } from "@/components/glass";
import { buildAttendanceCards, STATUS_TONE } from "@/lib/academia/attendance-cards";
import type { AttendanceRow } from "@/lib/academia/data-types";

function toneClass(tone: "success" | "warn" | "danger" | "accent" | "neutral"): string {
  switch (tone) {
    case "success":
      return "text-success";
    case "warn":
      return "text-warn";
    case "danger":
      return "text-danger";
    case "accent":
      return "text-accent";
    default:
      return "text-foreground";
  }
}

function Pill({
  value,
  tone,
}: {
  value: number;
  tone: "success" | "danger" | "neutral";
}) {
  const bg =
    tone === "success"
      ? "bg-[var(--success-soft)] text-success"
      : tone === "danger"
        ? "bg-[var(--danger-soft)] text-danger"
        : "bg-[var(--glass-hover)] text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${bg}`}>
      {value}
    </span>
  );
}

export function AttendanceCards({ rows }: { rows: AttendanceRow[] }) {
  const cards = buildAttendanceCards(rows);
  if (cards.length === 0) return null;

  return (
    <GlassPanel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">Attendance</h2>
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {cards.map((card) => {
          if (card.kind === "pending") {
            const { row } = card;
            return (
              <li
                key={`${row.code}-${row.category}`}
                className="flex items-center gap-3 p-4 text-faint sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="truncate text-xs">
                    <span className="font-mono">{row.code}</span> · {row.category}
                  </p>
                  <div className="mt-2">
                    <Pill value={0} tone="neutral" />
                    <span className="ml-1.5 text-xs">Not started</span>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">—</span>
              </li>
            );
          }

          const { plan } = card;
          const tone = STATUS_TONE[plan.status];
          const margin =
            plan.status === "recover" ? `-${plan.mustAttend}` : `${plan.skips}`;

          return (
            <li
              key={`${plan.code}-${plan.category}`}
              className="flex items-center gap-3 p-4 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{plan.title}</p>
                <p className="truncate text-xs text-muted">
                  <span className="font-mono">{plan.code}</span> · {plan.category}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Pill value={plan.attended} tone="success" />
                  <Pill value={plan.conducted - plan.attended} tone="danger" />
                  <Pill value={plan.conducted} tone="neutral" />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold tabular-nums ${toneClass(tone)}`}>
                  {plan.percent.toFixed(0)}%
                </p>
                <p className="text-xs text-muted">
                  Margin: <span className={toneClass(tone)}>{margin}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
