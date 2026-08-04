import { StatTile } from "@/components/panel";
import { TimetableView } from "@/components/timetable-view";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function Home() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { summary, week } = result.data;

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <StatTile label="Courses" value={summary.courseCount} hint="Registered" tone="accent" />
        <StatTile label="Credits" value={summary.totalCredits} hint="This semester" tone="neutral" />
      </div>
      <TimetableView week={week} />
    </>
  );
}
