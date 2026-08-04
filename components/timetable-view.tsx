"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/panel";
import { WeekGrid } from "@/components/week-grid";
import { AddClassForm } from "@/components/add-class-form";
import {
  applyCustom,
  currentAndNextClass,
  to12h,
  weekCourseCodes,
  type CustomClass,
  type WeekSchedule,
} from "@/lib/academia/timetable-grid";
import { nowHHMM } from "@/lib/timetable/day-order";
import { useTodayDayOrder } from "@/lib/timetable/day-order-store";
import { useTimetableCustom, useTimetableViewMode } from "@/lib/timetable/custom-store";

/** Compact colour cycling so each course reads distinctly, theme-agnostic. */
const COURSE_TINTS = [
  "var(--accent)",
  "var(--success)",
  "var(--warn)",
  "var(--danger)",
];

const DAY_CORRECTIONS = [1, 2, 3, 4, 5];

export function TimetableView({ week }: { week: WeekSchedule }) {
  const {
    custom,
    toggleOptional,
    removeClass,
    restoreClass,
    addClass,
    removeCustomClass,
  } = useTimetableCustom();
  const { view, setView } = useTimetableViewMode();

  // Ticking clock, mounted client-side only so the first paint matches the
  // server render exactly (no "now" text to mismatch during hydration).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const { dayOrder: todayDayOrder, source: todayDayOrderSource, correctTo } = useTodayDayOrder(now);
  const [correcting, setCorrecting] = useState(false);
  const [adding, setAdding] = useState(false);

  const displayWeek = useMemo(() => applyCustom(week, custom), [week, custom]);

  // Day-order tab selection: derived each render so it tracks today's day
  // order as soon as it's known (no effect needed), until the student
  // manually picks a tab — then the override wins.
  const [manualDay, setManualDay] = useState<number | null>(null);
  const todayHasClasses = displayWeek.days.some(
    (d) => d.dayOrder === todayDayOrder && d.classes.length > 0,
  );
  const defaultDay =
    todayDayOrder && todayHasClasses
      ? todayDayOrder
      : (displayWeek.days.find((d) => d.classes.length)?.dayOrder ?? 1);
  const day = manualDay ?? defaultDay;

  function selectDay(d: number) {
    setManualDay(d);
  }

  // Stable colour per course code across the week.
  const codes = weekCourseCodes(displayWeek);
  const tintOf = (code: string) =>
    COURSE_TINTS[codes.indexOf(code) % COURSE_TINTS.length];

  const active = displayWeek.days.find((d) => d.dayOrder === day);
  const onToday = now !== null && active?.dayOrder === todayDayOrder;
  const { current, next } = onToday
    ? currentAndNextClass(active!.classes, nowHHMM(now!))
    : { current: undefined, next: undefined };

  // Removed scraped courses, looked up from the pre-customization week so the
  // restore list keeps showing their titles after they've been hidden.
  const removedCourses = useMemo(() => {
    if (!custom.removed.length) return [];
    const byCode = new Map<string, { code: string; title: string }>();
    for (const d of week.days) {
      for (const c of d.classes) {
        if (custom.removed.includes(c.course.code) && !byCode.has(c.course.code)) {
          byCode.set(c.course.code, { code: c.course.code, title: c.course.title });
        }
      }
    }
    for (const c of week.unplaced) {
      if (custom.removed.includes(c.code) && !byCode.has(c.code)) {
        byCode.set(c.code, { code: c.code, title: c.title });
      }
    }
    return [...byCode.values()];
  }, [week, custom.removed]);

  function handleAdd(entry: Omit<CustomClass, "id">) {
    addClass(entry);
    setAdding(false);
  }

  return (
    <Panel className="overflow-hidden">
      {/* Row 1 — title, view toggle, add-class trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4 sm:p-5">
        <h2 className="font-medium">Timetable</h2>
        <div className="flex items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Timetable view"
            className="flex gap-0.5 rounded-lg bg-[var(--panel-hover)] p-0.5"
          >
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  view === v
                    ? "bg-[var(--accent-soft)] text-accent"
                    : "text-muted hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            aria-expanded={adding}
            className={clsx(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              adding
                ? "bg-[var(--accent-soft)] text-accent"
                : "text-muted hover:bg-[var(--panel-hover)] hover:text-foreground",
            )}
          >
            {adding ? "Cancel" : "+ Add class"}
          </button>
        </div>
      </div>

      {adding ? (
        <AddClassForm onSubmit={handleAdd} onCancel={() => setAdding(false)} />
      ) : null}

      {/* Row 2 — day-order tabs + Today/Now (day view only) */}
      {view === "day" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div className="flex gap-1" role="tablist" aria-label="Day order">
            {displayWeek.days.map((d) => (
              <button
                key={d.dayOrder}
                role="tab"
                aria-selected={d.dayOrder === day}
                onClick={() => selectDay(d.dayOrder)}
                className={clsx(
                  "relative size-9 rounded-lg text-sm font-medium tabular-nums transition-colors",
                  d.dayOrder === day
                    ? "bg-[var(--accent-soft)] text-accent"
                    : "text-muted hover:bg-[var(--panel-hover)] hover:text-foreground",
                )}
                title={`Day Order ${d.dayOrder}`}
              >
                {d.dayOrder}
                {d.dayOrder === todayDayOrder ? (
                  <span
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--accent)]"
                    aria-hidden
                  />
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            {now ? <span className="tabular-nums">{to12h(nowHHMM(now))}</span> : null}
            {correcting ? (
              <span className="flex items-center gap-1">
                <span>
                  {todayDayOrder ? `· Today: Day ${todayDayOrder}` : "· No classes today"}
                </span>
                {DAY_CORRECTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      correctTo(d);
                      setCorrecting(false);
                    }}
                    className="size-5 rounded text-[0.7rem] font-medium text-muted transition-colors hover:bg-[var(--panel-hover)] hover:text-foreground"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => setCorrecting(false)}
                  className="text-faint hover:text-foreground"
                  aria-label="Cancel correction"
                >
                  ×
                </button>
              </span>
            ) : todayDayOrder && todayDayOrderSource !== "anchor" ? (
              // Guessed or long-unconfirmed — the value itself is the
              // correction trigger, since it's the least trustworthy state.
              <button
                onClick={() => setCorrecting(true)}
                title={
                  todayDayOrderSource === "unconfirmed"
                    ? "Anchored over two weeks ago — SRM's rotation skips holidays, so this may have drifted. Tap to confirm."
                    : "Guessed from the weekday. SRM's rotation skips holidays — set it once and it stays right."
                }
                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                · Today: Day {todayDayOrder} (
                {todayDayOrderSource === "unconfirmed" ? "unconfirmed" : "guess"})
              </button>
            ) : (
              <>
                {todayDayOrder ? (
                  <span>· Today: Day {todayDayOrder}</span>
                ) : now ? (
                  <span>· No classes today</span>
                ) : null}
                {now ? (
                  <button
                    onClick={() => setCorrecting(true)}
                    className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Not right?
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Content */}
      {view === "week" ? (
        <WeekGrid week={displayWeek} todayDayOrder={todayDayOrder} />
      ) : active && active.classes.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
          {active.classes.map((c) => {
            const key = c.custom ? c.customId! : c.course.code;
            const isCurrent = current === c;
            const isNext = next === c;
            return (
              <li
                key={c.custom ? c.customId : `${c.period}-${c.course.code}`}
                className={clsx(
                  "flex flex-col gap-2 rounded-xl border p-3 transition-colors",
                  isCurrent
                    ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                    : "border-[var(--line)] hover:bg-[var(--panel-hover)]",
                )}
              >
                <div
                  className={clsx(
                    "flex min-w-0 items-start gap-2 transition-opacity",
                    c.optional && "opacity-55",
                  )}
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: tintOf(c.course.code) }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-medium">{c.course.title}</p>
                      {isCurrent ? <Badge tone="accent">Now</Badge> : null}
                      {isNext ? <Badge>Next</Badge> : null}
                      {c.optional ? <Badge>Optional</Badge> : null}
                      {c.custom ? <Badge>Added</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {c.course.code ? (
                        <span className="font-mono">{c.course.code}</span>
                      ) : null}
                      {c.course.room ? ` · ${c.course.room}` : ""}
                      {c.course.faculty ? ` · ${c.course.faculty}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                  <p className="font-mono text-xs tabular-nums text-muted">
                    {to12h(c.start)} – {to12h(c.end)}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={!!c.optional}
                      onClick={() => toggleOptional(key)}
                      className={clsx(
                        "rounded px-1.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap transition-colors",
                        c.optional
                          ? "text-accent"
                          : "text-faint hover:text-foreground",
                      )}
                    >
                      {c.optional ? "Required" : "Optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        c.custom ? removeCustomClass(c.customId!) : removeClass(c.course.code)
                      }
                      className="rounded px-1.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap text-faint transition-colors hover:text-danger"
                    >
                      {c.custom ? "Delete" : "Remove"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-8 text-center text-muted">No classes on this day order.</p>
      )}

      {displayWeek.unplaced.length > 0 ? (
        <div className="border-t border-[var(--line)] p-4 text-sm text-muted sm:p-5">
          <span className="font-medium text-foreground">Also registered:</span>{" "}
          {displayWeek.unplaced.map((c) => c.title).join(", ")}{" "}
          <span className="text-faint">
            (lab slots — timings shown in the official portal)
          </span>
        </div>
      ) : null}

      {removedCourses.length > 0 ? (
        <div className="border-t border-[var(--line)] p-4 text-sm sm:p-5">
          <span className="font-medium">Removed:</span>{" "}
          {removedCourses.map((c, i) => (
            <span key={c.code}>
              {i > 0 ? ", " : ""}
              {c.title}{" "}
              <button
                onClick={() => restoreClass(c.code)}
                className="text-accent underline decoration-dotted underline-offset-2 hover:no-underline"
              >
                restore
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "accent" | "neutral";
}) {
  return (
    <span
      className={clsx(
        "rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase",
        tone === "accent"
          ? "bg-[var(--accent)] text-[var(--bg)]"
          : "bg-[var(--panel-hover)] text-muted",
      )}
    >
      {children}
    </span>
  );
}
