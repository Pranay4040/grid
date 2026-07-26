import { StatTile } from "@/components/glass";
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
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Courses" value={summary.courseCount} hint="Registered" tone="accent" />
        <StatTile label="Credits" value={summary.totalCredits} hint="This semester" tone="neutral" />
      </div>
      <TimetableView week={week} />
    </>
  );
}
