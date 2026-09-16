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

export function parsePortalAttendance(html: string): PortalAttendance | null {
  const table = findTable(html, "code", "absent hours") ?? findTable(html, "code", "percentage");
  if (!table) return null;

  const rows: AttendanceRow[] = [];
  const inconsistent: string[] = [];

  for (const cells of tableRows(table)) {
    const code = cells[0]?.match(CODE_RE)?.[1];
    if (!code) continue; // header and spacer rows carry no course code

    // Code | Description | Max | Att | Absent | Percentage
    const hoursConducted = num(cells[2]);
    const hoursAttended = num(cells[3]);
    const hoursAbsent = num(cells[4]);
    const attendancePct = num(cells[5]);

    if (hoursConducted !== hoursAttended + hoursAbsent) inconsistent.push(code);

    rows.push({
      code,
      title: cells[1] ?? "",
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
