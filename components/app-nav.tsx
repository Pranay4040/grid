"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

type NavItem = { href: string; label: string };

/** Real, working pages. */
const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/attendance", label: "Attendance" },
  { href: "/courses", label: "Courses" },
  { href: "/calendar", label: "Calendar" },
  { href: "/marks", label: "Marks" },
  { href: "/gpa", label: "GPA" },
];

/** Sized for pages that don't exist yet (see ROADMAP.md). */
const SOON_ITEMS: string[] = [];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function SoonTag() {
  return (
    <span className="rounded-full bg-[var(--panel-hover)] px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide text-faint uppercase">
      Soon
    </span>
  );
}

/** Plain link list — lives inside the hamburger menu popover (see nav-menu.tsx). */
export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={clsx(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--accent-soft)] text-accent"
                : "text-muted hover:bg-[var(--panel-hover)] hover:text-foreground",
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
    </nav>
  );
}
