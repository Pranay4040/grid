import Link from "next/link";
import { Panel } from "@/components/panel";
import type { PortalResult } from "@/lib/portal/load";

/**
 * Shown where attendance-derived data used to be, when neither Academia nor a
 * connected Student Portal session can supply it.
 *
 * SRM moved attendance and internal marks off Academia to the SRM Student
 * Portal. That's NOT an expired Academia session and NOT "no marks yet", and
 * an empty table here would have implied both — so say what's actually wrong
 * and point at the one thing that fixes it: connecting the portal.
 */
export function AttendanceUnavailable({
  what,
  portal,
}: {
  /** What's missing, in the page's own words: "Attendance", "Marks", … */
  what: string;
  portal: PortalResult;
}) {
  const heading =
    portal.state === "expired" ? "Student Portal session expired" : `Connect the Student Portal for ${what.toLowerCase()}`;
  const body =
    portal.state === "expired"
      ? `The portal no longer accepts the session Grid has. Reconnect to load your ${what.toLowerCase()} again.`
      : portal.state === "error"
        ? portal.message
        : `SRM moved ${what.toLowerCase()} from Academia to the SRM Student Portal. Connect it once and Grid will read it from there.`;

  return (
    <Panel className="p-8 text-center sm:p-12">
      <h2 className="text-lg font-medium">{heading}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      <Link
        href="/portal"
        className="mt-5 inline-block rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-accent transition-[filter] hover:brightness-110"
      >
        {portal.state === "not_connected" ? "Connect Student Portal" : "Reconnect Student Portal"}
      </Link>
    </Panel>
  );
}
