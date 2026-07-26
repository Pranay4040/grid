import { clsx } from "clsx";
import { GlassPanel } from "@/components/glass";

/** A single pulsing placeholder bar. The global prefers-reduced-motion rule
 *  in globals.css already neutralizes the animation for anyone who needs it. */
export function SkeletonBar({ className }: { className?: string }) {
  return (
    <div
      className={clsx("animate-pulse rounded-lg bg-[var(--glass-hover)]", className)}
      aria-hidden
    />
  );
}

/** Placeholder shaped like a StatTile. */
export function StatTileSkeleton() {
  return (
    <GlassPanel className="p-5">
      <SkeletonBar className="h-3 w-20" />
      <SkeletonBar className="mt-3 h-9 w-16" />
      <SkeletonBar className="mt-2 h-3 w-24" />
    </GlassPanel>
  );
}

/** Placeholder shaped like a bordered-header GlassPanel with N list rows —
 *  matches the AttendanceCards row shape. */
export function ListPanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <GlassPanel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <SkeletonBar className="h-4 w-32" />
      </div>
      <div className="divide-y divide-[var(--line)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <SkeletonBar className="h-4 w-40" />
              <SkeletonBar className="mt-2 h-3 w-28" />
            </div>
            <SkeletonBar className="h-5 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
