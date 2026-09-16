/**
 * Turn a raw captured response from the SRM Student Portal into a MASKED
 * structural report that is safe to share.
 *
 * You already have the data in your browser. Save one response to a file, point
 * this at it, and it prints (and writes) a report with field names and table
 * structure intact but every personal VALUE — name, register number, marks —
 * replaced by # and x. Send that report; never the raw file.
 *
 *   # Windows (cmd), using the cURL DevTools already gave you — just add -o:
 *   curl --url "https://sp.srmist.edu.in/.../studentInternalMarkDetails.jsp" ^
 *     ... all the same -H and -b and --data-raw ... ^
 *     -o scripts\.capture-marks.html
 *   npx tsx scripts/inspect-capture.ts scripts/.capture-marks.html
 *
 * The raw file is gitignored and is yours alone. This script never sees your
 * session cookie — it only reads the response body you saved.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { summarizeResponse } from "../lib/portal/inspect";

const REPORT_FILE = "scripts/capture-report.txt";

function guessContentType(body: string): string {
  const head = body.trimStart().slice(0, 1);
  if (head === "{" || head === "[") return "application/json";
  return "text/html";
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error(
      "Usage: npx tsx scripts/inspect-capture.ts <saved-response-file> [sourceURL]\n" +
        "  e.g. npx tsx scripts/inspect-capture.ts scripts/.capture-marks.html",
    );
    process.exit(1);
  }

  let body: string;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    console.error(`Couldn't read ${file}. Did the curl -o write it there?`);
    process.exit(1);
  }

  if (!body.trim()) {
    console.error(
      `${file} is empty. The request probably returned nothing — the session may\n` +
        "have expired, or the cookie wasn't sent. Re-copy the request while logged in.",
    );
    process.exit(1);
  }

  const report = summarizeResponse({
    url: process.argv[3] ?? `(local file: ${file})`,
    status: 200,
    contentType: guessContentType(body),
    body,
  });

  writeFileSync(REPORT_FILE, report, "utf8");
  console.log(report);
  console.log(`\n─────\nMasked report written to ${REPORT_FILE} — safe to share.`);
}

main();
