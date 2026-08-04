import { StatTileSkeleton, ListPanelSkeleton } from "@/components/skeleton";

export default function OverviewLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <ListPanelSkeleton rows={6} />
    </div>
  );
}
