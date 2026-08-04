import { Panel } from "@/components/panel";
import { SkeletonBar } from "@/components/skeleton";

export default function CalendarLoading() {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--line)] p-4 sm:p-5">
        <SkeletonBar className="h-4 w-28" />
        <SkeletonBar className="h-8 w-24" />
      </div>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }).map((_, i) => (
            <SkeletonBar key={i} className="aspect-square w-full" />
          ))}
        </div>
      </div>
    </Panel>
  );
}
