/**
 * Verify the parsers against the real pages. Reports COUNTS and STRUCTURE only
 * — no personal identifiers (name/reg/mobile/faculty) are printed.
 */
import { authedFetch } from "../lib/academia/client";
import { getAttendance, getTimetable } from "../lib/academia/data";
import { loadSession } from "../lib/academia/session-store";

async function main() {
  const session = loadSession();
  if (!session) {
    console.error("No saved session.");
    process.exit(1);
  }
  const fetchAs = authedFetch(session);

  const ttRes = await getTimetable(fetchAs);
  console.log("── TIMETABLE ──");
  if (!ttRes.ok) {
    console.log(`  ${ttRes.reason}: ${ttRes.detail}`);
  } else {
    const tt = ttRes.data;
    console.log("  view:", ttRes.view);
    console.log("  title:", tt.title);
    console.log("  student fields present:", {
      reg: Boolean(tt.student.registrationNumber),
      name: Boolean(tt.student.name),
      program: tt.student.program,
      dept: Boolean(tt.student.department),
      spec: tt.student.specialization,
      sem: tt.student.semester,
      section: tt.student.section ?? "(none)",
    });
    console.log("  courses parsed:", tt.courses.length);
    // Structure sample: code + credit + slot + courseType (not personal).
    for (const c of tt.courses) {
      console.log(
        `   ${c.code.padEnd(10)} cr=${c.credit} slot=${(c.slot || "?").padEnd(8)} type=${c.courseType} title=${c.title.length}ch faculty=${c.faculty ? "y" : "n"} room=${c.room ? "y" : "n"} ay=${c.academicYear}`,
      );
    }
  }

  const attRes = await getAttendance(fetchAs);
  console.log("\n── ATTENDANCE ──");
  if (!attRes.ok) {
    console.log(`  ${attRes.reason}: ${attRes.detail}`);
  } else {
    const att = attRes.data;
    console.log("  view:", attRes.view);
    console.log("  rows parsed:", att.rows.length);
    for (const r of att.rows) {
      console.log(
        `   ${r.code.padEnd(10)} slot=${(r.slot || "?").padEnd(6)} cond=${r.hoursConducted} absent=${r.hoursAbsent} attn=${r.attendancePct}% cat=${r.category}`,
      );
    }
    console.log("  marks subjects:", att.marks.length, "(components empty until assessments held)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
