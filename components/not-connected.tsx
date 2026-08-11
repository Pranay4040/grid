import Link from "next/link";
import { Panel } from "@/components/panel";

export function NotConnected({
  reason,
  message,
}: {
  reason: string;
  message: string;
}) {
  const heading =
    reason === "no_session"
      ? "Not connected"
      : reason === "session_expired"
        ? "Session expired"
        : reason === "misconfigured"
          ? "Server not configured"
          : reason === "page_unavailable"
            ? "Academia changed"
            : "Couldn’t load data";
  const body =
    reason === "no_session"
      ? "Sign in with your SRM Academia account to see your timetable, attendance, and marks."
      : reason === "session_expired"
        ? "Your Academia session ran out. Sign in again to keep going."
        : message;
  // Deliberately no sign-in button when misconfigured or when the portal
  // itself changed — logging in cannot fix either one, so offering it would
  // just send people round the loop this state exists to break.
  const showConnect = reason === "no_session" || reason === "session_expired";
  return (
    <Panel className="p-8 text-center sm:p-12">
      <h2 className="text-lg font-medium">{heading}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {showConnect ? (
        <Link
          href="/login"
          className="mt-5 inline-block rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-accent transition-[filter] hover:brightness-110"
        >
          Connect your account
        </Link>
      ) : null}
    </Panel>
  );
}
