/**
 * THE ONE COMMAND YOU RUN. Logs in once and saves ONLY the session cookie
 * bundle (never your password) so Claude can drive discovery/parsing without
 * ever handling your credentials.
 *
 *   cd C:\Users\prana\Desktop\timetable_test1
 *   $env:SRM_USER="pp7136@srmist.edu.in"; $env:SRM_PASS="<pw>"; npx tsx scripts/save-session.ts
 *   $env:SRM_PASS=$null
 *
 * Writes scripts/.session.json (gitignored). Each successful dashboard load
 * pushes the session's soft deadline forward another ~6h, so as long as the
 * app gets opened periodically you shouldn't need to run this again — capped
 * at a 30-day hard backstop regardless of activity. Delete it when done:
 * npx tsx scripts/clear-session.ts
 */
import { login } from "../lib/academia/client";
import { saveSession, SESSION_FILE } from "../lib/academia/session-store";

async function main() {
  const user = process.env.SRM_USER?.trim();
  const pass = process.env.SRM_PASS;
  if (!user || !pass) {
    console.error(
      'Set creds first: $env:SRM_USER="pp7136@srmist.edu.in"; $env:SRM_PASS="<pw>"',
    );
    process.exit(1);
  }

  console.log(`Logging in as ${user} …`);
  const outcome = await login(user, pass);
  if (!outcome.ok) {
    console.log(`❌ login failed: ${outcome.reason} — ${outcome.message}`);
    process.exit(1);
  }

  saveSession(outcome.session);
  console.log(`✅ session saved to ${SESSION_FILE}`);
  console.log(
    `   cookies: ${Object.keys(outcome.session.cookies).length} · expires ${new Date(
      outcome.session.expiresAt,
    ).toLocaleTimeString()}`,
  );
  console.log(
    "\nDone — tell Claude it's saved. Your password was never written anywhere.\n" +
      "Clear $env:SRM_PASS now, and delete the session file when finished.",
  );
}

main().catch((err) => {
  console.error("save-session crashed:", err);
  process.exit(1);
});
