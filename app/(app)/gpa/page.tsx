import { GpaBoard } from "@/components/gpa-board";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function GpaPage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  const { timetable, attendance } = result.data;

  return <GpaBoard courses={timetable.courses} marks={attendance.marks} />;
}
