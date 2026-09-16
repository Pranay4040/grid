/**
 * Offline checks for the Student Portal internal-marks summary parser.
 * Fixture mirrors the REAL captured markup (Sept 2026) with invented numbers.
 *
 * Pass a capture path to also run it against a real response (masked output):
 *   npx tsx scripts/verify-portal-marks.ts scripts/.capture-marks.html
 */
import { readFileSync } from "node:fs";
import { parsePortalMarks, parsePortalMarkComponents } from "../lib/portal/parse";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}\n  actual:   ${actual}`);
  }
}

const row = (id: string, code: string, title: string, mark: string) =>
  `<tr valign="top"><td>${code}</td><td>${title}</td><td>${mark}</td><td>` +
  `<button class="btn" type="button" onclick="funViewComponentWiseMarks('${id}', '${code}', '${title}',2)">` +
  `<i class="fa"></i>View Details</button></td></tr>`;

const html = `<div class="card-title">Internal Mark Details</div>
<table class="table"><thead><tr><th width="10%" scope="col">Code</th><th width="50%" scope="col">Description</th>
<th width="20%" scope="col">Mark / Max. Mark</th><th></th></tr></thead><tbody>
${row("11111", "21MAB302T", "DISCRETE MATHEMATICS", "4.50 / 5.00")}
${row("22222", "21CSC301T", "FORMAL LANGUAGE AND AUTOMATA", "0.00 / 5.00")}
</tbody></table>
<div class="modal"><table><tr><td>unrelated</td></tr></table></div>`;

const rows = parsePortalMarks(html);
check("two graded courses", rows.length, 2);
check("code", rows[0]?.code, "21MAB302T");
check("title", rows[0]?.title, "DISCRETE MATHEMATICS");
check("scored", rows[0]?.total, 4.5);
check("max", rows[0]?.maxTotal, 5);
check("a zero mark is kept, not dropped", rows[1]?.total, 0);
check("subjectId from onclick", rows[0]?.subjectId, "11111");
check("status from onclick", rows[0]?.status, "2");
check("components empty until the detail page is parsed", rows[0]?.components.length, 0);
check("login page / junk yields []", parsePortalMarks("<html><form>Login</form></html>").length, 0);

// Component breakdown (studentInternalMarkDetailsInner.jsp)
const inner = parsePortalMarkComponents(
  `<div><table class="table"><thead><tr><th>Entered on</th><th>Component</th><th>Mark / Max. Mark</th></tr></thead>
<tbody><tr><td>12/Aug/2026</td><td>FT-I</td><td>4.50 / 5.00</td></tr>
<tr><td>01/Sep/2026</td><td>CT-I</td><td>0.00 / 10.00</td></tr></tbody></table></div>`,
);
check("two components", inner.length, 2);
check("component label", inner[0]?.label, "FT-I");
check("component scored", inner[0]?.scored, 4.5);
check("component max", inner[1]?.max, 10);
check("entered on", inner[0]?.enteredOn, "12/Aug/2026");
check("header row is not a component", inner.some((c) => c.label === "Component"), false);
check("empty detail page yields []", parsePortalMarkComponents("<div></div>").length, 0);

const file = process.argv[2];
const innerFile = process.argv[3];
if (innerFile) {
  const real = parsePortalMarkComponents(readFileSync(innerFile, "utf8"));
  console.log(`
real detail capture: ${real.length} component(s)`);
  check("real: at least one component", real.length > 0, true);
  check("real: every component has a label and scored <= max", real.every((c) => c.label && c.scored <= c.max && c.max > 0), true);
}
if (file) {
  const real = parsePortalMarks(readFileSync(file, "utf8"));
  console.log(`\nreal capture: ${real.length} courses`);
  check("real: every row has a code", real.every((r) => /^\d{2}[A-Z]{3}\d{3}[A-Z]?$/.test(r.code)), true);
  check("real: every total <= max", real.every((r) => r.total <= r.maxTotal && r.maxTotal > 0), true);
  check("real: every row has detail ids", real.every((r) => r.subjectId && r.status), true);
}

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
