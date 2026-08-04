"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/panel";
import { AppNav } from "@/components/app-nav";
import { logoutAction } from "@/app/logout/actions";

/**
 * Single hamburger trigger for navigation + logout — replaces the old
 * always-visible sidebar/tab-row combo. One compact control at every
 * viewport size instead of three separate UI regions.
 */
export function NavMenu({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="nav-menu-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className={clsx(
          "flex size-10 items-center justify-center rounded-lg text-lg leading-none transition-colors",
          open
            ? "bg-[var(--accent-soft)] text-accent"
            : "text-muted hover:bg-[var(--panel-hover)] hover:text-foreground",
        )}
      >
        <span aria-hidden>☰</span>
      </button>

      {open ? (
        <Panel
          id="nav-menu-panel"
          raised
          className="absolute top-[calc(100%+0.5rem)] left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-4 p-3"
        >
          <AppNav onNavigate={() => setOpen(false)} />

          {connected ? (
            <form action={logoutAction} className="border-t border-[var(--line)] pt-3">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-[var(--panel-hover)] hover:text-danger"
              >
                Logout
              </button>
            </form>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
