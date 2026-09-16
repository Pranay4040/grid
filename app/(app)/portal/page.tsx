import { Panel } from "@/components/panel";
import { PortalConnectForm } from "@/components/portal-connect-form";
import { getPortal } from "@/lib/portal/data";
import { disconnectPortalAction } from "@/app/portal/actions";

export default async function PortalPage() {
  const portal = await getPortal();

  return (
    <Panel className="mx-auto w-full max-w-2xl p-6 sm:p-8">
      <h1 className="text-lg font-medium">SRM Student Portal</h1>

      {portal.state === "ok" ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Connected — {portal.attendance.rows.length} courses of attendance
            {portal.attendance.period
              ? ` (${portal.attendance.period.from} → ${portal.attendance.period.to})`
              : ""}
            , marks uploaded for {portal.marks.length}.
          </p>
          <form action={disconnectPortalAction} className="mt-5">
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--panel-hover)] hover:text-foreground"
            >
              Disconnect
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            {portal.state === "expired"
              ? "Your Student Portal session expired. Reconnect to load attendance and marks again."
              : portal.state === "error"
                ? portal.message
                : "Attendance and marks moved to the Student Portal. Its sign-in has a captcha, so you sign in there yourself and hand Grid the session."}
          </p>
          <div className="mt-6">
            <PortalConnectForm />
          </div>
        </>
      )}
    </Panel>
  );
}
