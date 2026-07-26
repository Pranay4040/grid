@AGENTS.md

# PortalFree — free SRM academic companion

Free replacement for the paywalled PortalX. Logs into SRM Academia, shows
timetable/attendance/marks/courses in a glassmorphism UI. Unofficial.

**Status:** ✅ auth, timetable, attendance, theming (6 palettes × light/dark),
Marks table, GPA estimator. ⏳ real assessment data (portal hasn't published
any this term), multi-user login, study-material library (the differentiator),
Courses/Calendar pages.

**Stack:** Next.js 16 · React 19 · Tailwind v4 · TS. Scripts run via `npx tsx`.

**Layout:** `lib/academia/` = engine (`client.ts` auth, `parse.ts`, `data.ts`,
`timetable-grid.ts`, `dashboard.ts`). `app/page.tsx` = server component →
`loadDashboard()` → real data. `components/` = glass + theme + timetable UI.

**Key facts (don't re-derive):**
1. Login = Zoho `/accounts/signin.ac` + `oauthorize_uri`/`access_token` exchange; full email required.
2. Data pages need header `X-Requested-With: XMLHttpRequest` (else 8KB shell).
3. Data hides in `pageSanitizer.sanitize('…escaped JS…')`; tables malformed → parse by splitting `</tr>`.
4. Timetable page = `My_Time_Table_2023_24` (stale name, current content).
5. SRM day-order 1-5, batch slot templates in `timetable-grid.ts`; `L##` labs unplaced (won't-fix — both affected courses are out of syllabus, see ROADMAP.md).
6. Portal exposes **no** day-order/calendar source to this account (probed 2026-07-26, `scripts/probe-day-order.ts` — every planner/calendar page 403s or is an empty shell). Today's day-order = manual anchor + weekday projection, `lib/timetable/day-order.ts`; this is permanent, not provisional.
7. GPA estimator (`/gpa`, `lib/academia/gpa.ts`) models SRM's 60/40 internal/external split; its marks→grade cutoff table (`MARK_GRADE_CUTOFFS`) is a commonly-cited scale, **unverified** against an official SRM document.

**Dev:** user runs `save-session.ts` (writes gitignored `scripts/.session.json`, ~6h); app loads it.

**Security:** passwords never stored/logged/handled; entry stays on the user's machine.

**Design:** semantic colour tokens (no AI violet/cyan); WCAG-AA.
