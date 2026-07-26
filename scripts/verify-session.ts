/**
 * Regression check for isExpired(): it must NEVER refuse a session just
 * because the informational `expiresAt` stamp is in the past — only the
 * 30-day absolute backstop actually gates usage. This is exactly the bug
 * that caused a false "not connected" after ~24h of real inactivity even
 * though Academia still accepted the same cookies (see
 * scripts/probe-session-liveness.ts for the live confirmation).
 */
import { isExpired } from "../lib/academia/client";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}, actual: ${actual}`);
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();

check(
  "a stale expiresAt (well past) does NOT expire a fresh session",
  isExpired({ cookies: {}, expiresAt: now - HOUR, issuedAt: now - 25 * HOUR }),
  false,
);

check(
  "24h of inactivity alone does not expire the session",
  isExpired({ cookies: {}, expiresAt: now - 18 * HOUR, issuedAt: now - 24 * HOUR }),
  false,
);

check(
  "the 30-day hard backstop still applies",
  isExpired({ cookies: {}, expiresAt: now, issuedAt: now - 31 * DAY }),
  true,
);

check(
  "missing issuedAt (pre-migration file) is treated as expired",
  isExpired({ cookies: {}, expiresAt: now + HOUR } as never),
  true,
);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
