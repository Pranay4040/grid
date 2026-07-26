import { authedFetch } from "../lib/academia/client";
import { getTimetable } from "../lib/academia/data";
import { loadSession } from "../lib/academia/session-store";
import { buildSchedule, to12h } from "../lib/academia/timetable-grid";

async function main() {
  const session = loadSession();
  if (!session) { console.error("No session"); process.exit(1); }
  const tt = await getTimetable(authedFetch(session));
  if (!tt) { console.error("No timetable"); process.exit(1); }
  const batch = tt.student.batch?.match(/\d+/)?.[0] ?? "1";
  console.log("batch:", batch, "| courses:", tt.courses.length);
  const week = buildSchedule(tt.courses, batch);
  for (const day of week.days) {
    console.log(`\nDay ${day.dayOrder}:`);
    for (const c of day.classes) {
      console.log(`  P${c.period} ${to12h(c.start)}-${to12h(c.end)}  ${c.course.code}  ${c.course.title}`);
    }
    if (!day.classes.length) console.log("  (no classes)");
  }
  console.log("\nunplaced (L-slot labs):", week.unplaced.map(c => `${c.code}[${c.slot}]`).join(", ") || "none");
}
main().catch(e => { console.error(e); process.exit(1); });
