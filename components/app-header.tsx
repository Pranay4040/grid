import { GlassPanel } from "@/components/glass";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { logoutAction } from "@/app/logout/actions";
import type { DashboardResult } from "@/lib/academia/dashboard";

export function AppHeader({ result }: { result: DashboardResult }) {
  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div className="min-w-0">
        <p className="text-lg font-semibold tracking-tight">
          Portal<span className="text-accent">Free</span>
        </p>
        {result.ok ? (
          <p className="mt-0.5 truncate text-sm text-muted">
            {result.data.student.name} · {result.data.student.program}{" "}
            {result.data.student.department} · Semester{" "}
            {result.data.student.semester}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-muted">SRM academic companion</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {result.ok ? (
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-[var(--glass-hover)] hover:text-danger"
            >
              Logout
            </button>
          </form>
        ) : null}
        <ThemeSwitcher />
      </div>
    </GlassPanel>
  );
}
