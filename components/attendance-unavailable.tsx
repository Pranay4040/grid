import Link from "next/link";
import { Panel } from "@/components/panel";

/**
 * Shown where attendance-derived data used to be, when neither Academia nor a
 * Student Portal snapshot can supply it.
 *
 * SRM moved attendance and internal marks off Academia to the SRM Student
 * Portal. That's NOT an expired Academia session and NOT "no marks yet", and
 * an empty table here would have implied both — so say what's actually wrong
 * and point at the one thing that fixes it.
 */
export function AttendanceUnavailable({ what }: { what: string }) {
  return (
    <Panel className="p-8 text-center sm:p-12">
      <h2 className="text-lg font-medium">Connect the Student Portal for {what.toLowerCase()}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        SRM moved {what.toLowerCase()} from Academia to the SRM Student Portal. Set up
        &ldquo;Send to Grid&rdquo; once, then tap it on the portal whenever you want fresh data.
      </p>
      <Link
        href="/portal"
        className="mt-5 inline-block rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-accent transition-[filter] hover:brightness-110"
      >
        Set up Send to Grid
      </Link>
    </Panel>
  );
}
