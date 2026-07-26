"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

export const THEMES = [
  { id: "slate", label: "Slate" },
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "sunset", label: "Sunset" },
  { id: "rose", label: "Rose" },
  { id: "mono", label: "Mono" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
/** "system" follows the OS; light/dark are explicit user overrides. */
export type ModePref = "light" | "dark" | "system";

export const STORAGE_THEME = "pf.theme";
export const STORAGE_MODE = "pf.mode";
const DEFAULT_THEME: ThemeId = "slate";
const DEFAULT_MODE: ModePref = "system";

/**
 * Runs before first paint to stamp the theme attributes, so the page never
 * flashes the wrong palette. Dependency-free and defensive: a storage failure
 * (private mode, blocked cookies) must never block rendering.
 */
export const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem("${STORAGE_THEME}") || "${DEFAULT_THEME}";
    var m = localStorage.getItem("${STORAGE_MODE}") || "${DEFAULT_MODE}";
    var resolved = m === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : m;
    var el = document.documentElement;
    el.setAttribute("data-theme", t);
    el.setAttribute("data-mode", resolved);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "${DEFAULT_THEME}");
    document.documentElement.setAttribute("data-mode", "dark");
  }
})();
`;

/* ---------------------------------------------------------------------------
   External stores.

   localStorage and matchMedia are external mutable sources, so they're read
   through useSyncExternalStore rather than mirrored into state inside an
   effect. That avoids the cascading re-render the naive version caused, and
   lets React handle the server→client snapshot swap during hydration.
--------------------------------------------------------------------------- */

type Listener = () => void;

function makeStorageStore<T extends string>(key: string, fallback: T) {
  const listeners = new Set<Listener>();
  // Cached so getSnapshot stays cheap and referentially stable between reads.
  let cache: T | null = null;

  const emit = () => listeners.forEach((l) => l());

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      // Keep other tabs in sync.
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
      try {
        cache = (localStorage.getItem(key) as T | null) ?? fallback;
      } catch {
        cache = fallback;
      }
      return cache;
    },
    getServerSnapshot: () => fallback,
    set(value: T) {
      cache = value;
      try {
        localStorage.setItem(key, value);
      } catch {
        /* non-fatal: selection just won't survive a reload */
      }
      emit();
    },
  };
}

const themeStore = makeStorageStore<ThemeId>(STORAGE_THEME, DEFAULT_THEME);
const modeStore = makeStorageStore<ModePref>(STORAGE_MODE, DEFAULT_MODE);

const DARK_QUERY = "(prefers-color-scheme: dark)";
const systemDarkStore = {
  subscribe(listener: Listener) {
    const mq = window.matchMedia(DARK_QUERY);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  },
  getSnapshot: () => window.matchMedia(DARK_QUERY).matches,
  getServerSnapshot: () => true, // matches the init script's failure default
};

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  mode: ModePref;
  setMode: (m: ModePref) => void;
  /** The mode actually in effect once "system" is resolved. */
  resolvedMode: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );
  const mode = useSyncExternalStore(
    modeStore.subscribe,
    modeStore.getSnapshot,
    modeStore.getServerSnapshot,
  );
  const systemDark = useSyncExternalStore(
    systemDarkStore.subscribe,
    systemDarkStore.getSnapshot,
    systemDarkStore.getServerSnapshot,
  );

  // Derived during render — no state, so no extra render pass.
  const resolvedMode: "light" | "dark" =
    mode === "system" ? (systemDark ? "dark" : "light") : mode;

  // Push the result out to the DOM. This is the legitimate use of an effect:
  // synchronising an external system with React state.
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", theme);
    el.setAttribute("data-mode", resolvedMode);
  }, [theme, resolvedMode]);

  const setTheme = useCallback((t: ThemeId) => themeStore.set(t), []);
  const setMode = useCallback((m: ModePref) => modeStore.set(m), []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, mode, setMode, resolvedMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
