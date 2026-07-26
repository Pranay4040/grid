/**
 * SRM slot system → day-wise schedule.
 *
 * SRM runs a rotating "day order" 1–5 (not weekdays). Each day-order has 10
 * periods, and a fixed template assigns a slot code to every (day, period)
 * cell. A student's registered course carries slot code(s); the course meets
 * in every cell whose template code matches.
 *
 * Templates are batch-specific (verified against goscraper/ClassPro). Slot
 * letters A–G/E are theory; P-codes are practical/lab cells. The morning period
 * times are confirmed (they reproduce the official portal exactly); afternoon
 * times follow the standard SRM schedule.
 *
 * Known gap: some lab courses carry "L##-L##" slot codes that don't appear in
 * the P-based template — those are returned in `unplaced` rather than guessed
 * into a wrong cell. See buildSchedule().
 */
import type { Course } from "./data-types";

export const BATCH_TEMPLATES: Record<string, string[][]> = {
  "1": [
    ["A", "A", "F", "F", "G", "P6", "P7", "P8", "P9", "P10"],
    ["P11", "P12", "P13", "P14", "P15", "B", "B", "G", "G", "A"],
    ["C", "C", "A", "D", "B", "P26", "P27", "P28", "P29", "P30"],
    ["P31", "P32", "P33", "P34", "P35", "D", "D", "B", "E", "C"],
    ["E", "E", "C", "F", "D", "P46", "P47", "P48", "P49", "P50"],
  ],
  "2": [
    ["P1", "P2", "P3", "P4", "P5", "A", "A", "F", "F", "G"],
    ["B", "B", "G", "G", "A", "P16", "P17", "P18", "P19", "P20"],
    ["P21", "P22", "P23", "P24", "P25", "C", "C", "A", "D", "B"],
    ["D", "D", "B", "E", "C", "P36", "P37", "P38", "P39", "P40"],
    ["P41", "P42", "P43", "P44", "P45", "E", "E", "C", "F", "D"],
  ],
};

export const PERIOD_TIMES: { start: string; end: string }[] = [
  { start: "08:00", end: "08:50" },
  { start: "08:50", end: "09:40" },
  { start: "09:45", end: "10:35" },
  { start: "10:40", end: "11:30" },
  { start: "11:35", end: "12:25" },
  { start: "12:30", end: "13:20" },
  { start: "13:25", end: "14:15" },
  { start: "14:20", end: "15:10" },
  { start: "15:15", end: "16:05" },
  { start: "16:10", end: "17:00" },
];

export type ScheduledClass = {
  period: number; // 1-based
  start: string;
  end: string;
  course: Course;
  /** User marked this optional via the customization overlay — render dimmed. */
  optional?: boolean;
  /** User-added rather than scraped from Academia. */
  custom?: boolean;
  /** Present only when `custom` is true; the key used to edit/remove it. */
  customId?: string;
};

export type DaySchedule = {
  dayOrder: number; // 1-5
  classes: ScheduledClass[];
};

export type WeekSchedule = {
  days: DaySchedule[];
  /** Courses whose slot codes couldn't be placed on the template (e.g. L##). */
  unplaced: Course[];
};

/* ---------------------------------------------------------------------------
   Customization overlay.

   The scrape stays the source of truth; anything the student edits (marking a
   class optional, dropping one they no longer attend, adding one Academia
   doesn't know about) is stored as a diff and merged in at render time by
   applyCustom(). Keeping it a pure function makes it trivial to verify and to
   reuse from both the day view and the week grid.
--------------------------------------------------------------------------- */

/** A student-added entry that has no corresponding scraped Course. */
export type CustomClass = {
  id: string;
  title: string;
  code?: string;
  room?: string;
  faculty?: string;
  dayOrder: number; // 1-5
  period: number; // 1-based, indexes PERIOD_TIMES
};

export type TimetableCustom = {
  /** Rendered semi-transparent: scraped course codes, or a CustomClass's id
   *  (codes on user-added entries are optional and may repeat/be blank, so
   *  those are keyed by id instead). */
  optional: string[];
  /** Scraped course codes hidden from the grid (student dropped the course). */
  removed: string[];
  /** Entries the student added that Academia doesn't know about. */
  added: CustomClass[];
};

export const EMPTY_CUSTOM: TimetableCustom = {
  optional: [],
  removed: [],
  added: [],
};

function customToCourse(c: CustomClass): Course {
  return {
    code: c.code ?? "",
    title: c.title,
    credit: 0,
    category: "Custom",
    courseType: "Custom",
    faculty: c.faculty ?? "",
    slot: "",
    room: c.room ?? "",
    academicYear: "",
  };
}

/** Merge the user's customizations on top of a freshly scraped WeekSchedule. */
export function applyCustom(
  week: WeekSchedule,
  custom: TimetableCustom,
): WeekSchedule {
  const removedSet = new Set(custom.removed);
  const optionalSet = new Set(custom.optional);

  const days: DaySchedule[] = week.days.map((day) => {
    const kept = day.classes
      .filter((c) => !removedSet.has(c.course.code))
      .map((c) =>
        optionalSet.has(c.course.code) ? { ...c, optional: true } : c,
      );

    const added: ScheduledClass[] = custom.added
      .filter((a) => a.dayOrder === day.dayOrder)
      .map((a) => {
        const t = PERIOD_TIMES[a.period - 1] ?? PERIOD_TIMES[0];
        return {
          period: a.period,
          start: t.start,
          end: t.end,
          course: customToCourse(a),
          custom: true,
          customId: a.id,
          optional: optionalSet.has(a.id),
        };
      });

    const classes = [...kept, ...added].sort((a, b) => a.period - b.period);
    return { dayOrder: day.dayOrder, classes };
  });

  const unplaced = week.unplaced.filter((c) => !removedSet.has(c.code));

  return { days, unplaced };
}

/** Stable, ordered list of distinct course codes across the week — used to
 *  keep per-course tint colours consistent between the day view and the
 *  week grid. */
export function weekCourseCodes(week: WeekSchedule): string[] {
  return [
    ...new Set(week.days.flatMap((d) => d.classes.map((c) => c.course.code))),
  ];
}

/**
 * Find the class in progress and the next one, given "HH:MM" for now.
 * Optional classes are excluded — a class you've marked optional shouldn't
 * drive the "current/next" highlight even if its slot is technically active.
 */
export function currentAndNextClass(
  classes: ScheduledClass[],
  nowHHMM: string,
): { current?: ScheduledClass; next?: ScheduledClass } {
  const eligible = [...classes]
    .filter((c) => !c.optional)
    .sort((a, b) => a.period - b.period);
  return {
    current: eligible.find((c) => c.start <= nowHHMM && nowHHMM < c.end),
    next: eligible.find((c) => c.start > nowHHMM),
  };
}

/** Split a course slot field ("P33-P34-", "A", "L11-L12-") into slot tokens. */
function slotTokens(slot: string): string[] {
  return slot
    .split(/[-,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildSchedule(
  courses: Course[],
  batch: string,
): WeekSchedule {
  const template = BATCH_TEMPLATES[batch] ?? BATCH_TEMPLATES["1"];

  // Index courses by each slot token they occupy.
  const bySlot = new Map<string, Course>();
  const placed = new Set<Course>();
  for (const course of courses) {
    for (const tok of slotTokens(course.slot)) bySlot.set(tok, course);
  }

  const days: DaySchedule[] = template.map((row, d) => {
    const classes: ScheduledClass[] = [];
    row.forEach((code, p) => {
      const course = bySlot.get(code);
      if (!course) return;
      placed.add(course);
      const t = PERIOD_TIMES[p];
      classes.push({ period: p + 1, start: t.start, end: t.end, course });
    });
    return { dayOrder: d + 1, classes };
  });

  const unplaced = courses.filter((c) => !placed.has(c));
  return { days, unplaced };
}

/** 12-hour label for a time card, e.g. "8:00 AM". */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}
