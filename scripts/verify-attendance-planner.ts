/**
 * Sanity-check planAttendance() against hand-worked fixtures — no test
 * framework in this repo, same convention as verify-custom.ts/verify-session.ts.
 */
import { planAttendance, type AttendancePlan } from "../lib/academia/attendance-planner";
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

function row(code: string, conducted: number, absent: number, category = "Theory"): AttendanceRow {
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

function planFor(conducted: number, absent: number): AttendancePlan {
  return planAttendance([row("X", conducted, absent)])[0];
}

// --- Core fixtures -----------------------------------------------------------

let p = planFor(20, 2);
check("20/2 -> skips 4", p.skips, 4);
check("20/2 -> status safe", p.status, "safe");

p = planFor(10, 3);
check("10/3 -> mustAttend 2", p.mustAttend, 2);
check("10/3 -> status recover", p.status, "recover");

p = planFor(4, 1); // exactly 75%
check("4/1 (exactly 75%) -> skips 0", p.skips, 0);
check("4/1 (exactly 75%) -> status tight, not recover", p.status, "tight");

p = planFor(8, 1);
check("8/1 -> skips 1", p.skips, 1);
check("8/1 -> status tight", p.status, "tight");

p = planFor(3, 0); // 100%, but few classes held
check("3/0 (100%, early semester) -> skips 1", p.skips, 1);
check("3/0 (100%, early semester) -> status tight (count, not %, drives tone)", p.status, "tight");

check("0/0 -> omitted entirely", planAttendance([row("Z", 0, 0)]).length, 0);

p = planFor(1, 1); // 0%
check("1/1 (0%) -> mustAttend 3", p.mustAttend, 3);

// --- Invariants across all fixtures -----------------------------------------

const cases: [number, number][] = [[20, 2], [10, 3], [4, 1], [8, 1], [3, 0], [1, 1], [15, 4], [6, 6]];
let invariantFailures = 0;
for (const [conducted, absent] of cases) {
  const plan = planFor(conducted, absent);
  const attended = conducted - absent;
  if (plan.status !== "recover") {
    const okAtSkips = attended * 100 >= 75 * (conducted + plan.skips);
    const failsAtSkipsPlus1 = attended * 100 < 75 * (conducted + plan.skips + 1);
    if (!okAtSkips || !failsAtSkipsPlus1) {
      invariantFailures++;
      console.log(`FAIL invariant (safe/tight) for ${conducted}/${absent}: skips=${plan.skips}`);
    }
  } else {
    const n = plan.mustAttend;
    const okAtN = (attended + n) * 100 >= 75 * (conducted + n);
    const failsAtNMinus1 = n === 1 || (attended + n - 1) * 100 < 75 * (conducted + n - 1);
    if (!okAtN || !failsAtNMinus1) {
      invariantFailures++;
      console.log(`FAIL invariant (recover) for ${conducted}/${absent}: mustAttend=${n}`);
    }
  }
}
check("all invariants hold across fixtures", invariantFailures, 0);

// --- Ordering -----------------------------------------------------------------

const mixed = planAttendance([
  row("A", 10, 3), // recover
  row("B", 20, 2), // safe
  row("C", 4, 1), // tight
]);
const firstRecoverIdx = mixed.findIndex((x) => x.status === "recover");
const firstSafeIdx = mixed.findIndex((x) => x.status === "safe");
check("recover rows sort before safe rows", firstRecoverIdx < firstSafeIdx, true);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
