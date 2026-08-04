import { CalendarView } from "@/components/calendar-view";
import { NotConnected } from "@/components/not-connected";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function CalendarPage() {
  const result = await getDashboard();

  if (!result.ok) {
    return <NotConnected reason={result.reason} message={result.message} />;
  }

  return <CalendarView week={result.data.week} />;
}
