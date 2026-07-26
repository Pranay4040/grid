import { redirect } from "next/navigation";
import { GlassPanel } from "@/components/glass";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LoginForm } from "@/components/login-form";
import { loadSession } from "@/lib/academia/session-store";

export default function LoginPage() {
  // Already connected — nothing to do here.
  if (loadSession()) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4 sm:p-6">
      <GlassPanel className="flex items-center justify-between gap-4 p-5 sm:p-6">
        <p className="text-lg font-semibold tracking-tight">
          Portal<span className="text-accent">Free</span>
        </p>
        <ThemeSwitcher />
      </GlassPanel>

      <GlassPanel className="p-6 sm:p-8">
        <h1 className="text-lg font-medium">Connect your SRM Academia account</h1>
        <p className="mt-1 text-sm text-muted">
          Sign in to load your timetable, attendance, and marks.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </GlassPanel>
    </div>
  );
}
