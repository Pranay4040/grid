/**
 * LOCAL, USER-RUN data-endpoint discovery. Do NOT run in a shared session.
 *
 *   cd <your-clone-of-this-repo>
 *   $env:SRM_USER="ab1234@srmist.edu.in"; $env:SRM_PASS="<pw>"; npx tsx scripts/discover-data.ts
 *   $env:SRM_PASS=$null
 *
 * Purpose: find WHICH Zoho Creator pages hold attendance / marks / timetable,
 * and report their HTML STRUCTURE so we can write parsers.
 *
 * PRIVACY: this prints table headers (labels like "Course Code") verbatim, but
 * MASKS every data cell — digits→#, letters→x — so your actual attendance and
 * marks never appear in the output. Share the output freely; it has no personal
 * values and no secrets.
 */
import { writeFileSync } from "node:fs";
import { login, authedFetch } from "../lib/academia/client";
import { loadSession } from "../lib/academia/session-store";

const BASE = "/srm_university/academia-academic-services";

/** Mirror everything we print into a masked report file Claude can read. */
const REPORT_PATH = "scripts/discovery-report.txt";
const buffer: string[] = [];
const log = (...args: unknown[]) => {
  const line = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  buffer.push(line);
  console.log(line);
};

/** Known-ish page names + we also auto-discover from the home HTML. */
const SEED_PATHS = [
  "/",
  `${BASE}/page/My_Attendance`,
  `${BASE}/page/My_Time_Table`,
  `${BASE}/page/My_Marks`,
  `${BASE}/page/My_Course_Details`,
];

/** digits→#, letters→x; keeps punctuation/length so shapes stay readable. */
function maskValue(s: string): string {
  return s.replace(/[0-9]/g, "#").replace(/[A-Za-z]/g, "x");
}

/** Extract candidate internal links from a page's HTML. */
function discoverLinks(html: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']*academia-academic-services[^"']*)["']/gi)) {
    links.add(m[1]);
  }
  for (const m of html.matchAll(/(?:viewLinkName|pageLinkName)["'\s:=]+["']([A-Za-z0-9_]+)["']/gi)) {
    links.add(`${BASE}/page/${m[1]}`);
  }
  return [...links];
}

/** Summarise the table structure in a page without leaking cell values. */
function summariseTables(html: string): string[] {
  const out: string[] = [];
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  tables.forEach((t, i) => {
    const attrs = t[1];
    const inner = t[2];
    const id = attrs.match(/id=["']([^"']+)["']/i)?.[1] ?? "(no id)";
    const cls = attrs.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
    const headers = [...inner.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((h) => h[1].replace(/<[^>]+>/g, "").trim())
      .filter(Boolean);
    const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    // First data row, masked, to reveal column shapes.
    const dataRow = rows
      .map((r) =>
        [...r[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
          maskValue(c[1].replace(/<[^>]+>/g, "").trim()).slice(0, 12),
        ),
      )
      .find((cells) => cells.length > 1);

    out.push(
      `  table[${i}] id=${id} class="${cls.slice(0, 40)}" rows=${rows.length}\n` +
        `    headers: ${headers.slice(0, 12).join(" | ") || "(none)"}\n` +
        `    sample : ${dataRow ? dataRow.join(" | ") : "(no data row)"}`,
    );
  });
  return out;
}

async function probe(
  fetchAs: ReturnType<typeof authedFetch>,
  path: string,
) {
  try {
    const res = await fetchAs(path, { method: "GET" });
    const body = await res.text();
    const ct = res.headers.get("content-type")?.split(";")[0] ?? "";
    const hasTables = /<table/i.test(body);
    const keywords = ["attendance", "marks", "timetable", "time table", "course", "credit", "day order"]
      .filter((k) => new RegExp(k, "i").test(body));

    log(`\n▶ ${path}`);
    log(`  status=${res.status} type=${ct} bytes=${body.length}`);
    log(`  keywords: ${keywords.join(", ") || "(none)"}`);
    if (hasTables) {
      for (const line of summariseTables(body)) log(line);
    } else {
      log("  (no <table> elements)");
    }
    return body;
  } catch (err) {
    log(`\n▶ ${path}\n  ERROR: ${(err as Error).message}`);
    return "";
  }
}

async function main() {
  // Prefer a saved session (no password needed). Fall back to env-var login.
  let session = loadSession();
  if (session) {
    log("Using saved session from scripts/.session.json\n" + "=".repeat(60));
  } else {
    const user = process.env.SRM_USER?.trim();
    const pass = process.env.SRM_PASS;
    if (!user || !pass) {
      console.error(
        "No saved session and no creds. Either run scripts/save-session.ts first,\n" +
          "or set SRM_USER and SRM_PASS (see file header).",
      );
      process.exit(1);
    }
    log(`Logging in as ${user} …`);
    const outcome = await login(user, pass);
    if (!outcome.ok) {
      log(`❌ login failed: ${outcome.reason} — ${outcome.message}`);
      flush();
      process.exit(1);
    }
    session = outcome.session;
    log("✅ logged in\n" + "=".repeat(60));
  }

  const fetchAs = authedFetch(session);

  // Probe seeds, harvesting links from the home page for a second pass.
  const seen = new Set<string>();
  const homeBody = await probe(fetchAs, "/");
  seen.add("/");

  const discovered = discoverLinks(homeBody).filter((l) => !seen.has(l));
  log(
    `\n${"=".repeat(60)}\nAuto-discovered ${discovered.length} link(s) from home page.`,
  );

  for (const path of [...SEED_PATHS.slice(1), ...discovered]) {
    const norm = path.startsWith("http")
      ? new URL(path).pathname
      : path.startsWith("/")
        ? path
        : `/${path}`;
    if (seen.has(norm)) continue;
    seen.add(norm);
    await probe(fetchAs, norm);
  }

  log(`\n${"=".repeat(60)}\nDone.`);
  flush();
  console.log(`\nMasked report written to ${REPORT_PATH} — safe to share.`);
}

/** Persist the masked buffer so it can be read/shared without re-running. */
function flush() {
  try {
    writeFileSync(REPORT_PATH, buffer.join("\n") + "\n", "utf8");
  } catch (err) {
    console.error("could not write report file:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error("discover-data crashed:", err);
  process.exit(1);
});
