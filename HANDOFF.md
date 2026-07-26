# Session Handoff

Quick-context primer for picking this back up. Full detail: `ROADMAP.md`
(feature checklist) and `CLAUDE.md` (stack/facts, always-loaded).

## What got built this session

**Timetable customization** (`lib/timetable/`, `components/timetable-view.tsx`)
Overlay pattern: scrape stays source of truth, user edits (optional/removed/
added classes) are a diff in localStorage, merged at render via pure
`applyCustom()`. Full-week grid view. Today/Now via a manual day-order anchor
(portal doesn't confirm current day-order; unverified — see ROADMAP).

**Session auth, fixed twice**
1. Was hard-capped at 6h (our own guess, not a real Zoho limit) → now
   self-extends on every successful load (`extendSession()`), 30-day hard
   backstop only.
2. Bug: that fix still hard-gated on the guessed expiry before even trying
   the real cookies → false "logged out" after ~24h idle even though Zoho
   was still fine. Fixed: `isExpired()` now only enforces the 30-day cap;
   validity always comes from actually trying the fetch.
`scripts/probe-session-liveness.ts` tests the real session independent of
our bookkeeping.

**Login/logout UI** — `/login` (Server Action + form, replaces the
env-var-only CLI script), Logout button in the header. Fixed a real
classifier bug (wrong password showed a raw JSON dump instead of "Incorrect
NetID or password" — Zoho's actual error shape wasn't handled). Reset-password
hint after 3 bad attempts, links to the official portal (we don't build
password reset ourselves — out of scope/security).

**Attendance skip-planner + tab**
`lib/academia/attendance-planner.ts` (`planAttendance()`, pure, tested) does
the "can I skip / must I attend" math per row (Theory/Practical separate).
`lib/academia/attendance-cards.ts` reconciles it against raw rows so
not-started courses show instead of vanishing. Lives on its own **`/attendance`**
page now, not the homepage.

**Real nav shell** — `app/(app)/` route group (keeps `/login` outside it),
sidebar (desktop) / tab row (mobile), `components/app-nav.tsx` is the only
client piece (active-tab highlight). `loading.tsx` skeletons on both routes
since real Academia fetches take a few seconds.

## Conventions established (keep following these)

- **No test framework** — pure logic gets a standalone `scripts/verify-*.ts`
  (plain `check(name, actual, expected)`, PASS/FAIL, `process.exit`). 5 exist,
  ~65 checks total, all passing.
- **Persisted client state** = `useSyncExternalStore` over localStorage,
  matching `components/theme.tsx`'s pattern (cached snapshot, cross-tab sync).
- **Never touch the user's password** — I don't type real or fake credentials
  into the login form myself, ever. User tests those flows.
- **Ask before assuming, plan before building** — user wants Explore → design
  → clarifying questions → written plan → approval, *per part*, before code.
  Don't skip this even for "obvious" next steps.
- Verify visually via the preview browser tool after every change; a mock
  data harness at a temp route works when no live session is available.

## Current state

Real session active (`scripts/.session.json`), real student data flowing
through both pages. Dev server: `npm run dev` (or via the preview tool).
`npx tsc --noEmit && npm run lint` both clean.

## Next up (unstarted, pick one)

From ROADMAP.md, roughly in order of readiness:
1. **Timetable loose ends** — verify today's day-order against the live
   portal now that login works reliably; lab (`L##`) slot placement (now
   have real data to check against).
2. **Marks/GPA** — blocked until assessment data exists on the portal.
3. **Multi-user/public auth** — the big deferred step: real accounts,
   encrypted server-side sessions, no shared local file.
4. Minor cleanup: dedupe `SWATCH` (theme-switcher.tsx) vs `--t*` (globals.css).

Ask the user which part before touching any of these.
