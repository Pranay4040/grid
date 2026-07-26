/**
 * Parsers for Academia's page markup.
 *
 * Every data page ships its real content as an escaped JS string:
 *   document.getElementById("zc-viewcontainer_<View>").innerHTML =
 *     pageSanitizer.sanitize('<...escaped HTML...>')
 * We pull that string out, unescape it, and parse the tables inside.
 *
 * The table markup is MALFORMED in ways that defeat a normal DOM parser:
 *   - timetable data rows omit the opening <tr> (only </tr> is present)
 *   - the attendance code cell mashes the code with a "Regular" tag:
 *       <td>21CSC302J</br><font>Regular</font></td>
 * So we split rows on the </tr> closing tags and read cells positionally,
 * pulling the course code out with a pattern rather than exact-matching a cell.
 */
import type {
  AttendanceData,
  AttendanceRow,
  Course,
  StudentInfo,
  SubjectMarks,
  TimetableData,
} from "./data-types";

const CODE_RE = /\b(\d{2}[A-Z]{3}\d{3}[A-Z]?)\b/;

/** Undo the JS-string escaping Zoho applies inside sanitize('…'). */
function unescapeJs(s: string): string {
  return s
    .replace(/\\\\/g, "\\")
    .replace(/\\x27/gi, "'")
    .replace(/\\x22/gi, '"')
    .replace(/\\x26/gi, "&")
    .replace(/\\x3c/gi, "<")
    .replace(/\\x3e/gi, ">")
    .replace(/\\x2f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/\\-/g, "-")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"');
}

/** Extract the inner HTML for a Zoho view (page link name). */
export function extractView(pageHtml: string, viewName: string): string | null {
  const marker = `zc-viewcontainer_${viewName}`;
  const at = pageHtml.indexOf(marker);
  if (at === -1) return null;
  const open = pageHtml.indexOf("pageSanitizer.sanitize('", at);
  if (open === -1) return null;
  const start = open + "pageSanitizer.sanitize('".length;
  // Read until the terminating unescaped single quote.
  let i = start;
  while (i < pageHtml.length) {
    const c = pageHtml[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'") break;
    i++;
  }
  return unescapeJs(pageHtml.slice(start, i));
}

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ") // drop inner tags (font/br/strong)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The longest <table> whose text contains all the given labels. */
function findTable(inner: string, ...must: string[]): string | null {
  const tables = [...inner.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const matches = tables.filter((t) => {
    const text = clean(t).toLowerCase();
    return must.every((m) => text.includes(m.toLowerCase()));
  });
  matches.sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

/** Every <table>…</table> span at every nesting depth, correctly paired by
 *  walking the tag stream — unlike findTable()'s non-greedy regex, which
 *  closes at the first </table> it meets even when that's a table nested
 *  inside another (e.g. Academia's Test Performance table nests one empty
 *  <table> per course row; the regex above truncates to just the first row). */
function tableSpans(html: string): string[] {
  const tagRe = /<(\/?)\s*table\b[^>]*>/gi;
  const spans: string[] = [];
  const openStack: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const isClose = m[1] === "/";
    if (!isClose) {
      openStack.push(m.index);
    } else if (openStack.length > 0) {
      const start = openStack.pop()!;
      spans.push(html.slice(start, m.index + m[0].length));
    }
    // An unbalanced closer with an empty stack is ignored — matches this
    // file's existing tolerance for malformed markup.
  }
  return spans;
}

/** The SMALLEST table whose text contains all the given labels — a
 *  nesting-aware sibling of findTable(). "Smallest" (not "longest") is
 *  deliberate: with depth-correct spans, any ancestor wrapper table would
 *  also contain both labels and incorrectly win under a "longest" rule. */
function findTableNested(inner: string, ...must: string[]): string | null {
  const matches = tableSpans(inner).filter((t) => {
    const text = clean(t).toLowerCase();
    return must.every((m) => text.includes(m.toLowerCase()));
  });
  matches.sort((a, b) => a.length - b.length);
  return matches[0] ?? null;
}

/**
 * Rows of a table as arrays of cleaned cell text. Splits on </tr> (present even
 * when the opening <tr> is missing) and pulls <td> cells from each chunk.
 */
function tableRows(tableHtml: string): string[][] {
  return tableHtml
    .split(/<\/tr>/i)
    .map((chunk) =>
      [...chunk.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1])),
    )
    .filter((cells) => cells.length > 0);
}

const num = (s: string) => {
  const n = parseFloat((s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Pull "Label: value" fields out of the student-info blob. */
function parseStudent(text: string): StudentInfo {
  const t = clean(text);
  const grab = (label: string, stop: string) =>
    t.match(new RegExp(`${label}\\s*:?\\s*(.+?)\\s*(?=${stop})`, "i"))?.[1]?.trim() ?? "";
  const deptRaw = grab("Department", "Specialization|Batch|Semester|Mobile|Program|Enrollment|$");
  const section = deptRaw.match(/\(([^)]*Section[^)]*)\)/i)?.[1]?.trim();
  return {
    registrationNumber: grab("Registration Number", "Name"),
    name: grab("Name", "Program|Batch|Mobile"),
    program: grab("Program", "Department"),
    department: deptRaw.replace(/\s*-?\s*\([^)]*\)/g, "").trim(),
    specialization: grab("Specialization", "Semester|Batch"),
    semester: grab("Semester", "Batch|Enrollment|Mobile|\"|$"),
    batch: grab("Batch", "Mobile|Program|Feedback|Enrollment|$"),
    section,
  };
}

export function parseAttendance(pageHtml: string): AttendanceData | null {
  const inner = extractView(pageHtml, "My_Attendance");
  if (!inner) return null;
  const student = parseStudent(clean(inner));

  const rows: AttendanceRow[] = [];
  const attTable = findTable(inner, "course code", "attn");
  if (attTable) {
    for (const cells of tableRows(attTable)) {
      const code = cells[0]?.match(CODE_RE)?.[1];
      if (!code) continue; // header/spacer rows have no code
      // cell0 "code Regular" | title | category | faculty | slot | room | cond | absent | attn
      rows.push({
        code,
        title: cells[1] ?? "",
        category: cells[2] ?? "",
        faculty: cells[3] ?? "",
        slot: cells[4] ?? "",
        room: cells[5] ?? "",
        hoursConducted: num(cells[6]),
        hoursAbsent: num(cells[7]),
        attendancePct: num(cells[8]),
      });
    }
  }

  const marks: SubjectMarks[] = [];
  const marksTable = findTableNested(inner, "course code", "test performance");
  if (marksTable) {
    for (const cells of tableRows(marksTable)) {
      const code = cells[0]?.match(CODE_RE)?.[1];
      if (!code) continue;
      marks.push({ code, courseType: cells[1] ?? "", components: [] });
    }
  }

  return { student, rows, marks };
}

export function parseTimetable(
  pageHtml: string,
  viewName = "My_Time_Table_2023_24",
): TimetableData | null {
  const inner = extractView(pageHtml, viewName);
  if (!inner) return null;
  const student = parseStudent(clean(inner));
  const title =
    clean(inner).match(/My Time Table\s*(AY\s*\d{4}-\d{2}\s*\w+)/i)?.[0] ?? "My Time Table";

  const courses: Course[] = [];
  const table = findTable(inner, "course code", "slot", "credit");
  if (table) {
    for (const cells of tableRows(table)) {
      // sNo | code | title | credit | regnType | category | courseType | faculty | slot | room | ay
      const codeIdx = cells.findIndex((c) => CODE_RE.test(c));
      if (codeIdx === -1) continue;
      const code = cells[codeIdx].match(CODE_RE)![1];
      const c = cells.slice(codeIdx); // normalise so code is index 0
      const ay = c.find((x) => /^AY\d{4}-\d{2}/i.test(x)) ?? "";
      courses.push({
        code,
        title: c[1] ?? "",
        credit: num(c[2]),
        category: c[4] ?? "",
        courseType: c[5] ?? "",
        faculty: c[6] ?? "",
        slot: c[7] ?? "",
        room: c[8] ?? "",
        academicYear: ay,
      });
    }
  }

  return { student, title, courses };
}
