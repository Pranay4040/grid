import { StatTileSkeleton, ListPanelSkeleton } from "@/components/skeleton";

export default function OverviewLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>
      <ListPanelSkeleton rows={6} />
    </div>
  );
}
