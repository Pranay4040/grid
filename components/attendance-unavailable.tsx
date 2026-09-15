import { Panel } from "@/components/panel";

/**
 * Shown where attendance-derived data used to be.
 *
 * SRM removed attendance from academia.srmist.edu.in and moved it to the SRM
 * Student Portal. Grid reads Academia only, so this data is gone until that
 * portal is wired up — it is NOT an expired session and NOT "no marks yet",
 * and rendering an empty table here would have implied both.
 *
 * Deliberately no link: the exact Student Portal URL hasn't been confirmed
 * from a live page, and sending people to a guessed hostname to type SRM
 * credentials into is not a guess worth making.
 */
export function AttendanceUnavailable({
  what,
  issue,
}: {
  /** What's missing, in the page's own words: "Attendance", "Marks", … */
  what: string;
  /** Diagnostic from the loader — view names/status/bytes, never page content. */
  issue: string | null;
}) {
  return (
    <Panel className="p-8 text-center sm:p-12">
      <h2 className="text-lg font-medium">{what} has moved</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        SRM no longer publishes {what.toLowerCase()} on Academia — it&apos;s on the
        SRM Student Portal now. Grid reads Academia, so it can&apos;t show this
        yet. Your timetable, courses and calendar still work.
      </p>
      <p className="mx-auto mt-3 max-w-md text-xs text-faint">
        Check it on the Student Portal directly for now.
      </p>
      {issue ? (
        <p className="mx-auto mt-4 max-w-md font-mono text-xs text-faint">{issue}</p>
      ) : null}
    </Panel>
  );
}
