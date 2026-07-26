# PortalFree Roadmap

Living checklist across every part of the app. Checked items are shipped on
`main`; unchecked items are scoped but not yet built. See
`CLAUDE.md` for the overall project status line.

## Timetable

- [x] Customization overlay foundation — scraped schedule stays source of
      truth, user edits (optional/removed/added) are a diff applied on top,
      persisted in the browser (`lib/timetable/custom-store.ts`,
      `applyCustom()` in `lib/academia/timetable-grid.ts`).
- [x] Mark a class **optional** — renders semi-transparent, excluded from
      "current/next class" highlighting.
- [x] **Remove** a scraped class (persisted) + **restore** it later.
- [x] **Add** a fully custom class (title/room/faculty/day-order/period).
- [x] **Full-week grid** — all 5 day-orders at once (periods × day-orders),
      toggle against the single-day tab view.
- [x] **Today / Now** — highlight the current + next class, live time
      indicator. Ships with a *manual anchor + auto-advance* day-order
      (weekday-based default, corrected once and remembered) because a live
      Academia session wasn't available this session to confirm whether the
      portal exposes the current day-order directly.
- [x] **Verify Today's day-order source against the live portal — negative
      result, manual anchor confirmed as the permanent design.**
      `scripts/probe-day-order.ts` (2026-07-26) probed 78 candidate page names
      (harvested from the site root + every `Academic_Planner_*`/`Calendar`
      name pattern back to 2004). Every `Academic_Planner_YYYY_YY`/`Calendar`
      page through 2024/25 returns 403 (exists, this account can't read it);
      the three current-year planner pages return 200 but render an empty
      view container (reachable, no content for this account); nothing hit
      the day-order label, the `DO` abbreviation, or a calendar-shaped table.
      Matches what `discover-data.ts`/`inspect-pages.ts` already found on the
      pages they could reach. Conclusion: Academia exposes no day-order or
      calendar source to this account — the manual anchor in
      `lib/timetable/day-order.ts` is the permanent source of record, not a
      placeholder. Don't re-probe unless SRM changes what this account can
      see. Follow-up shipped instead: `source` (`anchor`/`unconfirmed`/`guess`)
      now labels an unanchored or stale (10+ working days) value as a guess
      rather than presenting it as fact, and the label itself is the
      correction trigger when it's least trustworthy.
- [x] **Lab (`L##`) slot placement — won't-do.** The only two unplaced
      courses are `21GNP301L` (Community Connect) and `21LEM301T` (Indian Art
      Form), both out of syllabus. The `L##`→grid-cell mapping is unknown and
      a guessed lab time is worse than the existing explicit "Also
      registered … timings shown in the official portal" fallback. Not
      pursuing unless a course that actually matters lands in an `L##` slot.
- [ ] **Batch slot templates beyond 1 & 2.** Separate from the lab item above
      — a real gap for any student not in batch 1/2. Re-scope with real data
      from another batch if/when available.
- [ ] Calendar export (`.ics`) + Google Calendar link, "next class in N min"
      reminders (Notification API).
- [x] UI polish pass — motion, spacing/type, richer visuals, mobile —
      applied to the timetable surfaces built this round.

## Attendance

- [x] Skip-planner math: "how many more classes can I miss and stay above
      75%" (or "how many do I need to attend to recover"), computed per
      attendance row (Theory/Practical tracked independently). Pure engine in
      `lib/academia/attendance-planner.ts` (`planAttendance()`). Fixed 75%
      threshold, extracted as `ATTENDANCE_THRESHOLD`. Verified: 14/14 checks
      in `scripts/verify-attendance-planner.ts` — early-semester
      100%-attendance courses correctly show "tight" rather than "safe"
      (margin is thin in absolute hours this early, not a bug).
- [x] Dedicated **Attendance tab** (`/attendance`) with per-course cards
      matching the reference design: attended/absent/total pill counts,
      percent, and "Margin: N" (positive = safe skips remaining, negative =
      classes needed to recover) — reuses `planAttendance()` unchanged, adds
      `lib/academia/attendance-cards.ts` (`buildAttendanceCards()`) to also
      surface not-yet-started courses as "Not started" cards instead of
      silently dropping them. Superseded the old homepage-embedded
      AttendanceList + Skip Planner panel entirely — see Navigation below.
      Verified: 12/12 checks in `scripts/verify-attendance-cards.ts`,
      confirmed live against real data.
- [ ] Per-course trend / projection over time (needs historical snapshots,
      not just the current cumulative totals Academia reports).

## Marks / GPA

- [x] **Fixed a real parser bug**: `findTable()`'s non-greedy regex closed at
      the first `</table>` it met, which — for the Test Performance table,
      where each course row nests its own (currently empty) sub-table —
      truncated the parse to just course row 1. Live-confirmed:
      `parseAttendance()` returned `marks: 1` for 9 registered courses.
      Fixed with a nesting-aware `findTableNested()` (`lib/academia/parse.ts`),
      used only for the marks-table lookup; now returns all 9. Verified:
      11/11 checks in `scripts/verify-parse-tables.ts` (synthetic fixtures,
      no live session needed) + live confirmation via `scripts/verify-parse.ts`.
- [ ] Populate `SubjectMarks.components` once assessment data exists
      (currently always `[]` — the row-count bug above is fixed, but
      Academia's Test Performance data itself is still empty this term:
      "Internal Marks Detail will be updated after each assessment has been
      conducted", confirmed live). Also still unknown: how to classify a
      future component's label (e.g. `CT-I`) as internal vs external —
      `lib/academia/gpa.ts` deliberately doesn't attempt this yet.
- [x] **Marks page** (`/marks`) — read-only table, one row per registered
      course, honest "Not graded yet" status pill. No local state.
      `lib/academia/marks-table.ts` (`buildMarksRows()`) reconciles courses
      against marks rows so nothing silently vanishes, same contract as
      `attendance-cards.ts`. Verified: 10/10 checks in
      `scripts/verify-marks-table.ts`.
- [x] **GPA estimator** (`/gpa`) — models SRM's actual 60/40 internal/external
      split: internal total = whatever Academia has published (real data,
      always 0 today) + your estimate for the rest; external = your estimate
      out of the exam's native 75-mark scale, converted ×40/75. Combined →
      total/100 → grade via a marks-to-grade cutoff table (**commonly-cited,
      UNVERIFIED against an official SRM document** — one constant,
      `MARK_GRADE_CUTOFFS` in `lib/academia/gpa.ts`) → credit-weighted SGPA
      across fully-estimated subjects. Plus a per-subject grade slider
      (visualization only) showing the external mark needed for any grade
      given the current internal total. Estimates persist in localStorage
      (`lib/gpa/estimate-store.ts`); nothing is silently clamped — an
      over-limit total is flagged, not hidden. No cross-semester CGPA history
      table — scoped to this semester only. Verified: 46/46 checks in
      `scripts/verify-gpa.ts`.

## Theming / UI system

- [ ] De-duplicate palette hues: `SWATCH` in `components/theme-switcher.tsx`
      vs `--t*` in `app/globals.css` currently must be kept in sync by hand.
- [ ] Extend the shared motion/polish system from the timetable to the rest
      of the dashboard (stat tiles, attendance list, header).

## Navigation

- [x] Real app shell: shared header + sidebar (desktop) / horizontal tab row
      (mobile), built via a Next.js route group (`app/(app)/`) so `/login`
      stays outside it. `components/app-header.tsx`, `components/app-nav.tsx`
      (the only client-side nav piece — active-tab highlighting via
      `usePathname()`), `app/(app)/layout.tsx`. Sized to hold future tabs:
      Courses/Calendar show as disabled "Soon" placeholders; Marks and GPA
      graduated to real nav entries once those pages shipped.
      `loading.tsx` skeletons on both routes (`components/skeleton.tsx`) so
      the real Academia fetch latency (a few seconds) shows a skeleton
      instead of feeling like a stall.
- [ ] Give Timetable and the rest of the placeholder pages their own tabs
      once they're built — Timetable currently still lives on Overview.

## Study-material library

- [ ] Scope this out — the intended differentiator vs. PortalX.

## Auth

- [x] Self-extending session instead of a fixed 6h cutoff. The 6h number was
      never something Zoho enforced — it was our own conservative guess, and
      the cookie jar discarded Zoho's real `Expires`/`Max-Age` entirely, so we
      never actually knew the real limit. Now: `isExpired()` only enforces a
      soft window that gets pushed forward on every successful dashboard load
      (`extendSession()` in `lib/academia/client.ts`), plus a 30-day hard
      backstop regardless of activity (security hygiene, not a real Zoho
      limit). `loadDashboard()` distinguishes `session_expired` (a real fetch
      came back logged-out) from `no_session` (nothing saved) so the UI can
      say the right thing.
- [ ] **Empirically confirm how long Zoho's real session survives with zero
      activity.** `scripts/probe-session-liveness.ts` checks the saved
      session against the live portal independent of our own bookkeeping —
      run it again after a genuinely idle stretch (e.g. the actual weekend,
      no app opens in between) to get a real number instead of a guess.
- [x] In-app login page (`/login`) replacing the CLI-only `save-session.ts`
      flow — still single-user, still writes to the same local
      `scripts/.session.json`, just a nicer UI over the same
      `login()`/`saveSession()` calls. Built as a Next.js 16 Server Action
      (`app/login/actions.ts`) + client form (`components/login-form.tsx`);
      `/login` redirects straight to `/` if already connected, and the
      dashboard's "Not connected"/"Session expired" states link to `/login`.
- [x] Logout button in the homepage header (`app/logout/actions.ts`), visible
      only when connected — clears the session file and redirects to
      `/login`.
- [x] Fixed a real classifier bug: a wrong password produced a raw
      `Unrecognised signin.ac response: {"t":"json","error":{"msg":"Invalid
      Email Address or Password"}}` message instead of "Incorrect NetID or
      password." — `classifyError()` only checked the plural `errors[]`
      array/`message`/`localized_message` fields, never the singular
      `error.msg` shape Zoho actually sends. Fixed in `client.ts`; regression
      test in `scripts/verify-login-errors.ts` pins the exact real response.
- [x] Reset-password hint after 3+ consecutive wrong-password attempts on
      `/login` — links out to the official Academia portal rather than us
      building any password-reset flow ourselves (out of scope/security: a
      third-party tool shouldn't mediate account recovery). Streak is carried
      via `useActionState`'s `prevState` in `app/login/actions.ts`, no local
      component state needed.
- [ ] Multi-user login, server-side encrypted session store (public phase).
      This is the bigger step: per-user accounts, encrypted server-side
      session storage instead of a shared local file, `dashboard.ts` taking a
      resolved user session instead of always reading the one local file.
- [ ] CAPTCHA / bot protection on a public login form — not applicable yet
      (no public-facing login exists; today's only "login" is running
      `save-session.ts` locally). Revisit alongside multi-user auth. Note:
      Zoho's own login already has bot protection our client detects and
      reports (`captcha_required`) rather than tries to bypass — that's a
      hard line, not something we build around.
