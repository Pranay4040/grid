import { clsx } from "clsx";
import { Panel } from "@/components/panel";

/** A single pulsing placeholder bar. The global prefers-reduced-motion rule
 *  in globals.css already neutralizes the animation for anyone who needs it. */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={clsx("animate-pulse rounded-lg bg-[var(--panel-hover)]", className)}
      aria-hidden
    />
  );
}

/** Placeholder shaped like a StatTile. */
export function StatTileSkeleton() {
  return (
    <Panel className="w-full min-w-[9.5rem] flex-1 p-4 sm:w-52 sm:flex-none sm:p-5">
      <SkeletonBar className="h-3 w-20" />
      <SkeletonBar className="mt-3 h-8 w-16" />
      <SkeletonBar className="mt-2 h-3 w-24" />
    </Panel>
  );
}

/** Placeholder shaped like a bordered-header Panel with N card-grid rows —
 *  matches the AttendanceCards/MarksTable/TimetableView card shape. */
export function ListPanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <SkeletonBar className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--line)] p-3">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="mt-2 h-3 w-24" />
            <SkeletonBar className="mt-3 h-5 w-16" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
