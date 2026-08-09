"use client";

import { useCallback, useSyncExternalStore } from "react";
import { makeJsonStore } from "@/lib/store/json-store";
import type { EstimateMap, SubjectEstimate } from "@/lib/academia/gpa";

export const STORAGE_ESTIMATES = "grid.gpa.estimates";

function isSubjectEstimate(v: unknown): v is SubjectEstimate {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  const okField = (x: unknown) => x === null || typeof x === "number";
  return okField(s.internal) && okField(s.external);
}

function isEstimateMap(v: unknown): v is EstimateMap {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(isSubjectEstimate);
}

const estimateStore = makeJsonStore<EstimateMap>(STORAGE_ESTIMATES, {}, isEstimateMap);

/** Manual internal/external mark estimates, per course code, feeding the
 *  GPA page's estimateSemester(). Empty inputs are stored as null, never 0 —
 *  a not-yet-entered field must stay excluded from the SGPA, not scored as
 *  "attempted 0". */
export function useGpaEstimates() {
  const estimates = useSyncExternalStore(
    estimateStore.subscribe,
    estimateStore.getSnapshot,
    estimateStore.getServerSnapshot,
  );

  const update = useCallback((fn: (prev: EstimateMap) => EstimateMap) => {
    estimateStore.set(fn(estimateStore.getSnapshot()));
  }, []);

  const setInternal = useCallback(
    (code: string, value: number | null) =>
      update((prev) => ({
        ...prev,
        [code]: { internal: value, external: prev[code]?.external ?? null },
      })),
    [update],
  );

  const setExternal = useCallback(
    (code: string, value: number | null) =>
      update((prev) => ({
        ...prev,
        [code]: { internal: prev[code]?.internal ?? null, external: value },
      })),
    [update],
  );

  const clearAll = useCallback(() => estimateStore.set({}), []);

  return { estimates, setInternal, setExternal, clearAll };
}
