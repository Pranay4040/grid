"use client";

import { clsx } from "clsx";
import { THEMES, useTheme, type ModePref } from "@/components/theme";

const MODES: { id: ModePref; label: string; icon: string }[] = [
  { id: "light", label: "Light", icon: "☀" },
  { id: "dark", label: "Dark", icon: "☾" },
  { id: "system", label: "System", icon: "◐" },
];

/** Swatch preview for a theme, drawn from the same hues the theme applies. */
const SWATCH: Record<string, string> = {
  slate: "linear-gradient(135deg, rgb(99 116 154), rgb(71 85 120))",
  ocean: "linear-gradient(135deg, rgb(40 160 160), rgb(14 90 130))",
  forest: "linear-gradient(135deg, rgb(90 140 70), rgb(30 90 70))",
  sunset: "linear-gradient(135deg, rgb(200 140 60), rgb(160 60 60))",
  rose: "linear-gradient(135deg, rgb(190 90 110), rgb(130 50 90))",
  mono: "linear-gradient(135deg, rgb(160 164 178), rgb(90 94 108))",
};

export function ThemeSwitcher() {
  const { theme, setTheme, mode, setMode } = useTheme();

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Mode ------------------------------------------------------------- */}
      <div
        role="radiogroup"
        aria-label="Colour mode"
        className="flex items-center gap-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1"
      >
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.id)}
              title={m.label}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-[var(--accent-soft)] text-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              <span aria-hidden>{m.icon}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Palette ---------------------------------------------------------- */}
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="flex items-center gap-1.5"
      >
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(t.id)}
              title={t.label}
              aria-label={t.label}
              className={clsx(
                "size-7 rounded-full transition-transform",
                "ring-offset-2 ring-offset-[var(--bg)] hover:scale-110",
                active ? "ring-2 ring-[var(--fg)]" : "ring-1 ring-[var(--line)]",
              )}
              style={{ backgroundImage: SWATCH[t.id] }}
            />
          );
        })}
      </div>
    </div>
  );
}
