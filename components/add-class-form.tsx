"use client";

import { useId, useState, type FormEvent } from "react";
import { PERIOD_TIMES, to12h, type CustomClass } from "@/lib/academia/timetable-grid";

const DAY_ORDERS = [1, 2, 3, 4, 5];

const fieldClass =
  "rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]";
const labelClass = "grid gap-1 text-sm";
const captionClass = "text-xs font-medium text-muted";

export function AddClassForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (entry: Omit<CustomClass, "id">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState("");
  const [faculty, setFaculty] = useState("");
  const [dayOrder, setDayOrder] = useState(1);
  const [period, setPeriod] = useState(1);
  const titleId = useId();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      code: code.trim() || undefined,
      room: room.trim() || undefined,
      faculty: faculty.trim() || undefined,
      dayOrder,
      period,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 border-t border-[var(--line)] p-4 sm:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={titleId} className={`${labelClass} sm:col-span-2`}>
          <span className={captionClass}>Title</span>
          <input
            id={titleId}
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Guitar club"
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          <span className={captionClass}>Day order</span>
          <select
            value={dayOrder}
            onChange={(e) => setDayOrder(Number(e.target.value))}
            className={fieldClass}
          >
            {DAY_ORDERS.map((d) => (
              <option key={d} value={d}>
                Day {d}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          <span className={captionClass}>Period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className={fieldClass}
          >
            {PERIOD_TIMES.map((t, i) => (
              <option key={i} value={i + 1}>
                P{i + 1} · {to12h(t.start)}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          <span className={captionClass}>Room (optional)</span>
          <input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          <span className={captionClass}>Faculty (optional)</span>
          <input
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          <span className={captionClass}>Code (optional)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. CLUB101"
            className={`${fieldClass} font-mono`}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-accent transition-[filter] hover:brightness-110"
        >
          Add class
        </button>
      </div>
    </form>
  );
}
