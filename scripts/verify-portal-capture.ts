/**
 * Run the Student Portal attendance parser against a REAL captured response
 * and report whether it worked — safely.
 *
 *   npx tsx scripts/verify-portal-capture.ts scripts/.capture-attendance.html
 *
 * The fixture in verify-portal-attendance.ts is built from a screenshot of the
 * rendered report, so it assumes ordinary <table> markup. This is the check
 * that the ACTUAL markup agrees. Output is structural only — counts, the
 * reporting period, and one masked sample row — so it's safe to paste back.
 */
import { readFileSync } from "node:fs";
import { parsePortalAttendance } from "../lib/portal/parse";
import { planAttendance } from "../lib/academia/attendance-planner";
import { maskValue } from "../lib/portal/inspect";

function main() {
  const file = process.argv[2] ?? "scripts/.capture-attendance.html";
  let html: string;
  try {
    html = readFileSync(file, "utf8");
  } catch {
    console.error(`Couldn't read ${file} — check the path, or re-run the curl with -o.`);
    process.exit(1);
  }

  console.log(`file:        ${file}`);
  console.log(`size:        ${html.length} bytes`);
  console.log(`<table> tags: ${(html.match(/<table\b/gi) ?? []).length}`);

  const parsed = parsePortalAttendance(html);
  if (!parsed) {
    console.log("\nRESULT: PARSE FAILED — no course table found.");
    console.log(
      "Either the session had expired (a login page was captured), or the markup\n" +
        "differs from the fixture. Run scripts/inspect-capture.ts on the same file\n" +
        "and send that masked report instead.",
    );
    process.exit(1);
  }

  console.log(`\nRESULT: PARSED OK`);
  console.log(`courses:     ${parsed.rows.length}`);
  console.log(`period:      ${parsed.period ? `${parsed.period.from} -> ${parsed.period.to}` : "(not found)"}`);
  console.log(`cumulative:  ${parsed.cumulative.length} months`);
  console.log(
    `arithmetic:  ${parsed.inconsistent.length === 0 ? "all courses add up" : `MISMATCH on ${parsed.inconsistent.join(", ")}`}`,
  );

  const first = parsed.rows[0];
  console.log(
    `\nsample row (masked): code=${maskValue(first.code)} title=${maskValue(first.title)} ` +
      `conducted=${first.hoursConducted > 0 ? "n" : "0"} absent=${first.hoursAbsent >= 0 ? "n" : "?"} pct=${first.attendancePct > 0 ? "n.nn" : "0"}`,
  );

  const plans = planAttendance(parsed.rows);
  console.log(`planner:     ${plans.length} courses planned, statuses OK`);
  console.log("\nThis whole output is safe to paste back.");
}

main();
