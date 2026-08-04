@AGENTS.md

# PortalFree — free SRM academic companion

Free replacement for the paywalled PortalX. Logs into SRM Academia, shows
timetable/attendance/marks/courses in a flat, minimal UI. Unofficial.

**Status:** ✅ auth, timetable, attendance, Marks table, GPA estimator,
Courses page, Calendar page, `/welcome` landing hero. ⏳ real assessment data
(portal hasn't published any this term), multi-user login, study-material
library (the differentiator).

**Stack:** Next.js 16 · React 19 · Tailwind v4 · TS. Scripts run via `npx tsx`.

**Layout:** `lib/academia/` = engine (`client.ts` auth, `parse.ts`, `data.ts`,
`timetable-grid.ts`, `dashboard.ts`). `app/page.tsx` = server component →
`loadDashboard()` → real data. `components/` = `panel.tsx` (flat surfaces,
was `glass.tsx`) + timetable/attendance/marks/gpa UI. One fixed dark theme
(`app/globals.css`) — no palette/light-dark switcher (removed; see
ROADMAP.md "Theming / UI system").

**Key facts (don't re-derive):**
1. Login = Zoho `/accounts/signin.ac` + `oauthorize_uri`/`access_token` exchange; full email required.
2. Data pages need header `X-Requested-With: XMLHttpRequest` (else 8KB shell).
3. Data hides in `pageSanitizer.sanitize('…escaped JS…')`; tables malformed → parse by splitting `</tr>`.
4. Timetable page = `My_Time_Table_2023_24` (stale name, current content).
5. SRM day-order 1-5, batch slot templates in `timetable-grid.ts`; `L##` labs unplaced (won't-fix — both affected courses are out of syllabus, see ROADMAP.md).
6. Portal exposes **no** day-order/calendar source to this account (probed 2026-07-26, `scripts/probe-day-order.ts` — every planner/calendar page 403s or is an empty shell). Today's day-order = manual anchor + weekday projection, `lib/timetable/day-order.ts`; this is permanent, not provisional. `/calendar` projects that same anchor across a whole month (`lib/timetable/calendar.ts`) — **every date there is an estimate that drifts after any skipped holiday**, and the page says so. `resolveDayOrder()` projects both directions (signed working-day count + floored modulo); don't "simplify" it back to an unsigned count, that silently breaks every past date.
7. GPA estimator (`/gpa`, `lib/academia/gpa.ts`) models SRM's 60/40 internal/external split; its marks→grade cutoff table (`MARK_GRADE_CUTOFFS`) is a commonly-cited scale, **unverified** against an official SRM document.

**Dev:** user runs `save-session.ts` (writes gitignored `scripts/.session.json`, ~6h); app loads it.

**Security:** passwords never stored/logged/handled; entry stays on the user's machine.

**Design:** semantic colour tokens (no AI violet/cyan); WCAG-AA.
