/**
 * LOCAL, USER-RUN end-to-end auth test. Do NOT run this in any shared session.
 *
 *   $env:SRM_USER="yournetid"; $env:SRM_PASS="yourpassword"; npx tsx scripts/test-auth.ts   (PowerShell)
 *   SRM_USER=yournetid SRM_PASS=yourpassword npx tsx scripts/test-auth.ts                   (bash)
 *
 * Your password is read from the environment, handed to login() once, and never
 * printed. On success this proves the session works by fetching your profile.
 * Cookie values and any long tokens are redacted from all output.
 */
import { login, authedFetch, isExpired } from "../lib/academia/client";

const redact = (s: string) =>
  s.replace(/\b[A-Za-z0-9_.-]{24,}\b/g, "<REDACTED>");

async function main() {
  const user = process.env.SRM_USER?.trim();
  const pass = process.env.SRM_PASS;

  if (!user || !pass) {
    console.error(
      "Set SRM_USER and SRM_PASS in the environment first.\n" +
        'PowerShell: $env:SRM_USER="netid"; $env:SRM_PASS="pw"; npx tsx scripts/test-auth.ts',
    );
    process.exit(1);
  }

  console.log(`\nAttempting login for ${user} …\n`);
  const outcome = await login(user, pass);

  if (!outcome.ok) {
    console.log("❌ Login failed");
    console.log("   reason :", outcome.reason);
    console.log("   message:", outcome.message);
    console.log(
      "\nIf 'reason' is 'unexpected', the password-step classifier needs a real",
      "\nresponse to learn from. Paste the reason + message (NOT your password)",
      "\nand we'll refine lib/academia/client.ts.",
    );
    process.exit(1);
  }

  const { session } = outcome;
  console.log("✅ Login succeeded");
  console.log("   cookies held :", Object.keys(session.cookies).join(", "));
  console.log("   expires at   :", new Date(session.expiresAt).toISOString());
  console.log("   expired?     :", isExpired(session));

  // Prove the session is actually usable by hitting an authenticated page.
  console.log("\nFetching profile to confirm the session replays …");
  const fetchAs = authedFetch(session);
  const res = await fetchAs("/");
  const body = await res.text();
  console.log("   status        :", res.status, res.headers.get("content-type"));
  console.log("   looks logged-in:", /logout|signout|welcome|dashboard/i.test(body));
  console.log("   body preview   :", redact(body.replace(/\s+/g, " ").slice(0, 200)));

  console.log(
    "\nDone. Share the status lines above (no secrets in them) so we can wire",
    "\nthe data-fetch layer against whatever the authenticated pages return.",
  );
}

main().catch((err) => {
  console.error("test-auth crashed:", err);
  process.exit(1);
});
