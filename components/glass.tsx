import { clsx } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type PanelProps = ComponentPropsWithoutRef<"div"> & {
  /** Denser frost — for surfaces sitting above other glass. */
  strong?: boolean;
};

export function GlassPanel({
  strong = false,
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <div
      className={clsx(
        strong ? "glass-strong" : "glass",
        "glass-edge rounded-2xl",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Semantic tones only — never a literal hue. `accent` follows the active
 * theme; the status tones stay meaningful across every palette.
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
    <GlassPanel className="p-5">
      <p className="text-[0.7rem] font-medium tracking-[0.14em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-3 flex items-baseline gap-1">
        <span
          className={clsx("text-4xl font-semibold tabular-nums", TONE_TEXT[tone])}
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
    </GlassPanel>
  );
}
