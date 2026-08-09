import { Panel } from "@/components/panel";
import { NavMenu } from "@/components/nav-menu";
import type { DashboardResult } from "@/lib/academia/dashboard";

export function AppHeader({ result }: { result: DashboardResult }) {
  return (
    // relative + z-index: every Panel gets its own stacking context
    // from backdrop-filter (see globals.css), so without this the header's
    // popover — despite its own z-50 — paints *underneath* the static
    // stat-tile/content panels that come after it in the DOM. Positioning
    // the header itself lifts its whole subtree above those static siblings.
    <Panel className="relative z-40 flex items-center gap-4 p-4 sm:p-5">
      <NavMenu connected={result.ok} />
      <div className="min-w-0">
        <p className="text-lg font-semibold tracking-tight text-accent">Grid</p>
        {result.ok ? (
          <p className="mt-0.5 truncate text-sm text-muted">
            {result.data.student.name} · {result.data.student.program}{" "}
            {result.data.student.department} · Semester{" "}
            {result.data.student.semester}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-muted">SRM academic companion</p>
        )}
      </div>
    </Panel>
  );
}
