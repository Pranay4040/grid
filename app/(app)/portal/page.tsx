import { headers } from "next/headers";
import { Panel } from "@/components/panel";
import { BookmarkletInstall } from "@/components/bookmarklet-install";
import { getPortal } from "@/lib/portal/data";
import { buildBookmarklet, PORTAL_ORIGIN } from "@/lib/portal/bookmarklet";
import { formatSyncTime } from "@/lib/portal/format";
import { disconnectPortalAction } from "@/app/portal/actions";

const IMPORT_MESSAGES: Record<string, string> = {
  expired:
    "The portal tab wasn't signed in, so there was nothing to send. Sign in to the Student Portal, then tap Send to Grid again.",
  error: "Grid couldn't read what the portal sent. Try again from the portal's home page after signing in.",
  rejected: "That didn't come from the SRM Student Portal, so Grid ignored it. Run Send to Grid from sp.srmist.edu.in.",
  misconfigured: "This deployment is missing SESSION_SECRET, so Grid can't store your data safely.",
};

const step = "grid gap-1.5 pl-5 text-sm text-muted list-decimal";

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ import?: string }>;
}) {
  const [portal, h, params] = await Promise.all([getPortal(), headers(), searchParams]);
  // The bookmarklet posts back to whichever deployment it was copied from.
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const code = buildBookmarklet(`${proto}://${host}`);
  const importMessage = params.import ? IMPORT_MESSAGES[params.import] : undefined;

  return (
    <Panel className="mx-auto w-full max-w-2xl p-6 sm:p-8">
      <h1 className="text-lg font-medium">SRM Student Portal</h1>
      <p className="mt-1 text-sm text-muted">
        {portal.state === "ok"
          ? `Last sent ${formatSyncTime(portal.takenAt)} — ${portal.attendance.rows.length} courses of attendance, marks uploaded for ${portal.marks.length}.`
          : "Attendance and marks now live on the Student Portal. Sign in there as usual, tap Send to Grid, and Grid takes it from there."}
      </p>

      {importMessage ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {importMessage}
        </p>
      ) : null}

      <h2 className="mt-7 text-sm font-medium">Every time you want fresh data</h2>
      <ol className={`mt-2 ${step}`}>
        <li>
          Sign in to{" "}
          <a
            href={`${PORTAL_ORIGIN}/srmiststudentportal/`}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-dotted underline-offset-2 hover:no-underline"
          >
            the SRM Student Portal
          </a>
          .
        </li>
        <li>
          Run your <b>Send to Grid</b>{" "}bookmark on that page. You&apos;ll land back in Grid
          on Attendance with everything updated.
        </li>
      </ol>

      <h2 className="mt-7 text-sm font-medium">One-time setup</h2>
      <div className="mt-3">
        <BookmarkletInstall code={code} />
      </div>
      <p className="mt-3 text-sm text-muted">
        <b>Computer:</b> drag <b>Send to Grid</b> onto your bookmarks bar.
      </p>
      <div className="mt-3 text-sm text-muted">
        <b>Phone (Chrome):</b>
        <ol className={`mt-1.5 ${step}`}>
          <li>Tap <b>Copy bookmark code</b>.</li>
          <li>Bookmark this page (⋮ → ☆), then edit that bookmark.</li>
          <li>Name it <b>Send to Grid</b> and replace its URL with the copied code. Save.</li>
          <li>
            On the signed-in portal, type <b>Send to Grid</b> in the address bar and tap the
            bookmark in the suggestions.
          </li>
        </ol>
      </div>

      <p className="mt-7 text-xs text-faint">
        The bookmark runs inside your own signed-in portal tab and sends only your attendance and
        marks pages to Grid. Grid never sees your password or your portal session. The data is
        stored encrypted in a cookie in your own browser; this server keeps no copy.
      </p>

      {portal.state === "ok" ? (
        <form action={disconnectPortalAction} className="mt-4">
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--panel-hover)] hover:text-foreground"
          >
            Remove portal data
          </button>
        </form>
      ) : null}
    </Panel>
  );
}
