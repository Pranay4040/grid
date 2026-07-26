import { MarksTable } from "@/components/marks-table";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";
import { buildMarksRows } from "@/lib/academia/marks-table";

export default async function MarksPage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance } = result.data;
  const rows = buildMarksRows(timetable.courses, attendance.marks);

  return <MarksTable rows={rows} />;
}
