# Grid Roadmap

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

- [x] **Dropped the 6-palette × light/dark glassmorphism system for one fixed
      flat theme.** The glass surfaces (`backdrop-filter` blur, gradient field,
      grain texture) and the palette/mode switcher read as visually
      inconsistent — especially once the Marks/GPA tables became dense,
      information-heavy cards sitting on frosted panels — and the multi-theme
      surface area (6 hues × 2 modes = 12 combinations to keep coherent) wasn't
      earning its cost. Replaced with a single fixed dark palette matching
      `/welcome`'s landing-page design (`--bg #0d0d11`, `--surface #141419`,
      `--accent #b6b2f2`) — solid opaque panels, no blur, no animated
      background. `components/theme.tsx` and `components/theme-switcher.tsx`
      deleted; `components/glass.tsx` → `components/panel.tsx`
      (`GlassPanel` → `Panel`, `strong` prop → `raised`). Semantic token
      *names* (`--accent`, `--success`, `--line`, `text-muted`, etc.) are
      unchanged, so every component's `className` strings kept working — only
      `app/globals.css`'s token *values* and the handful of `--glass-*`-named
      tokens (`--panel-hover`, `--surface-raised`) changed. If a future palette
      returns, `app/globals.css` is still the one place to edit.
- [ ] Extend the shared motion/polish system from the timetable to the rest
      of the dashboard (stat tiles, attendance list, header).

## Navigation

- [x] Real app shell, built via a Next.js route group (`app/(app)/`) so
      `/login` stays outside it. `components/app-header.tsx`,
      `app/(app)/layout.tsx`. `loading.tsx` skeletons on every route
      (`components/skeleton.tsx`) so the real Academia fetch latency (a few
      seconds) shows a skeleton instead of feeling like a stall.
- [x] **Nav consolidated into one hamburger menu** (`components/nav-menu.tsx`)
      at every viewport size — replaced the earlier persistent
      sidebar (desktop) / tab row (mobile) / always-visible theme switcher,
      which read as cluttered and inconsistent, especially alongside the
      wide Marks/GPA tables. One compact trigger in the header (leftmost,
      before the brand name) opens a popover with nav links
      (`components/app-nav.tsx`, now a plain list, no sidebar/tabs variants)
      and logout — closes on outside click, `Escape`, or navigating. Fixed a
      real z-index bug along the way: every `Panel` gets its own stacking
      context from (the now-removed) `backdrop-filter`, so the header needed
      `relative z-40` itself or its popover painted *underneath* later
      static content regardless of its own `z-50`. Sized to hold future
      tabs: Courses/Calendar show as disabled "Soon" placeholders; Marks and
      GPA graduated to real nav entries once those pages shipped. The
      "Appearance" section (theme switcher) was removed from this menu when
      the palette system was dropped — see Theming / UI system.
- [x] **Marks/GPA tables rebuilt as card lists** — the original dense
      `<table>` layouts needed horizontal scrolling to read on anything
      narrower than ~52rem, which was the #1 complaint. `components/marks-table.tsx`
      and `components/gpa-table.tsx` now use the same card-list pattern as
      `attendance-cards.tsx` (one `Panel` + `<li>` per course), so
      every screen size reads top-to-bottom with zero horizontal scroll.
- [x] **Courses and Calendar graduated from "Soon" placeholders to real nav
      entries** once those pages shipped. `SOON_ITEMS` in
      `components/app-nav.tsx` is now empty — the menu holds six real links
      (Overview, Attendance, Courses, Calendar, Marks, GPA). Keep the
      placeholder mechanism around for whatever lands next.
- [ ] Give Timetable its own tab — it currently still lives on Overview.

## Courses

- [x] **Courses page** (`/courses`) — the full registration record Academia
      holds per course, which nothing else in the app surfaced: credit,
      category, course type, faculty, slot and room, joined to whatever
      attendance has accrued. `lib/academia/courses-table.ts`
      (`buildCourseRows()` + `summarizeCourses()`), same "nothing silently
      vanishes" contract as `attendance-cards.ts`/`marks-table.ts` — a course
      with no attendance still shows, and an attendance row with no matching
      registration surfaces as a `credit: null` row rather than being dropped.
      Theory and Practical attendance stay separate (SRM tracks them
      independently), so a lab-based course shows both percentages. Course
      codes are deduped — a course registered as both theory and lab appears
      twice in the scrape but is one card. `cleanFaculty()` strips Academia's
      trailing staff-ID tag ("Dr.Maivizhi R (103033)" → "Dr.Maivizhi R") only
      when it's that all-digit suffix, never a real parenthetical. Header
      chips break credits down by category. Verified: 28/28 checks in
      `scripts/verify-courses-table.ts`, plus live confirmation (8 courses,
      21 credits).
- [ ] Per-course detail drill-down (syllabus, unit breakdown) — needs a data
      source we don't have yet.

## Calendar

- [x] **Calendar page** (`/calendar`) — month grid projecting the day-order
      rotation across real dates, with per-date class counts and a
      click-through day detail listing that day's classes and times.
      `lib/timetable/calendar.ts` (`buildCalendarMonth()`). Monday-first weeks,
      trailing all-padding rows dropped. Reuses the timetable's customization
      overlay, so classes removed/added/marked optional there are reflected
      here too.
- [x] **Fixed a real day-order bug this surfaced.** `resolveDayOrder()`
      counted working days with an *unsigned* helper, so for any date BEFORE
      the anchor it returned 0 and reported the anchor's own day-order.
      The Today view never hit this (its anchor is always ≤ today), but a
      month grid hits it on every render — every past weekday showed the wrong
      day order. `workingDaysBetweenExclusive()` is now signed, and
      `resolveDayOrder()` uses a floored modulo so backward projection doesn't
      land outside 1-5. Verified: 37/37 checks in `scripts/verify-calendar.ts`,
      which pins forward, backward, across-weekend, and full-cycle projection.
- [ ] **Holidays are still unknowable.** Every day-order on this page is
      projected from the manual anchor — Academia exposes no academic calendar
      to this account (see the Timetable section), so the projection silently
      drifts after any holiday the rotation skips. The page says so plainly
      rather than implying the dates are authoritative, and flags when today's
      own day-order is a guess or a long-unconfirmed anchor. Revisit only if
      SRM ever exposes a real calendar.
- [ ] Calendar export (`.ics`) — see the Timetable section; the projection
      caveat above applies doubly to anything exported into a real calendar app.

## Study-material library

- [ ] Scope this out — the intended differentiator vs. PortalX.

## Marketing

- [x] Public landing hero at `/welcome` (`app/welcome/page.tsx`) — separate
      from the authenticated app shell, deliberately its own standalone
      design system (own color tokens, not the app's semantic theme/palette
      switcher — a one-off marketing page doesn't need to match the
      dashboard). 16:9 grid composition on desktop (fits one viewport, no
      scroll), normal document flow below 1024px. Hamburger menu with a
      full focus trap, body-scroll lock, and `inert` when closed. Full
      motion system (page-load choreography, scroll-reveal on the product
      preview, `prefers-reduced-motion` support). Not yet wired into the
      app's actual entry flow — `/` still goes straight to the authenticated
      dashboard (or `<NotConnected>`) regardless of login state; deciding
      how unauthenticated visitors reach `/welcome` vs. `/login` is a
      follow-up.

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
- [x] **Multi-user login via an encrypted session cookie — no session database.**
      The old `scripts/.session.json` path was both single-user (one shared
      file = every visitor seeing one student's data) and impossible on Vercel
      (no writable filesystem), so it had to go regardless. Each user's
      Academia cookie bundle is now AES-256-GCM encrypted
      (`lib/auth/session-crypto.ts`; key derived from `SESSION_SECRET` via
      HKDF-SHA256) and lives in that user's own httpOnly/SameSite=Lax cookie
      (`lib/auth/session-cookie.ts`). **The server stores nothing** — chosen
      over Vercel KV/Postgres deliberately: a central store of live SRM
      sessions is a high-value breach target we'd then be responsible for, and
      the payload (~700 bytes of cookie values → 1.4KB encrypted) fits a
      cookie with room to spare. Logout is just deleting the cookie; rotating
      `SESSION_SECRET` is a global sign-out. A missing/short secret surfaces
      as a distinct `misconfigured` state (and the login action refuses to
      send the password at all) rather than a 500 or a login that silently
      can't persist. Verified: 36/36 adversarial checks in
      `scripts/verify-session-crypto.ts` (tampered ciphertext/tag/IV, wrong
      version, wrong key, malformed shapes, nonce uniqueness, size budget),
      plus live confirmation — all six routes served real data through a
      minted cookie, and tampered/forged/absent cookies all fell back to
      "Not connected" with no data leak.
- [x] **Dropped the render-time session re-save.** Next forbids setting
      cookies once streaming starts, so `dashboard.ts`'s
      `saveSession(extendSession(...))` had to go. Nothing was lost:
      `expiresAt` was already documented as informational (only `issuedAt` +
      the 30-day backstop gate anything), and `probe-session-liveness.ts`
      confirmed Academia reissues no cookies on a data fetch. The cookie's own
      max-age now carries the lifetime, pinned to the same hard deadline.
- [x] **Fixed "the correct password keeps getting rejected."** Two independent
      bugs wearing the same face, neither of them about credentials.
      (1) `loadDashboard()` treated *either parser returning null* as
      `session_expired`, on the assumption that a null parse could only mean
      the logged-out shell. It also means "the session is fine and SRM changed
      the page" — and then the app told users to sign in again, accepted the
      right password, redirected back, and said it again, with no way out.
      Now `classifyPage()` (`lib/academia/parse.ts`) separates a real signin
      shell from an authenticated page we couldn't read, and the second gets
      its own `page_unavailable` state with the diagnostic (view names, HTTP
      status, byte count — no page content, so no PII) and deliberately no
      sign-in button. `getTimetable()` also tries academic-year-derived page
      names, and `resolveView()` follows a same-page rename, so the rename
      this codebase has been braced for since 2023 degrades to one extra
      request instead of a lockout.
      (2) `classifyError()` matched the bare words "password", "invalid",
      "incorrect" and any code starting `IN`, so "Your password has expired",
      "You must change your password", "Invalid CSRF token" and
      `INTERNAL_SERVER_ERROR` all rendered as "Incorrect NetID or password."
      Now narrowed to actual credential phrases, with `password_expired` and
      `account_locked` checked *first* (both contain the word "password" while
      meaning it was right) and everything unmodelled falling through to
      `unexpected` with the real message. Non-JSON signin.ac responses are
      sniffed for a captcha challenge instead of being reported as an outage.
      Regression tests: `scripts/verify-page-state.ts` (21 checks, offline
      fixtures) and the extended `scripts/verify-login-errors.ts`.
- [ ] **Zoho may throttle a public deployment.** Every login will originate
      from Vercel's IP range — the exact pattern Zoho's bot protection
      targets. `client.ts` already classifies `captcha_required` and
      `rate_limited` and reports them honestly (bypassing bot protection is
      out of scope, permanently). Unknown until real traffic hits it; if it
      becomes a problem the honest options are a clear error state or asking
      users to sign in on the official portal first.
- [ ] Per-user accounts of our own (saved preferences, study-material
      library) — would need a real datastore. Not required by anything today;
      the cookie approach deliberately avoids one until something actually
      needs cross-device persistence.
- [x] **Per-IP rate limiting on `/login`** (`lib/auth/rate-limit.ts`) —
      10 attempts per IP per 15-minute fixed window, checked *before* the
      request reaches Zoho, since capping what we send them is half the point.
      Backed by Upstash Redis over its REST API via plain `fetch`, so it adds
      **no dependency**. An in-memory counter was considered and rejected: on
      serverless it's per-lambda-instance, so concurrent requests hit separate
      counters and the real ceiling is (limit × warm instances) — unpredictable,
      and worse than nothing because it feels like protection. **Fails open**
      by design (unconfigured, unreachable, timeout, or malformed response all
      allow the attempt, flagged `degraded`) — a limiter must not be able to
      take sign-in down when a third-party has a bad day; the tradeoff is that
      an Upstash outage leaves the form unprotected. A missing client IP also
      fails open rather than sharing one bucket, since a shared "unknown"
      bucket would let one script lock out every user whose IP we couldn't
      read. Optional: without `UPSTASH_REDIS_REST_URL`/`_TOKEN` the app runs
      exactly as before. Verified: 43/43 in `scripts/verify-rate-limit.ts`,
      including an end-to-end blocking test against a fake Upstash server
      (port 0) — the fail-open tests alone would have passed even if the
      limiter never blocked anything.
- [ ] Consider a per-username limit alongside per-IP. Per-IP stops one host
      hammering many accounts; it doesn't stop a distributed attempt on one
      account. Only worth it if abuse actually shows up.
- [ ] Zoho's own bot protection is detected and reported
      (`captcha_required`), never bypassed — a hard line, not a gap to close.
