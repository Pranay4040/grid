"use client";

import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/panel";
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

const fieldClass =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-[var(--accent)]";

function parseInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[0.65rem] font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function ReadStat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[0.65rem] font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      <span
        className={clsx(
          "text-sm font-medium tabular-nums",
          danger ? "text-danger" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Pure visualization: for a given grade target, shows the /75 external mark
 * needed given the subject's CURRENT internal total (portal + whatever's
 * typed so far, unset treated as 0 — a live what-if, not the stricter
 * null-when-unset totalInternal used for the card's own numbers). Never
 * writes to the external estimate input or the SGPA total; local state only,
 * not persisted, resets on reload.
 */
function SliderStrip({ subject }: { subject: SubjectResult }) {
  const defaultIndex =
    subject.grade !== null
      ? GRADES_ASCENDING.indexOf(subject.grade)
      : Math.floor(GRADES_ASCENDING.length / 2);
  const [index, setIndex] = useState(defaultIndex);

  const workingInternalTotal = subject.portalInternal + (subject.internalEstimate ?? 0);
  const requirements = gradeRequirements(workingInternalTotal);
  const grade = GRADES_ASCENDING[index];
  const req = requirements.find((r) => r.grade === grade)!;

  const tone =
    req.status === "secured"
      ? "text-success"
      : req.status === "unreachable"
        ? "text-danger"
        : "text-accent";
  const label =
    req.status === "secured"
      ? `${grade}: already secured`
      : req.status === "unreachable"
        ? `${grade}: not reachable (need ${req.requiredExternalRaw}/75)`
        : `${grade}: need ${req.requiredExternalRaw}/75`;

  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={GRADES_ASCENDING.length - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label={`Grade explorer for ${subject.title || subject.code}`}
          className="h-1.5 flex-1 accent-[var(--accent)]"
        />
        <span className={clsx("shrink-0 text-xs font-medium tabular-nums", tone)}>
          {label}
        </span>
      </div>
      <div className="mt-1 flex justify-between text-[0.6rem] text-faint">
        {GRADES_ASCENDING.map((g) => (
          <span key={g}>{g}</span>
        ))}
      </div>
    </div>
  );
}

function SubjectCard({
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
    <li className="rounded-xl border border-[var(--line)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{subject.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            <span className="font-mono">{subject.code}</span> · {subject.credit} cr
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg leading-none font-semibold tabular-nums">
            {subject.grade ?? "—"}
          </p>
          <p className={clsx("mt-1 text-xs tabular-nums", totalOver ? "text-danger" : "text-muted")}>
            {subject.totalMark === null ? "no estimate yet" : `${subject.totalMark.toFixed(1)}/100`}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--panel-hover)] p-3">
          <p className="text-[0.65rem] font-medium tracking-wide text-muted uppercase">
            Internal /60
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ReadStat label="Portal" value={String(subject.portalInternal)} />
            <Field label="Estimate">
              <input
                type="number"
                min={0}
                max={INTERNAL_MAX - subject.portalInternal}
                value={subject.internalEstimate ?? ""}
                onChange={(e) => onSetInternal(subject.code, parseInput(e.target.value))}
                aria-label={`Internal estimate for ${subject.title || subject.code}`}
                className={fieldClass}
              />
            </Field>
            <ReadStat
              label="Total"
              value={subject.totalInternal === null ? "—" : String(subject.totalInternal)}
              danger={internalOver}
            />
          </div>
          {subject.portalInternal === 0 ? (
            <p className="mt-2 text-[0.65rem] text-faint">Not published yet.</p>
          ) : null}
        </div>

        <div className="rounded-xl bg-[var(--panel-hover)] p-3">
          <p className="text-[0.65rem] font-medium tracking-wide text-muted uppercase">
            External /40
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Estimate /75">
              <input
                type="number"
                min={0}
                max={EXTERNAL_MAX}
                value={subject.externalEstimate ?? ""}
                onChange={(e) => onSetExternal(subject.code, parseInput(e.target.value))}
                aria-label={`External estimate for ${subject.title || subject.code}`}
                className={fieldClass}
              />
            </Field>
            <ReadStat
              label="Converted"
              value={subject.externalConverted === null ? "—" : subject.externalConverted.toFixed(1)}
            />
          </div>
        </div>
      </div>

      <SliderStrip subject={subject} />
    </li>
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
      <Panel className="p-8 text-center text-muted">No registered courses.</Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">GPA estimator</h2>
      </div>
      <ul className="grid grid-cols-1 gap-3 p-4 sm:p-5 xl:grid-cols-2">
        {subjects.map((s) => (
          <SubjectCard
            key={s.code}
            subject={s}
            onSetInternal={onSetInternal}
            onSetExternal={onSetExternal}
          />
        ))}
      </ul>
      <div className="border-t border-[var(--line)] p-4 text-xs text-muted sm:p-5">
        Internal marks reflect what Academia has published so far (currently none
        this term) plus your own estimate for what&apos;s left. External is your
        own estimate of end-semester performance out of 75, converted to its
        40-mark weight. Marks-to-grade cutoffs are a commonly-cited scale, not
        verified against an official document. The slider on each card is a
        what-if visualization only — it doesn&apos;t change your estimate or the
        SGPA above.
      </div>
    </Panel>
  );
}
