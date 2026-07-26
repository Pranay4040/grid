/** Parsed academic data shapes. Derived from the real Academia page markup. */

export type StudentInfo = {
  registrationNumber: string;
  name: string;
  program: string; // e.g. "B.Tech"
  department: string;
  specialization: string;
  semester: string;
  batch: string;
  section?: string;
};

/** One registered course from the timetable/registration page. */
export type Course = {
  code: string; // "21CSC302J"
  title: string; // "Computer Networks"
  credit: number;
  category: string; // "Professional Core"
  courseType: string; // "Lab Based Theory" | "Theory" | "Practical" …
  faculty: string; // "Dr.Maivizhi R (103033)"
  slot: string; // "A", "B", "L11-L12-", …
  room: string; // "CLS524"
  academicYear: string; // "AY2026-27-ODD"
};

/** One row from the attendance table. */
export type AttendanceRow = {
  code: string;
  title: string;
  category: string; // "Theory" | "Practical"
  faculty: string;
  slot: string;
  room: string;
  hoursConducted: number;
  hoursAbsent: number;
  attendancePct: number;
};

/** One internal-assessment component (empty until assessments are held). */
export type MarkComponent = {
  label: string; // "FT-I", "LLT-I", …
  scored: number;
  max: number;
};

export type SubjectMarks = {
  code: string;
  courseType: string;
  components: MarkComponent[];
  total?: number;
  maxTotal?: number;
};

export type AttendanceData = {
  student: StudentInfo;
  rows: AttendanceRow[];
  marks: SubjectMarks[];
};

export type TimetableData = {
  student: StudentInfo;
  title: string; // "My Time Table AY 2026-27 ODD"
  courses: Course[];
};
