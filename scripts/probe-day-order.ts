/**
 * LOCAL, USER-RUN discovery: does SRM Academia expose the current SRM
 * day-order (1-5) anywhere, e.g. an academic-calendar/planner page? If so,
 * `lib/timetable/day-order.ts` (a manual-anchor heuristic) can be replaced
 * with the real source.
 *
 * Two existing probes (`discover-data.ts`, `inspect-pages.ts`) already scan
 * for the literal string "day order" against the pages they check and found
 * nothing. This widens the search: harvest every page-name-shaped identifier
 * out of the ~500KB site root, then probe a candidate list of calendar/
 * planner page names none of the prior scripts tried.
 *
 * PRIVACY: never logs a raw HTML slice. Only prints/writes: HTTP status and
 * byte counts, boolean keyword hits, bare identifiers (already just page
 * names, not data), verbatim header-row cell text, and mask()ed data rows
 * (digits→#, letters→x). A final scrub pass strips anything that looks like
 * a registration number or a 10-digit mobile number before writing the file.
 *
 * Usage: npx tsx scripts/probe-day-order.ts
 */
import { writeFileSync } from "node:fs";
import { authedFetch } from "../lib/academia/client";
import { loadSession } from "../lib/academia/session-store";
import { extractView } from "../lib/academia/parse";

const ORIGIN = "https://academia.srmist.edu.in";
const PAGE_BASE = "/srm_university/academia-academic-services/page";

const REPORT_PATH = "scripts/day-order-report.txt";
const buffer: string[] = [];
const log = (...args: unknown[]) => {
  const line = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
  buffer.push(line);
  console.log(line);
};

const mask = (s: string) => s.replace(/[0-9]/g, "#").replace(/[A-Za-z]/g, "x");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 1a. harvest ------------------------------ */

function harvestIdentifiers(html: string): { paths: Set<string>; keys: Set<string> } {
  const paths = new Set<string>();
  for (const m of html.matchAll(
    /academia-academic-services\/(?:page|report|form|view)\/([A-Za-z0-9_]+)/gi,
  )) {
    paths.add(m[1]);
  }
  const keys = new Set<string>();
  for (const m of html.matchAll(
    /["'](?:link_name|linkName|pageLinkName|viewLinkName|componentLinkName|zc_pageName)["']\s*[:=]\s*["']([A-Za-z0-9_]+)["']/gi,
  )) {
    keys.add(m[1]);
  }
  for (const m of html.matchAll(/\bMy_[A-Za-z0-9_]{2,40}\b/g)) keys.add(m[0]);
  for (const m of html.matchAll(
    /\b[A-Za-z0-9_]*(?:Planner|Calendar|Day_?Order|Almanac|Schedule)[A-Za-z0-9_]*\b/gi,
  )) {
    keys.add(m[0]);
  }
  return { paths, keys };
}

const KEYWORDS = ["calendar", "planner", "day order", "dayorder", "almanac", "holiday"];

function keywordHits(html: string): string[] {
  return KEYWORDS.filter((k) => new RegExp(k, "i").test(html));
}

/* --------------------------- 1b. candidate list --------------------------- */

const CANDIDATES = [
  "Academic_Planner",
  "Academic_Planner_2023_24",
  "Academic_Planner_2023_24_ODD",
  "Academic_Planner_2024_25",
  "Academic_Planner_2025_26",
  "Academic_Planner_2025_26_ODD",
  "Academic_Planner_2026_27",
  "Academic_Planner_2026_27_ODD",
  "Academic_Planner_ODD",
  "My_Academic_Planner",
  "My_Planner",
  "My_Calendar",
  "My_Day_Order",
  "My_Time_Table_Calendar",
  "Academic_Calendar",
  "Academic_Calendar_2023_24",
  "Academic_Calendar_2026_27",
  "Calendar",
  "Planner",
  "Day_Order",
  "Day_Order_Calendar",
  "Class_Calendar",
  "Course_Calendar",
  "Student_Calendar",
  "Almanac",
  "My_Almanac",
  "My_Attendance_Calendar",
];

/* --------------------------- 1c/1d. classify + signal --------------------------- */

const DATE_CELL_RE =
  /\b(0?[1-9]|[12]\d|3[01])[-\/ ](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\/ ]?(\d{2,4})?\b/i;
const DAY_ORDER_RE = /day\s*[-_ ]?\s*order/i;
const DO_ABBR_RE = /\bDO\b\s*[:.\-]?\s*[1-5]\b/;

/**
 * A row is only safe to print verbatim as a "header" if it looks like column
 * labels — no long digit runs, no cell long enough to be a value. Small
 * 2-column tables in this markup are often label/value pairs (e.g.
 * "Registration Number: | RA<13 digits>"), which is DATA, not a header,
 * and must go through mask() like everything else.
 */
function isSafeHeaderRow(cells: string[]): boolean {
  return cells.every((c) => !/\d{3,}/.test(c) && c.length < 40);
}

function tableSummaries(inner: string): string[] {
  const tables = [...inner.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  return tables.slice(0, 6).map((t, i) => {
    const rows = t
      .split(/<\/tr>/i)
      .map((chunk) =>
        [...chunk.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
          m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        ),
      )
      .filter((cells) => cells.length > 0);
    const first = rows[0] ?? [];
    const headerIsSafe = isSafeHeaderRow(first);
    const header = headerIsSafe ? first : first.map(mask);
    const dataStart = 1;
    const dataRows = rows.slice(dataStart, dataStart + 2).map((r) => r.map(mask));
    return (
      `    table[${i}] rows=${rows.length}\n` +
      `      header${headerIsSafe ? "" : " (masked — looked like data)"}: ${header.join(" | ") || "(none)"}\n` +
      dataRows.map((r, j) => `      data[${j}]: ${r.join(" | ")}`).join("\n")
    );
  });
}

async function probeCandidate(
  fetchAs: ReturnType<typeof authedFetch>,
  name: string,
): Promise<"missing" | "forbidden" | "shell" | "hit"> {
  const res = await fetchAs(`${PAGE_BASE}/${name}`);
  const body = await res.text();

  if (res.status === 404) {
    log(`  ${name}: 404`);
    return "missing";
  }
  if (res.status === 403) {
    log(`  ${name}: 403 — EXISTS BUT FORBIDDEN (worth a manual look)`);
    return "forbidden";
  }
  if (res.status !== 200) {
    log(`  ${name}: ${res.status} bytes=${body.length}`);
    return "missing";
  }

  const inner = extractView(body, name);
  if (!inner) {
    log(`  ${name}: 200, no view container (shell), bytes=${body.length}`);
    return "shell";
  }

  const dayOrderHit = DAY_ORDER_RE.test(inner);
  const doAbbrHit = DO_ABBR_RE.test(inner);
  const dateHit = DATE_CELL_RE.test(inner);
  log(
    `  ${name}: 200, VIEW FOUND, bytes(inner)=${inner.length}, ` +
      `day-order-label=${dayOrderHit}, DO-abbr=${doAbbrHit}, date-cells=${dateHit}`,
  );
  if (dayOrderHit || doAbbrHit || dateHit) {
    log(`  --- ${name} table structure ---`);
    for (const line of tableSummaries(inner)) log(line);
  }
  return dayOrderHit || doAbbrHit ? "hit" : "shell";
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const session = loadSession();
  if (!session) {
    console.error("No live session — run scripts/save-session.ts first.");
    process.exit(1);
  }
  const fetchAs = authedFetch(session);

  log(`Probing ${ORIGIN} for a scraped day-order source`);
  log("=".repeat(60));

  // 1a. harvest from site root
  const rootRes = await fetchAs("/");
  const rootHtml = await rootRes.text();
  log(`\nsite root: status=${rootRes.status} bytes=${rootHtml.length}`);
  const hits = keywordHits(rootHtml);
  log(`keyword hits on root: ${hits.join(", ") || "(none)"}`);

  const { paths, keys } = harvestIdentifiers(rootHtml);
  const harvested = [...new Set([...paths, ...keys])].sort();
  log(`\nharvested ${harvested.length} identifier(s) from root:`);
  for (const id of harvested) log(`  ${id}`);

  // 1b. probe candidates (harvested ∪ hardcoded), deduped
  const toProbe = [...new Set([...harvested, ...CANDIDATES])].sort();
  log(`\n${"=".repeat(60)}\nProbing ${toProbe.length} candidate page name(s):`);

  const results: Record<string, string> = {};
  for (const name of toProbe) {
    try {
      results[name] = await probeCandidate(fetchAs, name);
    } catch (err) {
      log(`  ${name}: ERROR ${(err as Error).message}`);
      results[name] = "error";
    }
    await sleep(300);
  }

  const forbidden = Object.entries(results).filter(([, v]) => v === "forbidden").map(([k]) => k);
  const hitNames = Object.entries(results).filter(([, v]) => v === "hit").map(([k]) => k);

  log(`\n${"=".repeat(60)}\nSUMMARY`);
  log(`candidates probed: ${toProbe.length}`);
  log(`403 (exists, forbidden): ${forbidden.join(", ") || "(none)"}`);
  log(`positive hits (day-order signal found): ${hitNames.join(", ") || "(none)"}`);
  log(
    hitNames.length
      ? "\nCONCLUSION: a scraped day-order source appears to exist — see table structure above."
      : "\nCONCLUSION: no day-order source found on the portal. Manual anchor remains the source of record.",
  );

  flush();
  console.log(`\nMasked report written to ${REPORT_PATH}`);
}

function flush() {
  const text = buffer
    .join("\n")
    .replace(/\bRA\d{9,}\b/g, "RA<masked>")
    .replace(/\b[6-9]\d{9}\b/g, "<masked>");
  try {
    writeFileSync(REPORT_PATH, text + "\n", "utf8");
  } catch (err) {
    console.error("could not write report file:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error("probe-day-order crashed:", err);
  process.exit(1);
});
