# Session Handoff

Quick-context primer for picking this back up. Full detail: `ROADMAP.md`
(feature checklist) and `CLAUDE.md` (stack/facts, always-loaded).

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
support. **Not wired into the real entry flow** — `/` still goes straight to
the dashboard regardless of login state.

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
  (`check(name, actual, expected)`, PASS/FAIL, `process.exit`). ~9 exist now.
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

`npx tsc --noEmit`, `npx eslint .`, `npx next build`, and all **13**
`scripts/verify-*.ts` (exit 0) are green. Work sits on branch
**`ui-revamp-courses-calendar`** (branched off `master` at `d8cb968`).

**Not yet merged to `master`, and not pushed.** Remote is
`github.com/Pranay4040/portalfree`. Merging is a fast-forward:
`git checkout master && git merge ui-revamp-courses-calendar`.

User intends to make the repo **public** and deploy to **Vercel**. Set
`SESSION_SECRET` in the Vercel project first — the app is inert without it.

## Next up (unstarted, pick one)

1. User has a queue of **minor UI tweaks** they said they'd request one at a
   time — expect those first.
2. Rate-limit `/login` before real public traffic (see Auth in ROADMAP.md).
2. Decide `/welcome`'s real placement (redirect unauth visitors there? new
   route?) — still orphaned; `/` goes straight to the dashboard regardless of
   login state.
3. Multi-user/public auth + server-side encrypted session store — the big
   deferred step, and the blocker for any public release.
4. Study-material library — unscoped differentiator vs. PortalX.
5. Smaller: Timetable still lives on Overview rather than its own tab; `.ics`
   export; batch slot templates beyond 1 & 2; motion polish on the remaining
   surfaces.

**Known-blocked (not fixable by us):** real assessment data (portal has
published none this term), holiday drift on `/calendar`, and
`MARK_GRADE_CUTOFFS` still unverified against an official SRM document.

Ask the user which part before touching any of these.
