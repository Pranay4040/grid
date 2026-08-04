"use client";

import { clsx } from "clsx";
import {
  PERIOD_TIMES,
  to12h,
  weekCourseCodes,
  type WeekSchedule,
} from "@/lib/academia/timetable-grid";

/** Kept in sync with TimetableView's cycling so a course reads the same
 *  colour whether you're looking at one day or the whole week. */
const COURSE_TINTS = [
  "var(--accent)",
  "var(--success)",
  "var(--warn)",
  "var(--danger)",
];

export function WeekGrid({
  week,
  todayDayOrder,
}: {
  week: WeekSchedule;
  todayDayOrder?: number | null;
}) {
  const codes = weekCourseCodes(week);
  const tintOf = (code: string) =>
    COURSE_TINTS[codes.indexOf(code) % COURSE_TINTS.length];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-xs sm:text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 border-b border-[var(--line)] bg-[var(--surface-raised)] p-2 text-left font-medium text-muted">
              Day
            </th>
            {PERIOD_TIMES.map((t, i) => (
              <th
                key={i}
                className="border-b border-[var(--line)] p-2 text-center font-medium text-muted"
              >
                <div className="tabular-nums">P{i + 1}</div>
                <div className="text-[0.65rem] font-normal text-faint">
                  {to12h(t.start)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.days.map((day) => {
            const isToday = day.dayOrder === todayDayOrder;
            return (
              <tr key={day.dayOrder}>
                <th
                  scope="row"
                  className={clsx(
                    "sticky left-0 z-10 border-b border-[var(--line)] bg-[var(--surface-raised)] p-2 text-left font-medium tabular-nums",
                    isToday ? "text-accent" : "text-foreground",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {day.dayOrder}
                    {isToday ? (
                      <span
                        className="size-1.5 rounded-full bg-[var(--accent)]"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </th>
                {PERIOD_TIMES.map((_, i) => {
                  const cls = day.classes.find((c) => c.period === i + 1);
                  return (
                    <td
                      key={i}
                      className={clsx(
                        "border-b border-[var(--line)] p-1 align-top",
                        isToday && "bg-[var(--accent-soft)]/30",
                      )}
                    >
                      {cls ? (
                        <div
                          className={clsx(
                            "min-h-[2.5rem] rounded-md py-1 pr-1.5 pl-2 leading-tight transition-opacity",
                            cls.optional && "opacity-50",
                          )}
                          style={{
                            background: "var(--panel-hover)",
                            borderLeft: `2px solid ${tintOf(cls.course.code)}`,
                          }}
                          title={cls.course.title}
                        >
                          <p className="truncate font-medium">
                            {cls.course.title}
                          </p>
                          {cls.course.room ? (
                            <p className="truncate text-[0.65rem] text-faint">
                              {cls.course.room}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div
                          className="min-h-[2.5rem] rounded-md border border-dashed border-[var(--line)]/70"
                          aria-hidden
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
