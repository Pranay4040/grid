"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { GlassPanel } from "@/components/glass";

type NavItem = { href: string; label: string };

/** Real, working pages. */
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/attendance", label: "Attendance" },
  { href: "/marks", label: "Marks" },
  { href: "/gpa", label: "GPA" },
];

/**
 * Sized for pages that don't exist yet (see ROADMAP.md). Timetable is
 * deliberately NOT here — it already lives on Overview, it's just not a
 * separate tab yet, so labeling it "soon" would misrepresent it.
 */
const SOON_ITEMS = ["Courses", "Calendar"];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function SoonTag() {
  return (
    <span className="rounded-full bg-[var(--glass-hover)] px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide text-faint uppercase">
      Soon
    </span>
  );
}

export function AppNav({ variant }: { variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <GlassPanel className="hidden h-fit w-52 shrink-0 flex-col gap-1 p-2 lg:flex">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--accent-soft)] text-accent"
                  : "text-muted hover:bg-[var(--glass-hover)] hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
        {SOON_ITEMS.map((label) => (
          <span
            key={label}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-faint"
          >
            {label}
            <SoonTag />
          </span>
        ))}
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex gap-1 overflow-x-auto p-2 lg:hidden">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--accent-soft)] text-accent"
                : "text-muted hover:bg-[var(--glass-hover)] hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      {SOON_ITEMS.map((label) => (
        <span
          key={label}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-faint"
        >
          {label}
          <SoonTag />
        </span>
      ))}
    </GlassPanel>
  );
}
