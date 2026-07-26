"use client";

/* Same external-store shape as components/theme.tsx: localStorage is read
   through useSyncExternalStore (cached snapshot + cross-tab `storage` sync)
   instead of mirrored into state inside an effect. Shared by every feature
   that persists a small JSON blob client-side (timetable customization, GPA
   estimates, …) so each one doesn't reimplement this. */

type Listener = () => void;

export function makeJsonStore<T>(key: string, fallback: T, isValid: (v: unknown) => v is T) {
  const listeners = new Set<Listener>();
  let cache: T | null = null;

  const emit = () => listeners.forEach((l) => l());

  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return isValid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) {
          cache = null;
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot(): T {
      if (cache !== null) return cache;
      cache = read();
      return cache;
    },
    getServerSnapshot: () => fallback,
    set(value: T) {
      cache = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* non-fatal: edit just won't survive a reload */
      }
      emit();
    },
  };
}
