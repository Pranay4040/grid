/** Dump the table tag skeleton (tags kept, text masked) to see row/cell layout. */
import { writeFileSync } from "node:fs";
import { authedFetch } from "../lib/academia/client";
import { loadSession } from "../lib/academia/session-store";
import { extractView } from "../lib/academia/parse";

const PAGE = "/srm_university/academia-academic-services/page";

/** Keep tags & attributes; mask visible text (letters→x, digits→#). */
function skeleton(html: string): string {
  return html
    .replace(/>([^<]+)</g, (_m, txt: string) => {
      const masked = txt.replace(/[0-9]/g, "#").replace(/[A-Za-z]/g, "x");
      return `>${masked}<`;
    })
    .replace(/\s+/g, " ");
}

async function main() {
  const session = loadSession();
  if (!session) {
    console.error("No saved session.");
    process.exit(1);
  }
  const fetchAs = authedFetch(session);
  const out: string[] = [];

  for (const [view, path] of [
    ["My_Attendance", `${PAGE}/My_Attendance`],
    ["My_Time_Table_2023_24", `${PAGE}/My_Time_Table_2023_24`],
  ] as const) {
    const html = await (await fetchAs(path)).text();
    const inner = extractView(html, view);
    out.push(`\n${"=".repeat(70)}\nVIEW: ${view}  innerLen=${inner?.length ?? 0}`);
    if (!inner) continue;
    // Find the largest table (the data one) and dump its skeleton.
    const tables = [...inner.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
    tables.sort((a, b) => b.length - a.length);
    const biggest = tables[0] ?? "";
    out.push(`tables: ${tables.length}, biggest ${biggest.length} chars`);
    out.push("SKELETON (first 2500 chars):");
    out.push(skeleton(biggest).slice(0, 2500));
  }

  const report = out.join("\n");
  writeFileSync("scripts/structure-report.txt", report + "\n", "utf8");
  console.log(report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
