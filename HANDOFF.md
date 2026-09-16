# Session Handoff

Quick-context primer for picking this back up. Full detail: `ROADMAP.md`
(feature checklist) and `CLAUDE.md` (stack/facts, always-loaded).

## READ THIS FIRST — Student Portal work in progress (Sept 2026)

**Branch: `claude/login-password-issue-nqxvgx`.** Not merged to `master`.

SRM removed attendance + internal marks from Academia and moved them to the
**SRM Student Portal** (`sp.srmist.edu.in`), a separate Java webapp. Grid is
mid-way through building a client for it. What's confirmed, from two real
captured requests:

- Reports come from `POST /srmiststudentportal/students/report/<name>.jsp`
  with body `iden=<n>&filter=&hdnFormDetails=1&csrfPreventionSalt=`
  (the salt was empty in both captures and still worked).
  **attendance = `studentAttendanceDetails.jsp`, `iden=9`** ·
  **internal marks = `studentInternalMarkDetails.jsp`, `iden=13`**
- Needs `X-Requested-With: XMLHttpRequest`, plus `Origin` + `Referer`
  (`.../students/template/HRDSystem.jsp`) which the WAF likely checks.
- Auth is TWO cookies: `JSESSIONID` (Tomcat, `.worker<n>` LB affinity suffix)
  and a `TS…` F5 BIG-IP cookie. **Both** are required.
- `HRDSystem.jsp#!` is a hashbang shell — all data arrives by these XHRs.

**Login is NOT automated and must not be.** The portal login has a mandatory
captcha (`SCaptchaServlet`) plus bot-detection telemetry (`resources/js/
secure2.js` — canvas fingerprint, mouse/keystroke cadence, `navigator.
webdriver`). Getting a headless script past that is bypassing bot protection,
which is this project's hard line. The session is captured from a real human
browser login and replayed; see `lib/portal/client.ts`.

### Built so far
- `lib/portal/client.ts` — report endpoints + `fetchReport()`, reproducing the
  captured requests exactly. 19 checks, `verify-portal-client.ts`.
- `lib/portal/parse.ts` — attendance parser. Columns resolved by HEADER LABEL,
  not position. Emits Grid's existing `AttendanceRow`, so `planAttendance()`
  and the attendance cards work unchanged. 45 checks,
  `verify-portal-attendance.ts`.
- `lib/portal/inspect.ts` + `scripts/capture-portal.ts` +
  `scripts/inspect-capture.ts` — masked capture forensics, so a real response
  can be shared without leaking name/reg-number/marks.

### Next steps (in order)
1. **Verify the attendance parser against a real capture.** The fixture was
   reconstructed from a *rendered screenshot*, so the source markup is still
   unconfirmed (hence the header-based column mapping). Run:
   `npx tsx scripts/verify-portal-capture.ts scripts/.capture-attendance.html`
   To produce that file, replay the attendance cURL from DevTools with
   `-o scripts\.capture-attendance.html` while logged into the portal.
2. **Write the internal-marks parser.** Same recipe, `iden=13`. Capture the
   response first — do NOT invent its shape.
3. **Decide how a portal session reaches Grid.** Because login can't be
   automated, the user has to hand over the two cookies somehow (a "Connect
   Student Portal" paste-your-cookie flow?). Unresolved design question.
4. **UNVERIFIED RISK:** whether the F5/WAF session survives replay from a
   server IP (Vercel) rather than the browser that logged in. If it's pinned
   to client IP/User-Agent, server-side replay fails. Test before building on
   it.

**This environment cannot reach `srmist.edu.in`** (egress is allowlisted to the
npm registry and GitHub), which is why steps 1–2 are blocked here and need a
session running on the student's own machine.

## What got built (most recent session)

**Multi-user auth — encrypted session cookie, no database.** Was the big
deferred step; forced now because the target is Vercel, where the old
`scripts/.session.json` path simply cannot work (no writable filesystem) and
was single-user anyway. Each user's Academia bundle is AES-256-GCM encrypted
(`lib/auth/session-crypto.ts`, HKDF from `SESSION_SECRET`) into their own
httpOnly cookie (`lib/auth/session-cookie.ts`). **Server keeps no copy** —
picked over Vercel KV/Postgres on purpose so there's no central vault of live
SRM sessions to breach. `session-store.ts` (the file) is now CLI-diagnostics
only; don't wire it back into the app. Also dropped `dashboard.ts`'s
render-time `saveSession()` — Next forbids setting cookies mid-render, and
nothing gated on it. `SESSION_SECRET` (≥32 chars) is required: `.env.local`
locally, Vercel env vars deployed; `.env.example` documents it and is the one
`.env*` file that ships.

**Login rate limiting** (`lib/auth/rate-limit.ts`) — 10 attempts per IP per
15 min, checked before the request reaches Zoho. Upstash REST over plain
`fetch`, no dependency. Fails open everywhere by design. **Optional**: unset
env vars = app behaves exactly as before, so it ships safely un-configured.
Rejected an in-memory counter deliberately — per-lambda-instance on
serverless, so its real ceiling is (limit × warm instances).

**Before going public:** all logins originate from Vercel's IPs, exactly the
pattern Zoho rate-limits/CAPTCHAs. Unknown until real traffic hits it, and we
will not bypass it — `client.ts` reports `rate_limited`/`captcha_required`
honestly. See ROADMAP.md under Auth.

**Space-efficiency UI pass.** The shell was `max-w-4xl` (896px), leaving ~272px
blank gutters each side at 1440px — now `max-w-6xl` (1152px). `StatTile` no
longer stretches to fill a 2-col grid (it was a mostly-empty box); tiles are
fixed-width in a `flex flex-wrap` row. Every list panel
(attendance/marks/GPA/timetable-day) went from single-column divider-separated
rows — which left a wide blank gap between short text and right-aligned
numbers — to responsive card grids (1 col → 2 → 3, GPA 1 → 2 since its cards
are richer). Skeletons updated to match so there's no layout jump.
**Colour scheme deliberately untouched** — this was purely layout/density.

**Fixed a real login redirect loop.** `/login` guarded on `loadSession()`,
which only checks our own local soft-expiry stamp, never whether Academia
still accepts the cookies. With a session file that was locally "not expired"
but already rejected server-side, `/login` bounced to `/`, which bounced back
to `/login` — the sign-in form was **unreachable**. Now guards on
`getDashboard()` (the live-checked result), matching session-store.ts's own
stated principle. Confirmed with the whole stack: `discoverService()` works,
fake creds correctly return `bad_password`, form POSTs 200.

**Courses page** (`/courses`) + **Calendar page** (`/calendar`) — see ROADMAP.md
for the full write-up. Both are real nav entries now; `SOON_ITEMS` is empty.

**Fixed a real day-order bug the calendar surfaced.** `resolveDayOrder()`
counted working days with an *unsigned* helper, so every date BEFORE the
anchor returned the anchor's own day-order. The Today view never hit it
(anchor is always ≤ today); a month grid hits it every render. Helper is now
signed + floored modulo. Don't "simplify" it back.

## What got built (prior session)

**Day-order verified, not guessed.** `scripts/probe-day-order.ts` probed 78
candidate portal page names live — confirmed Academia exposes **no**
day-order/calendar source to this account (403s or empty shells). Manual
anchor (`lib/timetable/day-order.ts`) is now documented as the permanent
design, not provisional. Also added `source: "anchor"|"unconfirmed"|"guess"`
so a stale (10+ working day) or absent anchor is labeled honestly in the UI
instead of presented as fact.

**Marks parser bug fixed.** `findTable()` in `lib/academia/parse.ts` silently
truncated the marks table to 1 of 9 courses (non-greedy regex stopped at the
first *nested* `</table>`). New `findTableNested()` fixes it — verified live
(`marks subjects: 9`, was 1).

**Marks + GPA shipped.** `/marks` — read-only table, honest "Not graded yet"
(real assessment data doesn't exist yet this term, confirmed live).
`/gpa` — SGPA estimator modeling SRM's actual 60/40 internal/external split:
portal-published internal (real, wired, currently 0 for everyone) + your
estimate for the rest; external estimated out of 75, converted ×40/75; a
commonly-cited **unverified** marks→grade cutoff table
(`MARK_GRADE_CUTOFFS` in `lib/academia/gpa.ts` — confirm against an official
doc before trusting it). Per-subject grade slider (pure visualization, never
writes to the stored estimate). No CGPA history table — scoped to this
semester only, per user's explicit call.

**`/welcome` landing hero.** Standalone marketing page, own flat dark
palette (`--bg #0d0d11`, `--accent #b6b2f2`), independent of the app's theme.
16:9 desktop grid (fits one viewport, no scroll), hamburger nav with full
focus trap + scroll lock, full motion system, `prefers-reduced-motion`
support. Wired in since `40a161a`: `proxy.ts` 307s `/` → `/welcome` when there
is **no** session cookie at all (Next 16 convention is `proxy`, not
`middleware`). Undecryptable or Academia-rejected cookies still get the
sign-in / reconnect panel, since those are returning users.

**Whole-app redesign, on explicit request.** Removed the 6-palette ×
light/dark glassmorphism system entirely (`components/theme.tsx`,
`theme-switcher.tsx` deleted) for one fixed flat theme matching `/welcome`.
`components/glass.tsx` → `components/panel.tsx` (`GlassPanel`→`Panel`,
`strong`→`raised` prop). Token *names* unchanged (`--accent`, `--line`,
`text-muted`...) so most components only needed `var(--glass-*)` → new names
(`--panel-hover`, `--surface-raised`). Nav collapsed into one hamburger menu
(`components/nav-menu.tsx`) at every viewport — replaced the old persistent
sidebar/tab-row/always-visible theme switcher. Marks/GPA tables rebuilt as
card lists (were dense `<table>`s needing horizontal scroll — the #1
complaint). Fixed a real z-index bug: every `Panel` gets its own stacking
context from `backdrop-filter` (pre-redesign), so the header needed
`relative z-40` itself or its popover painted under later content.

## Conventions established (keep following these)

- **No test framework** — pure logic gets a standalone `scripts/verify-*.ts`
  (`check(name, actual, expected)`, PASS/FAIL, `process.exit`). 15 exist now.
- **Persisted client state** = `useSyncExternalStore` over localStorage
  (`lib/store/json-store.ts`'s `makeJsonStore`, shared helper now).
- **Never touch the user's password.**
- **Ask before assuming, plan before building** — Explore → design →
  clarifying questions → written plan → approval, per part.
- **Mask everything in probe/diagnostic scripts** — this session caught a
  real PII leak (reg number printed unmasked) from a table-structure bug in
  `inspect-pages.ts` (fixed) and `probe-day-order.ts` (fixed same-session).
  Never print a raw HTML slice; only status/counts/masked cells.
- **Double-check the browser tool before trusting it** — this session hit
  several tool-specific artifacts (stale console buffers, stale
  `getComputedStyle`, stuck Suspense-streamed renders) on the long-lived
  "seed" tab. A **fresh tab** (`tabs_create`) + direct `fetch()` checks
  reliably cut through all of them. Don't assume a live-render check failure
  means the code is wrong — cross-check via `tsc`/lint/server logs/raw fetch
  first.

## Current state

`npx tsc --noEmit`, `npx eslint .` and `npx next build` are clean. Of the 15
`scripts/verify-*.ts`, **13 exit 0**; `verify-grid.ts` and `verify-parse.ts`
need a LIVE Academia session (`npx tsx scripts/save-session.ts`) and report
honestly when it's expired — that's environment, not a regression.

**Reported login bug, fixed:** "it keeps failing even with the correct
password" turned out not to be a login failure at all — sign-in succeeded and
the *dashboard* reported `session_expired` because a null parse was assumed to
mean the logged-out shell. See ROADMAP.md under Auth for both halves of the
fix. **Still unverified against the live portal** (this environment can't reach
`academia.srmist.edu.in`): if the trigger really was SRM renaming the timetable
page, the new candidate list should now find it — and if it didn't, the app now
prints the view names it actually saw instead of blaming the password.

Everything is **merged to `master` and pushed**. Remote is
`github.com/Pranay4040/grid` (renamed from `portalfree` via `gh repo rename`;
local `origin` already updated). Stale local branches
(`ui-revamp-courses-calendar`, `claude/optimistic-torvalds-845e38`) were merged
and have been deleted locally.

**Repo is still PRIVATE.** Making it public is the user's call and was
deliberately not done automatically — it's hard to walk back once cloned or
cached. Personal data was scrubbed first (the login placeholder held the
author's real NetID/SRM email; two scripts held the same email plus an
absolute path exposing their Windows username), so it's *safe* to flip when
they choose.

**Not deployed yet.** Vercel and Upstash setup are dashboard/account actions
that must be done by the user — no CLI path exists here (`vercel` isn't
installed and its login needs interactive browser OAuth). Required:
`SESSION_SECRET` in Vercel env vars (app is inert without it, reporting
`misconfigured`), production branch set to `master` not `main`, and optionally
the two `UPSTASH_REDIS_REST_*` vars to activate login rate limiting.

## Next up (unstarted, pick one)

1. User has a queue of **minor UI tweaks** they said they'd request one at a
   time — expect those first.
2. Study-material library — unscoped differentiator vs. PortalX.
3. Smaller: Timetable still lives on Overview rather than its own tab; `.ics`
   export; batch slot templates beyond 1 & 2; motion polish on the remaining
   surfaces; a per-username login limit to complement the per-IP one.

**Known-blocked (not fixable by us):** real assessment data (portal has
published none this term), holiday drift on `/calendar`, and
`MARK_GRADE_CUTOFFS` still unverified against an official SRM document.

Ask the user which part before touching any of these.
