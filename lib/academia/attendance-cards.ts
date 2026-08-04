/**
 * Reconciles every registered attendance row against planAttendance()'s
 * output, without touching that already-tested function. A "full course
 * list" view needs not-yet-started courses too (hoursConducted <= 0),
 * which planAttendance() deliberately omits since there's nothing to plan
 * for them yet.
 */
import type { Tone } from "@/components/panel";
import { planAttendance, type AttendancePlan, type PlanStatus } from "./attendance-planner";
import type { AttendanceRow } from "./data-types";

export const STATUS_TONE: Record<PlanStatus, Tone> = {
  safe: "success",
  tight: "warn",
  recover: "danger",
};

export type AttendanceCard =
  | { kind: "planned"; plan: AttendancePlan }
  | { kind: "pending"; row: AttendanceRow };

/**
 * Planned cards first (in planAttendance()'s own urgency order), then
 * pending (not-started) cards sorted by code, then category.
 */
export function buildAttendanceCards(rows: AttendanceRow[]): AttendanceCard[] {
  const plans = planAttendance(rows);
  const planned = new Set(plans.map((p) => `${p.code}|${p.category}`));

  const pending = rows
    .filter((r) => !planned.has(`${r.code}|${r.category}`))
    .sort((a, b) => a.code.localeCompare(b.code) || a.category.localeCompare(b.category));

  return [
    ...plans.map((plan): AttendanceCard => ({ kind: "planned", plan })),
    ...pending.map((row): AttendanceCard => ({ kind: "pending", row })),
  ];
}
