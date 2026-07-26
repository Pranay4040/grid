/**
 * Sanity-check buildAttendanceCards() — same convention as the other
 * verify-*.ts scripts (no test framework in this repo).
 */
import { buildAttendanceCards } from "../lib/academia/attendance-cards";
import type { AttendanceRow } from "../lib/academia/data-types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

function row(
  code: string,
  conducted: number,
  absent: number,
  category = "Theory",
): AttendanceRow {
  return {
    code,
    title: `Course ${code}`,
    category,
    faculty: "Dr. X",
    slot: "A",
    room: "CLS101",
    hoursConducted: conducted,
    hoursAbsent: absent,
    attendancePct: conducted > 0 ? ((conducted - absent) / conducted) * 100 : 0,
  };
}

// --- Ordering: planned before pending -----------------------------------

const mixed = buildAttendanceCards([
  row("A", 0, 0), // not started
  row("B", 20, 2), // safe
  row("C", 10, 3), // recover
]);
check("3 rows in -> 3 cards out", mixed.length, 3);
check("planned cards precede pending", mixed[0].kind !== "pending" && mixed[1].kind !== "pending", true);
check("pending card is last", mixed[2].kind, "pending");
check(
  "planned order matches planAttendance's own urgency order (recover before safe)",
  mixed[0].kind === "planned" ? mixed[0].plan.code : null,
  "C",
);

// --- Same course, one category conducted, the other not -----------------

const splitCourse = buildAttendanceCards([
  row("X", 8, 1, "Theory"),
  row("X", 0, 0, "Practical"),
]);
check("same code, split conducted state -> one planned + one pending", splitCourse.length, 2);
check(
  "the conducted category is planned",
  splitCourse.find((c) => c.kind === "planned" && c.plan.category === "Theory") !== undefined,
  true,
);
check(
  "the not-started category is pending",
  splitCourse.find((c) => c.kind === "pending" && c.row.category === "Practical") !== undefined,
  true,
);

// --- Margin display convention (checked at the data level; the component
//     applies the sign/label, but the underlying values must be right) ----

const safeCard = buildAttendanceCards([row("S", 20, 2)])[0];
check(
  "safe/tight row exposes a positive skips value for the '+N' display",
  safeCard.kind === "planned" ? safeCard.plan.skips : null,
  4,
);

const recoverCard = buildAttendanceCards([row("R", 10, 3)])[0];
check(
  "recover row exposes mustAttend for the '-N' display",
  recoverCard.kind === "planned" ? recoverCard.plan.mustAttend : null,
  2,
);

// --- All not-started ------------------------------------------------------

const allPending = buildAttendanceCards([row("P1", 0, 0), row("P2", 0, 0)]);
check("all not-started rows -> all pending, none dropped", allPending.length, 2);
check(
  "every card is pending",
  allPending.every((c) => c.kind === "pending"),
  true,
);

// --- Empty input ------------------------------------------------------------

check("empty input -> empty output", buildAttendanceCards([]).length, 0);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
