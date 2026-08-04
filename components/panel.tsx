import { clsx } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type PanelProps = ComponentPropsWithoutRef<"div"> & {
  /** Slightly lighter surface — for elements that need to stand out above
   *  other panels (the nav menu popover, sticky table headers). */
  raised?: boolean;
};

export function Panel({ raised = false, className, children, ...rest }: PanelProps) {
  return (
    <div
      className={clsx(
        raised ? "bg-[var(--surface-raised)]" : "bg-[var(--surface)]",
        "rounded-2xl border border-[var(--line)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Semantic tones only — never a literal hue. `accent` follows the theme;
 * the status tones stay meaningful regardless.
 */
export type Tone = "accent" | "success" | "warn" | "danger" | "neutral";

const TONE_TEXT: Record<Tone, string> = {
  accent: "text-accent",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-foreground",
};

type StatTileProps = {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  tone?: Tone;
};

export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = "accent",
}: StatTileProps) {
  return (
    <Panel className="w-full min-w-[9.5rem] flex-1 p-4 sm:w-52 sm:flex-none sm:p-5">
      <p className="text-[0.7rem] font-medium tracking-[0.14em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1">
        <span
          className={clsx("text-3xl font-semibold tabular-nums", TONE_TEXT[tone])}
        >
          {value}
        </span>
        {unit ? (
          <span className={clsx("text-lg font-medium", TONE_TEXT[tone])}>
            {unit}
          </span>
        ) : null}
      </p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </Panel>
  );
}
