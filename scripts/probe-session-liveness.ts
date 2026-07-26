/**
 * Empirical check: is the saved session still accepted by the real portal
 * right now, independent of our own expiresAt/issuedAt bookkeeping?
 *
 * Reads scripts/.session.json directly (bypassing loadSession()'s own
 * expiry checks, since the whole point is to test Zoho's real timeout rather
 * than trust our guess) and makes one real authenticated request. Reports
 * only booleans/counts — no personal data.
 *
 * Usage: npx tsx scripts/probe-session-liveness.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { authedFetch } from "../lib/academia/client";
import { parseTimetable } from "../lib/academia/parse";
import { TIMETABLE_VIEW } from "../lib/academia/data";
import type { AcademiaSession } from "../lib/academia/types";

const SESSION_FILE = "scripts/.session.json";

async function main() {
  if (!existsSync(SESSION_FILE)) {
    console.log("No session file — nothing to probe.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
  if (!raw?.cookies) {
    console.log("Session file has no cookies — nothing to probe.");
    process.exit(1);
  }

  // Synthesize whatever issuedAt/expiresAt we can so this works against both
  // old- and new-format files; authedFetch only reads .cookies anyway.
  const session: AcademiaSession = {
    cookies: raw.cookies,
    expiresAt: raw.expiresAt ?? 0,
    issuedAt: raw.issuedAt ?? raw.expiresAt - 6 * 60 * 60 * 1000,
  };

  const ageMs = Date.now() - session.issuedAt;
  console.log(`Session age: ${(ageMs / 1000 / 60 / 60).toFixed(2)}h since original login`);
  console.log(`Cookie count: ${Object.keys(session.cookies).length}`);

  const fetchAs = authedFetch(session);
  const before = new Set(fetchAs.jar.names());
  const res = await fetchAs(
    `/srm_university/academia-academic-services/page/${TIMETABLE_VIEW}`,
  );
  const html = await res.text();
  const parsed = parseTimetable(html, TIMETABLE_VIEW);

  console.log(`HTTP status: ${res.status}`);
  console.log(`Response size: ${html.length} bytes`);
  console.log(
    parsed
      ? `RESULT: session still LIVE — parsed ${parsed.courses.length} courses.`
      : "RESULT: session appears EXPIRED (logged-out shell, no view container found).",
  );

  // Any cookie name not present before this call is a genuine reissue from
  // Zoho, independent of our own extendSession() logic.
  const after = fetchAs.jar.names();
  const changed = after.filter((n) => !before.has(n));
  console.log(
    changed.length
      ? `Cookies newly (re)issued by this request: ${changed.join(", ")}`
      : "No new cookies issued by this request.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
