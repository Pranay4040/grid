/**
 * Capture one page from a portal Grid has no client for yet — the SRM Student
 * Portal — so a parser can be written against REAL markup instead of guesses.
 *
 * RUN THIS ON YOUR OWN MACHINE. Claude's sandbox cannot reach srmist.edu.in,
 * which is the entire reason this script exists.
 *
 *   1. Sign in to the Student Portal in your browser.
 *   2. DevTools (F12) -> Application -> Cookies -> copy the whole cookie
 *      string, or run `document.cookie` in the Console. (Console misses
 *      httpOnly cookies; if the capture comes back as a login page, use the
 *      Network tab instead: right-click the request -> Copy -> Copy as cURL,
 *      and take the -H 'cookie: ...' value from that.)
 *   3. PORTAL_URL="https://<the page>" PORTAL_COOKIE="<paste>" \
 *        npx tsx scripts/capture-portal.ts
 *
 * Writes TWO files, both gitignored:
 *   scripts/.capture-<slug>.html  the RAW body — your eyes only, it contains
 *                                 your name, register number and marks
 *   scripts/capture-report.txt    the MASKED structural report — this is the
 *                                 one that is safe to share
 *
 * Send the REPORT, not the raw file. Field names and table structure are all a
 * parser needs; your personal data is not. If a masked report turns out to be
 * missing something, mask-and-send that specific bit rather than the whole page.
 *
 * Your password is never involved — this replays an already-authenticated
 * session, the same principle as scripts/save-session.ts.
 */
import { writeFileSync } from "node:fs";
import { summarizeResponse } from "../lib/portal/inspect";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const REPORT_FILE = "scripts/capture-report.txt";

function slug(url: string): string {
  return (
    new URL(url).pathname.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "root"
  ).slice(0, 60);
}

async function main() {
  const url = process.env.PORTAL_URL?.trim();
  const cookie = process.env.PORTAL_COOKIE?.trim();

  if (!url) {
    console.error(
      'Set the page first, e.g.\n  PORTAL_URL="https://sp.srmist.edu.in/..." PORTAL_COOKIE="..." npx tsx scripts/capture-portal.ts',
    );
    process.exit(1);
  }
  if (!cookie) {
    console.error("PORTAL_COOKIE is required — without it you'll just capture the login page.");
    process.exit(1);
  }

  // `X-Requested-With` is set because Academia's data pages return an empty
  // shell without it (CLAUDE.md fact 2). Costs nothing if this portal doesn't
  // care, and saves a confusing empty capture if it does.
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/json,*/*",
      "accept-language": "en-US,en;q=0.9",
      "x-requested-with": "XMLHttpRequest",
      cookie,
    },
    redirect: "manual",
  });

  const body = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  // A manual-redirect response has no body worth parsing, but WHERE it points
  // is the most useful thing it can tell us.
  const location = res.headers.get("location");
  if (location) {
    console.log(`HTTP ${res.status} -> redirects to: ${location}`);
    console.log("Follow that URL with this same script; that's where the data lives.");
  }

  const rawFile = `scripts/.capture-${slug(url)}.html`;
  writeFileSync(rawFile, body, "utf8");

  const report = summarizeResponse({ url, status: res.status, contentType, body });
  writeFileSync(REPORT_FILE, report, "utf8");

  console.log(report);
  console.log(
    `\n─────\nRaw body (PRIVATE, not for sharing): ${rawFile}` +
      `\nMasked report (safe to share):       ${REPORT_FILE}`,
  );
}

main().catch((err) => {
  console.error("capture-portal failed:", err);
  process.exit(1);
});
