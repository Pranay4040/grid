import { StatTile } from "@/components/panel";
import { CoursesTable } from "@/components/courses-table";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";
import { buildCourseRows, summarizeCourses } from "@/lib/academia/courses-table";

export default async function CoursesPage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance } = result.data;
  const rows = buildCourseRows(timetable.courses, attendance.rows);
  const summary = summarizeCourses(rows);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <StatTile
          label="Courses"
          value={summary.courseCount}
          hint="Registered"
          tone="accent"
        />
        <StatTile
          label="Credits"
          value={summary.totalCredits}
          hint="This semester"
          tone="neutral"
        />
      </div>
      <CoursesTable rows={rows} summary={summary} />
    </>
  );
}
