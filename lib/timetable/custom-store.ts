"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  EMPTY_CUSTOM,
  type CustomClass,
  type TimetableCustom,
} from "@/lib/academia/timetable-grid";
import { makeJsonStore } from "@/lib/store/json-store";

export const STORAGE_CUSTOM = "pf.timetable.custom";
export const STORAGE_VIEW = "pf.timetable.view";

function isCustom(v: unknown): v is TimetableCustom {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    Array.isArray(c.optional) &&
    Array.isArray(c.removed) &&
    Array.isArray(c.added)
  );
}

const customStore = makeJsonStore(STORAGE_CUSTOM, EMPTY_CUSTOM, isCustom);

/** Timetable customization overlay: optional / removed / added classes. */
export function useTimetableCustom() {
  const custom = useSyncExternalStore(
    customStore.subscribe,
    customStore.getSnapshot,
    customStore.getServerSnapshot,
  );

  const update = useCallback((fn: (prev: TimetableCustom) => TimetableCustom) => {
    customStore.set(fn(customStore.getSnapshot()));
  }, []);

  const toggleOptional = useCallback(
    (code: string) =>
      update((prev) => ({
        ...prev,
        optional: prev.optional.includes(code)
          ? prev.optional.filter((c) => c !== code)
          : [...prev.optional, code],
      })),
    [update],
  );

  const removeClass = useCallback(
    (code: string) =>
      update((prev) =>
        prev.removed.includes(code)
          ? prev
          : { ...prev, removed: [...prev.removed, code] },
      ),
    [update],
  );

  const restoreClass = useCallback(
    (code: string) =>
      update((prev) => ({
        ...prev,
        removed: prev.removed.filter((c) => c !== code),
      })),
    [update],
  );

  const addClass = useCallback(
    (entry: Omit<CustomClass, "id">) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      update((prev) => ({ ...prev, added: [...prev.added, { ...entry, id }] }));
      return id;
    },
    [update],
  );

  const removeCustomClass = useCallback(
    (id: string) =>
      update((prev) => ({
        ...prev,
        added: prev.added.filter((a) => a.id !== id),
      })),
    [update],
  );

  return {
    custom,
    toggleOptional,
    removeClass,
    restoreClass,
    addClass,
    removeCustomClass,
  };
}

/* ---------------------------------------------------------------------------
   View preference: single-day tabs vs the full-week grid. A plain preference
   the student sets once and keeps, same reasoning as the theme picker —
   simpler and more predictable than guessing off viewport width.
--------------------------------------------------------------------------- */

export type TimetableViewMode = "day" | "week";
const DEFAULT_VIEW: TimetableViewMode = "day";

function isViewMode(v: unknown): v is TimetableViewMode {
  return v === "day" || v === "week";
}

const viewStore = makeJsonStore(STORAGE_VIEW, DEFAULT_VIEW, isViewMode);

export function useTimetableViewMode() {
  const view = useSyncExternalStore(
    viewStore.subscribe,
    viewStore.getSnapshot,
    viewStore.getServerSnapshot,
  );
  const setView = useCallback((v: TimetableViewMode) => viewStore.set(v), []);
  return { view, setView };
}
