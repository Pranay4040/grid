import { AppHeader } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { getDashboard } from "@/lib/academia/dashboard";

/**
 * Shared shell for every page that should show the app's nav (Overview,
 * Attendance, and future tabs). /login stays outside this route group
 * deliberately — a pre-auth screen shouldn't show internal navigation.
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppHeader result={result} />
      <AppNav variant="tabs" />
      <div className="flex flex-1 gap-6">
        <AppNav variant="sidebar" />
        <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
