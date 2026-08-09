import { redirect } from "next/navigation";
import { Panel } from "@/components/panel";
import { LoginForm } from "@/components/login-form";
import { getDashboard } from "@/lib/academia/dashboard";

export default async function LoginPage() {
  // Only skip the form if the session actually still works against Academia
  // (getDashboard does a live fetch) — not merely because a session cookie is
  // present and decrypts. A cookie that's still structurally valid but was
  // already rejected server-side (the "Session expired" case) must STILL show
  // the form, or this page bounces straight back to whatever sent the user
  // here. That exact loop made the login form unreachable once already.
  //
  // Cheap for signed-out visitors: with no cookie there's no network call.
  const result = await getDashboard();
  if (result.ok) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4 sm:p-6">
      <Panel className="p-5 sm:p-6">
        <p className="text-lg font-semibold tracking-tight text-accent">Grid</p>
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
