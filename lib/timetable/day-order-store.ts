"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  resolveDayOrder,
  toDateKey,
  workingDaysSinceAnchor,
  STALE_ANCHOR_WORKING_DAYS,
  type DayOrderAnchor,
} from "./day-order";

/** Where today's day-order value came from — the UI uses this to decide
 *  whether to present it as settled fact or as something worth confirming.
 *  "anchor": a manual correction, reconfirmed within the last
 *  STALE_ANCHOR_WORKING_DAYS working days. "unconfirmed": a manual anchor
 *  that's been projecting forward for longer than that with no way to know
 *  if a holiday desynced it. "guess": no anchor at all, bare weekday guess. */
export type DayOrderSource = "anchor" | "unconfirmed" | "guess";

export const STORAGE_DAY_ANCHOR = "pf.timetable.dayAnchor";

/* Same external-store shape as components/theme.tsx: localStorage is read
   through useSyncExternalStore (with a cached snapshot + cross-tab sync)
   rather than mirrored into state inside an effect. */

type Listener = () => void;

function isAnchor(v: unknown): v is DayOrderAnchor {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return typeof a.date === "string" && typeof a.dayOrder === "number";
}

function makeAnchorStore(key: string) {
  const listeners = new Set<Listener>();
  let cache: DayOrderAnchor | null | undefined; // undefined = not read yet

  const emit = () => listeners.forEach((l) => l());

  const read = (): DayOrderAnchor | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isAnchor(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) {
          cache = undefined;
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot(): DayOrderAnchor | null {
      if (cache === undefined) cache = read();
      return cache;
    },
    getServerSnapshot: () => null,
    set(value: DayOrderAnchor) {
      cache = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* non-fatal: correction just won't survive a reload */
      }
      emit();
    },
  };
}

const anchorStore = makeAnchorStore(STORAGE_DAY_ANCHOR);

/**
 * The raw stored anchor. `useTodayDayOrder` resolves it for today specifically;
 * this is for callers that project day-orders across OTHER dates — the calendar
 * month grid, which needs to run resolveDayOrder() per cell rather than for a
 * single "now". Returns null when the student has never confirmed a day-order.
 */
export function useDayOrderAnchor(): DayOrderAnchor | null {
  return useSyncExternalStore(
    anchorStore.subscribe,
    anchorStore.getSnapshot,
    anchorStore.getServerSnapshot,
  );
}

/**
 * Today's resolved day-order plus a way to correct it (e.g. the rotation
 * skipped a day for a holiday). `now` is passed in rather than read from
 * `Date.now()` here so the caller owns the ticking clock; pass `null` before
 * the client clock has mounted (avoids a server/client hydration mismatch) —
 * `dayOrder` is `null` in that case too.
 */
export function useTodayDayOrder(now: Date | null) {
  const anchor = useSyncExternalStore(
    anchorStore.subscribe,
    anchorStore.getSnapshot,
    anchorStore.getServerSnapshot,
  );

  const dayOrder = now ? resolveDayOrder(anchor, now) : null;

  const source: DayOrderSource | null =
    dayOrder === null || !now
      ? null
      : !anchor
        ? "guess"
        : workingDaysSinceAnchor(anchor, now) > STALE_ANCHOR_WORKING_DAYS
          ? "unconfirmed"
          : "anchor";

  const correctTo = useCallback(
    (value: number) => {
      if (!now) return;
      anchorStore.set({ date: toDateKey(now), dayOrder: value });
    },
    [now],
  );

  return { dayOrder, source, correctTo };
}
