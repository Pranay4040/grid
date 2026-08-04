import { redirect } from "next/navigation";
import { Panel } from "@/components/panel";
import { LoginForm } from "@/components/login-form";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function LoginPage() {
  // Only skip the form if the session actually still works against
  // Academia (getDashboard tries a live fetch) — not just because a
  // session file exists within our own local soft-expiry window. A file
  // that's locally "not expired yet" but was already rejected server-side
  // (the "Session expired" case on the dashboard) must still show the
  // form, or this page bounces straight back to the page that sent it here.
  const result = await getDashboard();
  if (result.ok) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4 sm:p-6">
      <Panel className="p-5 sm:p-6">
        <p className="text-lg font-semibold tracking-tight">
          Portal<span className="text-accent">Free</span>
        </p>
      </Panel>

      <Panel className="p-6 sm:p-8">
        <h1 className="text-lg font-medium">Connect your SRM Academia account</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in to load your timetable, attendance, and marks.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </Panel>
    </div>
  );
}
