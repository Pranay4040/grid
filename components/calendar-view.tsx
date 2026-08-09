"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/panel";
import { buildCalendarMonth, shiftMonth } from "@/lib/timetable/calendar";
import { toDateKey } from "@/lib/timetable/day-order";
import { to12h, applyCustom, type WeekSchedule } from "@/lib/academia/timetable-grid";
import { useDayOrderAnchor, useTodayDayOrder } from "@/lib/timetable/day-order-store";
import { useTimetableCustom } from "@/lib/timetable/custom-store";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Same cycling the timetable uses, so a course reads the same colour here. */
const COURSE_TINTS = [
  "var(--accent)",
  "var(--success)",
  "var(--warn)",
  "var(--danger)",
];

export function CalendarView({ week }: { week: WeekSchedule }) {
  const { custom } = useTimetableCustom();

  // Client-only clock, same pattern as TimetableView: null until mounted so
  // the first paint matches the server render exactly. It keeps ticking so the
  // "today" cell stays correct on a tab left open past midnight.
  // Unlike the timetable (which needs minute precision for "current class"),
  // nothing here changes within a day — so the tick keeps the SAME Date object
  // unless the calendar date actually rolled over. That keeps `now` referentially
  // stable, so the month grid isn't rebuilt and re-rendered every minute.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = new Date();
        return prev && toDateKey(prev) === toDateKey(next) ? prev : next;
      });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const anchor = useDayOrderAnchor();
  const { source: todayDayOrderSource } = useTodayDayOrder(now);

  const displayWeek = useMemo(() => applyCustom(week, custom), [week, custom]);

  // Month offset from the current month — kept as a delta rather than a
  // concrete (year, month) so it stays correct before the clock mounts.
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const base = now ?? new Date(2026, 0, 1); // placeholder pre-mount; not rendered
  const { year, month } = shiftMonth(base.getFullYear(), base.getMonth(), monthOffset);

  const grid = useMemo(
    () => buildCalendarMonth(year, month, anchor, now, displayWeek),
    [year, month, anchor, now, displayWeek],
  );

  const codes = useMemo(() => {
    const list: string[] = [];
    for (const d of displayWeek.days) {
      for (const c of d.classes) {
        if (!list.includes(c.course.code)) list.push(c.course.code);
      }
    }
    return list;
  }, [displayWeek]);
  const tintOf = (code: string) =>
    COURSE_TINTS[codes.indexOf(code) % COURSE_TINTS.length];

  const selected = selectedKey
    ? grid.weeks.flat().find((c) => c.dateKey === selectedKey) ?? null
    : null;
  const selectedClasses =
    selected?.dayOrder != null
      ? (displayWeek.days.find((d) => d.dayOrder === selected.dayOrder)?.classes ?? [])
      : [];

  return (
    <>
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4 sm:p-5">
          <h2 className="font-medium">{now ? grid.label : "Calendar"}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o - 1)}
              aria-label="Previous month"
              className="size-9 rounded-lg text-muted transition-colors hover:bg-[var(--panel-hover)] hover:text-foreground"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              className={clsx(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                monthOffset === 0
                  ? "text-faint"
                  : "text-muted hover:bg-[var(--panel-hover)] hover:text-foreground",
              )}
              disabled={monthOffset === 0}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset((o) => o + 1)}
              aria-label="Next month"
              className="size-9 rounded-lg text-muted transition-colors hover:bg-[var(--panel-hover)] hover:text-foreground"
            >
              ›
            </button>
          </div>
        </div>

        {now ? (
          <div className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="pb-1 text-center text-[0.65rem] font-medium tracking-wide text-faint uppercase"
                >
                  {label}
                </div>
              ))}

              {grid.weeks.flat().map((cell) => {
                const isSelected = cell.dateKey === selectedKey;
                const interactive = cell.inMonth && cell.dayOrder != null;
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() =>
                      setSelectedKey(isSelected ? null : cell.dateKey)
                    }
                    aria-label={`${cell.dateKey}${cell.dayOrder ? `, day order ${cell.dayOrder}` : ""}`}
                    aria-pressed={isSelected}
                    className={clsx(
                      // Fixed height, NOT aspect-square: squares are fine on a
                      // phone (~48px) but on a wide screen each cell became
                      // ~150px tall holding three short lines, which is the
                      // exact wasted space this UI was reworked to remove.
                      "flex min-h-12 flex-col items-center justify-center rounded-lg border p-1 transition-colors sm:min-h-14",
                      !cell.inMonth && "opacity-30",
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : cell.isToday
                          ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]/40"
                          : "border-transparent hover:bg-[var(--panel-hover)]",
                      !interactive && "cursor-default",
                    )}
                  >
                    <span
                      className={clsx(
                        "text-xs tabular-nums",
                        cell.isToday
                          ? "font-semibold text-accent"
                          : cell.isWeekend
                            ? "text-faint"
                            : "text-foreground",
                      )}
                    >
                      {cell.dayOfMonth}
                    </span>
                    {cell.dayOrder != null ? (
                      <span className="mt-0.5 text-[0.6rem] leading-none text-muted tabular-nums">
                        D{cell.dayOrder}
                      </span>
                    ) : (
                      <span className="mt-0.5 text-[0.6rem] leading-none text-faint">
                        ·
                      </span>
                    )}
                    {cell.classCount > 0 ? (
                      <span className="mt-0.5 text-[0.55rem] leading-none text-faint tabular-nums">
                        {cell.classCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted">Loading calendar…</div>
        )}

        <div className="border-t border-[var(--line)] p-4 text-xs text-muted sm:p-5">
          <span className="font-medium text-foreground">Day orders are projected.</span>{" "}
          Academia publishes no academic calendar to this account, so each date&apos;s
          day order is counted forward from the one you last confirmed on the
          Timetable page — it will drift after any holiday the rotation skips.
          Weekends show no day order because we can&apos;t know which Saturdays SRM
          declares working.
          {todayDayOrderSource && todayDayOrderSource !== "anchor" ? (
            <>
              {" "}
              <span className="text-warn">
                Today&apos;s day order is currently a{" "}
                {todayDayOrderSource === "unconfirmed" ? "long-unconfirmed anchor" : "weekday guess"} —
                confirm it on the Timetable page to make this whole month accurate.
              </span>
            </>
          ) : null}
        </div>
      </Panel>

      {selected ? (
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] p-4 sm:p-5">
            <h2 className="font-medium">
              {selected.dateKey}
              {selected.dayOrder != null ? (
                <span className="ml-2 text-sm font-normal text-muted">
                  Day order {selected.dayOrder}
                </span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="text-xs text-muted transition-colors hover:text-foreground"
            >
              Close
            </button>
          </div>

          {selected.dayOrder == null ? (
            <p className="p-6 text-center text-sm text-muted">
              {selected.isWeekend
                ? "Weekend — no day order projected."
                : "No day order available for this date."}
            </p>
          ) : selectedClasses.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              No classes on day order {selected.dayOrder}.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {selectedClasses.map((c) => (
                <li
                  key={c.custom ? c.customId : `${c.period}-${c.course.code}`}
                  className={clsx(
                    "rounded-xl border border-[var(--line)] p-3",
                    c.optional && "opacity-55",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: tintOf(c.course.code) }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{c.course.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {c.course.code ? (
                          <span className="font-mono">{c.course.code}</span>
                        ) : null}
                        {c.course.room ? ` · ${c.course.room}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs tabular-nums text-muted">
                    {to12h(c.start)} – {to12h(c.end)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </>
  );
}
