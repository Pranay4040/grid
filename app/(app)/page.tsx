import { StatTile } from "@/components/panel";
import { TimetableView } from "@/components/timetable-view";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function Home() {
  const result = await getDashboard();

  // First-time visitors (no session cookie at all) never reach this — proxy.ts
  // redirects them to /welcome before anything renders. Everyone who lands
  // here without a working session is a RETURNING user, so the reconnect
  // panel is the right thing to show rather than the marketing page.
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
