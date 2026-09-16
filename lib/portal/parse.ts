/**
 * Parser for the SRM Student Portal's attendance report
 * (POST students/report/studentAttendanceDetails.jsp, iden=9).
 *
 * The report carries three things, confirmed against a real capture:
 *   1. COURSE WISE ATTENDANCE - During the Period: <from> To <to>
 *      Code | Description | Max. hours | Att. hours | Absent hours | Total Percentage
 *   2. Cumulative Attendance (In Hours): Month / Year | Present | Absent
 *   3. Absent Details (may be empty)
 *
 * The column mapping onto Grid's existing AttendanceRow is exact, which is why
 * this emits that type directly — `planAttendance()` and the attendance cards
 * then work unchanged:
 *     Max. hours    -> hoursConducted
 *     Absent hours  -> hoursAbsent
 *     Total Percentage -> attendancePct
 * (Att. hours is redundant — conducted minus absent — but it IS parsed, so a
 * mismatch can be detected rather than silently averaged over.)
 *
 * The portal does NOT publish category/faculty/slot/room for attendance the way
 * Academia did. Those are left empty rather than inferred: guessing "Theory"
 * from a course-code suffix would be a fabricated value in a field the UI
 * presents as fact.
 *
 * COLUMNS ARE RESOLVED BY HEADER LABEL, not by position. The fixture behind the
 * tests was reconstructed from a rendered screenshot of the report rather than
 * from its source, so "Max. hours is the third cell" is an assumption that was
 * never actually verified against the markup. Reading the header row instead
 * means a reordered, renamed-ish or extra column doesn't silently shift every
 * number one to the left — which would produce confident, wrong attendance.
 * Positional order is kept only as a fallback for a table with no header.
 */
import type { AttendanceRow } from "../academia/data-types";

const CODE_RE = /\b(\d{2}[A-Z]{3}\d{3}[A-Z]?)\b/;

function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rows as arrays of cleaned cell text. Splits on </tr> — the same tolerance
 *  lib/academia/parse.ts needs, because this markup may omit opening <tr>. */
function tableRows(tableHtml: string): string[][] {
  return tableHtml
    .split(/<\/tr>/i)
    .map((chunk) =>
      [...chunk.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => clean(m[1])),
    )
    .filter((cells) => cells.length > 0);
}

function tables(html: string): string[] {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
}

/** The smallest table containing every given label. Smallest, not largest: an
 *  outer layout table would also contain them and would win on size. */
function findTable(html: string, ...must: string[]): string | null {
  const matches = tables(html).filter((t) => {
    const text = clean(t).toLowerCase();
    return must.every((m) => text.includes(m.toLowerCase()));
  });
  matches.sort((a, b) => a.length - b.length);
  return matches[0] ?? null;
}

const num = (s: string): number => {
  const n = parseFloat((s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export type MonthlyAttendance = {
  /** As published, e.g. "Jul-2026". */
  month: string;
  present: number;
  absent: number;
};

export type PortalAttendance = {
  rows: AttendanceRow[];
  /** The reporting window, e.g. { from: "21/Jul/2026", to: "16/Sep/2026" }.
   *  Worth surfacing: unlike Academia, this report is period-scoped, so a stale
   *  window is a real thing the UI can be honest about. */
  period: { from: string; to: string } | null;
  cumulative: MonthlyAttendance[];
  /** Courses where Max. hours !== Att. hours + Absent hours. Should be empty;
   *  a non-empty list means the portal's own arithmetic disagrees and the
   *  numbers deserve a caveat rather than quiet trust. */
  inconsistent: string[];
};

/** Which cell holds what. Defaults are the observed order, used only when a
 *  table carries no recognisable header row. */
export type ColumnMap = {
  code: number;
  title: number;
  conducted: number;
  attended: number;
  absent: number;
  percent: number;
};

const DEFAULT_COLUMNS: ColumnMap = {
  code: 0,
  title: 1,
  conducted: 2,
  attended: 3,
  absent: 4,
  percent: 5,
};

/**
 * Map header labels to cell indices. Returns null when the row isn't a header.
 *
 * "absent" is tested before "att" deliberately: they're the two hour columns
 * and matching loosely would swap attended with absent, turning a 94% course
 * into a 5% one without anything looking wrong.
 */
export function resolveColumns(headerCells: string[]): ColumnMap | null {
  const labels = headerCells.map((c) => c.toLowerCase());
  const find = (pred: (label: string) => boolean) => labels.findIndex(pred);

  const code = find((l) => l.includes("code"));
  const title = find((l) => l.includes("description") || l.includes("title"));
  if (code === -1 || title === -1) return null;

  const absent = find((l) => l.includes("absent"));
  const attended = find((l) => l.includes("att") && !l.includes("absent"));
  const conducted = find((l) => l.includes("max") || l.includes("conducted") || l.includes("total hours"));
  const percent = find((l) => l.includes("percent") || l.includes("%"));

  return {
    code,
    title,
    conducted: conducted === -1 ? DEFAULT_COLUMNS.conducted : conducted,
    attended: attended === -1 ? DEFAULT_COLUMNS.attended : attended,
    absent: absent === -1 ? DEFAULT_COLUMNS.absent : absent,
    percent: percent === -1 ? DEFAULT_COLUMNS.percent : percent,
  };
}

export function parsePortalAttendance(html: string): PortalAttendance | null {
  const table =
    findTable(html, "code", "absent hours") ??
    findTable(html, "code", "percentage") ??
    findTable(html, "code", "description");
  if (!table) return null;

  const allRows = tableRows(table);

  // First row that reads as a header wins; otherwise fall back to the observed
  // column order.
  let columns: ColumnMap = DEFAULT_COLUMNS;
  for (const cells of allRows) {
    if (cells.some((c) => CODE_RE.test(c))) break; // data started; no header here
    const resolved = resolveColumns(cells);
    if (resolved) {
      columns = resolved;
      break;
    }
  }

  const rows: AttendanceRow[] = [];
  const inconsistent: string[] = [];

  for (const cells of allRows) {
    const code = cells[columns.code]?.match(CODE_RE)?.[1];
    if (!code) continue; // header and spacer rows carry no course code

    const hoursConducted = num(cells[columns.conducted]);
    const hoursAttended = num(cells[columns.attended]);
    const hoursAbsent = num(cells[columns.absent]);
    const attendancePct = num(cells[columns.percent]);

    if (hoursConducted !== hoursAttended + hoursAbsent) inconsistent.push(code);

    rows.push({
      code,
      title: cells[columns.title] ?? "",
      category: "",
      faculty: "",
      slot: "",
      room: "",
      hoursConducted,
      hoursAbsent,
      attendancePct,
    });
  }

  if (rows.length === 0) return null;

  const periodMatch = clean(html).match(
    /During the Period:\s*([0-9]{1,2}\/[A-Za-z]{3}\/[0-9]{4})\s*To\s*([0-9]{1,2}\/[A-Za-z]{3}\/[0-9]{4})/i,
  );

  const cumulative: MonthlyAttendance[] = [];
  const cumTable = findTable(html, "month", "present", "absent");
  if (cumTable) {
    for (const cells of tableRows(cumTable)) {
      // "Jul-2026" style; skips the header row, which has no such cell.
      if (!/^[A-Za-z]{3}-\d{4}$/.test(cells[0] ?? "")) continue;
      cumulative.push({ month: cells[0], present: num(cells[1]), absent: num(cells[2]) });
    }
  }

  return {
    rows,
    period: periodMatch ? { from: periodMatch[1], to: periodMatch[2] } : null,
    cumulative,
    inconsistent,
  };
}

/**
 * One course from the internal-marks summary
 * (POST students/report/studentInternalMarkDetails.jsp, iden=13).
 *
 * Confirmed against a real capture (Sept 2026): a single table
 *   Code | Description | Mark / Max. Mark ("4.50 / 5.00") | [View Details]
 * listing ONLY courses that have at least one assessment — not every
 * registered course, so absence here means "not graded yet", not zero.
 *
 * The per-test breakdown is not in this page. Each row's button calls
 * funViewComponentWiseMarks(subjectId, code, title, status), which POSTs
 * studentInternalMarkDetailsInner.jsp (iden=1, hdnSubjectId, status); those
 * two ids are kept so that fetch can be made. Components stay [] until that
 * response has been captured and a parser written against it.
 */
export type PortalMarkRow = {
  code: string;
  title: string;
  courseType: string;
  components: { label: string; scored: number; max: number }[];
  total: number;
  maxTotal: number;
  subjectId: string;
  status: string;
};

export function parsePortalMarks(html: string): PortalMarkRow[] {
  const table = findTable(html, "code", "max. mark");
  if (!table) return [];

  const rows: PortalMarkRow[] = [];
  // Raw chunks, not tableRows(): the ids live in an onclick attribute that
  // clean() strips.
  for (const chunk of table.split(/<\/tr>/i)) {
    const cells = [...chunk.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
    const code = cells[0]?.match(CODE_RE)?.[1];
    const score = cells[2]?.match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if (!code || !score) continue;

    const ids = chunk.match(/funViewComponentWiseMarks\(\s*'([^']*)'[^)]*?,\s*'?(\w+)'?\s*\)/);
    rows.push({
      code,
      title: cells[1] ?? "",
      courseType: "",
      components: [],
      total: parseFloat(score[1]),
      maxTotal: parseFloat(score[2]),
      subjectId: ids?.[1] ?? "",
      status: ids?.[2] ?? "",
    });
  }
  return rows;
}

/**
 * Per-test breakdown from studentInternalMarkDetailsInner.jsp. Confirmed
 * against a real capture (Sept 2026):
 *   Entered on ("12/Aug/2026") | Component ("FT-I") | Mark / Max. Mark ("4.50 / 5.00")
 * Emits Grid's MarkComponent shape so it drops into SubjectMarks.components.
 */
export function parsePortalMarkComponents(
  html: string,
): { label: string; scored: number; max: number; enteredOn: string }[] {
  const table = findTable(html, "component", "max. mark");
  if (!table) return [];

  let cols = { entered: 0, label: 1, mark: 2 };
  const out: { label: string; scored: number; max: number; enteredOn: string }[] = [];
  for (const cells of tableRows(table)) {
    const labels = cells.map((c) => c.toLowerCase());
    if (labels.includes("component")) {
      cols = {
        entered: labels.findIndex((l) => l.includes("entered")),
        label: labels.indexOf("component"),
        mark: labels.findIndex((l) => l.includes("max")),
      };
      continue;
    }
    const score = cells[cols.mark]?.match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if (!score || !cells[cols.label]) continue;
    out.push({
      label: cells[cols.label],
      scored: parseFloat(score[1]),
      max: parseFloat(score[2]),
      enteredOn: cells[cols.entered] ?? "",
    });
  }
  return out;
}
