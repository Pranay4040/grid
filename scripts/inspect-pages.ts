/**
 * Structure-only forensics on the authenticated pages. Tries the correct
 * (year-suffixed) Zoho page names and reports table structure with PERSONAL
 * VALUES MASKED (headers/labels shown; course names, marks, rooms, faculty
 * masked). Writes scripts/inspect-report.txt (gitignored).
 */
import { writeFileSync } from "node:fs";
import { authedFetch } from "../lib/academia/client";
import { loadSession } from "../lib/academia/session-store";

const BASE = "/srm_university/academia-academic-services/page";

/** Attendance/marks/course live on the unsuffixed page; timetable is year-suffixed. */
const CANDIDATES = [
  "My_Attendance",
  "My_Time_Table_2026_27",
  "My_Time_Table_2025_26",
  "My_Time_Table_2024_25",
  "My_Time_Table_2023_24",
  "My_Time_Table",
];

const out: string[] = [];
const log = (...a: unknown[]) => {
  const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
  out.push(line);
  console.log(line);
};

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** digits→#, letters→x — masks personal values, preserves shape. */
const mask = (s: string) => s.replace(/[0-9]/g, "#").replace(/[A-Za-z]/g, "x");

/**
 * A row is only safe to print verbatim as a "header" if it looks like column
 * labels — no long digit runs, no cell long enough to be a value. Small
 * tables in this markup (or a single-row table whose lone cell holds an
 * embedded page-data blob) are often label/value DATA, not a header, and
 * must go through mask() like everything else.
 */
function isSafeHeaderRow(cells: string[]): boolean {
  return cells.every((c) => !/\d{3,}/.test(c) && c.length < 40);
}

/** Report each table's real headers + a couple of masked sample rows. */
function tables(html: string, label: string) {
  const ts = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  log(`\n## ${label}: ${ts.length} table(s)`);
  ts.forEach((t, i) => {
    const id = t[1].match(/id=["']([^"']+)["']/i)?.[1] ?? "(no id)";
    const rows = [...t[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rows.length === 0) return;
    const cellsOf = (tr: string) =>
      [...tr.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => stripTags(c[1]));
    // Widest row = header; show first two data rows masked.
    const widths = rows.map((r) => cellsOf(r[1]).length);
    const headerIdx = widths.indexOf(Math.max(...widths));
    const headerCells = cellsOf(rows[headerIdx][1]);
    const headerIsSafe = isSafeHeaderRow(headerCells);
    const header = headerIsSafe ? headerCells : headerCells.map(mask);
    log(`  table[${i}] id=${id} rows=${rows.length} maxCols=${Math.max(...widths)}`);
    log(`    header${headerIsSafe ? "" : " (masked — looked like data)"}: ${header.slice(0, 16).join(" | ")}`);
    let shown = 0;
    for (let r = headerIdx + 1; r < rows.length && shown < 2; r++) {
      const cells = cellsOf(rows[r][1]);
      if (cells.length < 2) continue;
      log(`    row[${r}]: ${cells.slice(0, 16).map(mask).join(" | ")}`);
      shown++;
    }
  });
}

async function main() {
  const session = loadSession();
  if (!session) {
    console.error("No saved session.");
    process.exit(1);
  }
  const fetchAs = authedFetch(session);

  for (const name of CANDIDATES) {
    try {
      const res = await fetchAs(`${BASE}/${name}`);
      const html = await res.text();
      const kw = ["attendance", "time table", "timetable", "mark", "course", "credit", "day order", "faculty", "hour", "slot"]
        .filter((k) => new RegExp(k, "i").test(html));
      log(`\n${"=".repeat(60)}\n▶ ${name}  status=${res.status} bytes=${html.length}  kw:[${kw.join(", ")}]`);
      if (res.status === 200 && /<table/i.test(html)) tables(html, name);
    } catch (e) {
      log(`\n▶ ${name}  ERROR ${(e as Error).message}`);
    }
  }

  const text = out
    .join("\n")
    .replace(/\bRA\d{9,}\b/g, "RA<masked>")
    .replace(/\b[6-9]\d{9}\b/g, "<masked>");
  writeFileSync("scripts/inspect-report.txt", text + "\n", "utf8");
  console.log("\nWritten scripts/inspect-report.txt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
