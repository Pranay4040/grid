import { AppHeader } from "@/components/app-header";
import { getDashboard } from "@/lib/academia/dashboard";

/**
 * Shared shell for every page that should show the app's nav (Overview,
 * Attendance, Marks, GPA, and future tabs). /login stays outside this route
 * group deliberately — a pre-auth screen shouldn't show internal navigation.
 *
 * Navigation + appearance + logout live in one hamburger menu (see
 * components/nav-menu.tsx) rather than a persistent sidebar/tab-row — a
 * single compact control at every viewport size instead of three separate
 * UI regions competing for space.
 *
 * Fetches the dashboard once here; getDashboard() is cache()-wrapped so a
 * page that also calls it for its own data doesn't trigger a second live
 * Academia fetch for the same request.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getDashboard();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <AppHeader result={result} />
      <main className="flex min-w-0 flex-1 flex-col gap-5">{children}</main>
    </div>
  );
}
