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

8. **Auth is multi-user via an encrypted cookie — there is NO session database.** Each user's Academia cookie bundle is AES-256-GCM encrypted (`lib/auth/session-crypto.ts`, key = HKDF of `SESSION_SECRET`) and stored in their own httpOnly cookie (`lib/auth/session-cookie.ts`). The server keeps no copy, so there's no central vault to breach and logout is just deleting the cookie. Requires `SESSION_SECRET` (≥32 chars) in `.env.local` locally and in Vercel's env vars deployed; without it the app reports `misconfigured` rather than 500ing.
9. **Cookies can't be set during a Server Component render** (Next constraint). That's why `dashboard.ts` no longer re-saves the session after each fetch — only Server Actions (`app/login/actions.ts`, `app/logout/actions.ts`) write the cookie. Don't reintroduce a write in the render path.
10. `lib/academia/session-store.ts` (the `scripts/.session.json` file) is **CLI-diagnostics only** now — never the app's auth path. It's one shared session and needs a writable disk, neither of which works on Vercel.

**Dev:** `cp .env.example .env.local` and set `SESSION_SECRET` (`openssl rand -hex 32`), then `npm run dev` and sign in at `/login`. For the `scripts/*.ts` probes (which run outside Next and have no cookie jar), `npx tsx scripts/save-session.ts` still writes `scripts/.session.json`.

11. **Login is rate-limited per IP** (`lib/auth/rate-limit.ts`): 10 attempts / 15 min, checked *before* hitting Zoho, via Upstash REST over plain `fetch` (no dependency). **Fails open** everywhere (unconfigured, down, timeout, no client IP) — never let the limiter break sign-in. Optional; the app runs fine without `UPSTASH_REDIS_REST_*`.

**Deploy (Vercel):** set `SESSION_SECRET` in project env vars — use a *different* value than local. Optionally set `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` to activate login rate limiting (recommended before publicising). No other service is needed. Rotating `SESSION_SECRET` logs everyone out.

**Security:** passwords never stored/logged/handled — forwarded to Zoho once and dropped. Sessions only ever leave the server encrypted. Known risk for a public deploy: all logins originate from Vercel's IPs, which is exactly the pattern Zoho rate-limits/CAPTCHAs; `client.ts` detects and reports both (`rate_limited`, `captcha_required`) rather than trying to bypass them — bypassing bot protection is a hard line.

**Design:** semantic colour tokens (no AI violet/cyan); WCAG-AA.
