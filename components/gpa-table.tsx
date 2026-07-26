"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { GlassPanel } from "@/components/glass";
import {
  EXTERNAL_MAX,
  INTERNAL_MAX,
  MARK_GRADE_CUTOFFS,
  gradeRequirements,
  type GradeLetter,
  type SubjectResult,
} from "@/lib/academia/gpa";

/** Low-to-high, for the slider: dragging right = a better grade. */
const GRADES_ASCENDING: GradeLetter[] = [...MARK_GRADE_CUTOFFS].reverse().map((c) => c.grade);

const numberFieldClass =
  "w-20 rounded-lg border border-[var(--line)] bg-[var(--glass-bg)] px-2 py-1 text-sm tabular-nums outline-none transition-colors focus:border-[var(--accent)]";

function parseInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure visualization: for a given grade target, shows the /75 external mark
 * needed given the subject's CURRENT internal total (portal + whatever's
 * typed so far, unset treated as 0 — a live what-if, not the stricter
 * null-when-unset totalInternal used for the row's own numbers). Never writes
 * to the external estimate input or the SGPA total; local state only, not
 * persisted, resets on reload.
 */
function SliderRow({ subject }: { subject: SubjectResult }) {
  const defaultIndex =
    subject.grade !== null
      ? GRADES_ASCENDING.indexOf(subject.grade)
      : Math.floor(GRADES_ASCENDING.length / 2);
  const [index, setIndex] = useState(defaultIndex);

  const workingInternalTotal = subject.portalInternal + (subject.internalEstimate ?? 0);
  const requirements = gradeRequirements(workingInternalTotal);
  const grade = GRADES_ASCENDING[index];
  const req = requirements.find((r) => r.grade === grade)!;

  const labelTone =
    req.status === "secured"
      ? "text-success"
      : req.status === "unreachable"
        ? "text-danger"
        : "text-accent";
  const label =
    req.status === "secured"
      ? `${grade}: already secured by your internal marks`
      : req.status === "unreachable"
        ? `${grade}: not reachable this exam (would need ${req.requiredExternalRaw}/75)`
        : `${grade}: need ${req.requiredExternalRaw}/75 on the external`;

  return (
    <tr>
      <td colSpan={10} className="bg-[var(--glass-hover)]/40 px-3 pt-1 pb-3 sm:px-5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="range"
            min={0}
            max={GRADES_ASCENDING.length - 1}
            step={1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label={`Grade explorer for ${subject.title || subject.code}`}
            className="h-1.5 flex-1 accent-[var(--accent)] sm:max-w-xs"
          />
          <span className={clsx("shrink-0 text-xs font-medium tabular-nums", labelTone)}>
            {label}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-[0.65rem] text-faint sm:max-w-xs">
          {GRADES_ASCENDING.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function SubjectRows({
  subject,
  onSetInternal,
  onSetExternal,
}: {
  subject: SubjectResult;
  onSetInternal: (code: string, value: number | null) => void;
  onSetExternal: (code: string, value: number | null) => void;
}) {
  const internalOver = subject.totalInternal !== null && subject.totalInternal > INTERNAL_MAX;
  const totalOver = subject.totalMark !== null && subject.totalMark > 100;

  return (
    <>
      <tr className="border-t border-[var(--line)]">
        <td className="max-w-[14rem] truncate p-3 font-medium sm:px-5">{subject.title}</td>
        <td className="p-3 font-mono text-xs sm:px-5">{subject.code}</td>
        <td className="p-3 tabular-nums sm:px-5">{subject.credit}</td>

        <td className="p-3 tabular-nums sm:px-5">
          {subject.portalInternal}
          {subject.portalInternal === 0 ? (
            <span className="ml-1 block text-[0.65rem] whitespace-nowrap text-faint">
              not published
            </span>
          ) : null}
        </td>
        <td className="p-3 sm:px-5">
          <input
            type="number"
            min={0}
            max={INTERNAL_MAX - subject.portalInternal}
            value={subject.internalEstimate ?? ""}
            onChange={(e) => onSetInternal(subject.code, parseInput(e.target.value))}
            aria-label={`Internal estimate for ${subject.title || subject.code}`}
            className={numberFieldClass}
          />
        </td>
        <td
          className={clsx(
            "p-3 tabular-nums sm:px-5",
            internalOver && "font-medium text-danger",
          )}
        >
          {subject.totalInternal === null ? "—" : subject.totalInternal}
        </td>

        <td className="p-3 sm:px-5">
          <input
            type="number"
            min={0}
            max={EXTERNAL_MAX}
            value={subject.externalEstimate ?? ""}
            onChange={(e) => onSetExternal(subject.code, parseInput(e.target.value))}
            aria-label={`External estimate for ${subject.title || subject.code}`}
            className={numberFieldClass}
          />
        </td>
        <td className="p-3 tabular-nums sm:px-5">
          {subject.externalConverted === null ? "—" : subject.externalConverted.toFixed(1)}
        </td>
        <td
          className={clsx("p-3 tabular-nums sm:px-5", totalOver && "font-medium text-danger")}
        >
          {subject.totalMark === null ? "—" : subject.totalMark.toFixed(1)}
        </td>
        <td className="p-3 font-medium sm:px-5">{subject.grade ?? "—"}</td>
      </tr>
      <SliderRow subject={subject} />
    </>
  );
}

export function GpaTable({
  subjects,
  onSetInternal,
  onSetExternal,
}: {
  subjects: SubjectResult[];
  onSetInternal: (code: string, value: number | null) => void;
  onSetExternal: (code: string, value: number | null) => void;
}) {
  if (subjects.length === 0) {
    return (
      <GlassPanel className="p-8 text-center text-muted">No registered courses.</GlassPanel>
    );
  }

  return (
    <GlassPanel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">GPA estimator</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="p-3 sm:px-5" colSpan={3} />
              <th
                className="border-b border-[var(--line)] p-3 text-center font-medium sm:px-5"
                colSpan={3}
              >
                Internal /60
              </th>
              <th
                className="border-b border-[var(--line)] p-3 text-center font-medium sm:px-5"
                colSpan={2}
              >
                External /40
              </th>
              <th className="border-b border-[var(--line)] p-3 sm:px-5" colSpan={2} />
            </tr>
            <tr className="border-b border-[var(--line)] text-left text-xs text-muted">
              <th className="p-3 font-medium sm:px-5">Subject</th>
              <th className="p-3 font-medium sm:px-5">Code</th>
              <th className="p-3 font-medium sm:px-5">Credit</th>
              <th className="p-3 font-medium sm:px-5">Portal</th>
              <th className="p-3 font-medium sm:px-5">Your estimate</th>
              <th className="p-3 font-medium sm:px-5">Total</th>
              <th className="p-3 font-medium sm:px-5">Your estimate /75</th>
              <th className="p-3 font-medium sm:px-5">Converted</th>
              <th className="p-3 font-medium sm:px-5">Total /100</th>
              <th className="p-3 font-medium sm:px-5">Grade</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <SubjectRows
                key={s.code}
                subject={s}
                onSetInternal={onSetInternal}
                onSetExternal={onSetExternal}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--line)] p-4 text-xs text-muted sm:p-5">
        Internal marks reflect what Academia has published so far (currently none
        this term) plus your own estimate for what&apos;s left. External is your
        own estimate of end-semester performance out of 75, converted to its
        40-mark weight. Marks-to-grade cutoffs are a commonly-cited scale, not
        verified against an official document. The slider below each row is a
        what-if visualization only — it doesn&apos;t change your estimate or the
        SGPA above.
      </div>
    </GlassPanel>
  );
}
