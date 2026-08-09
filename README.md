# Grid

A free, fast academic companion for SRM students. Sign in with your SRM
Academia account and get your timetable, attendance, marks, GPA estimate,
courses and calendar in one place — no ads, no paywall.

> **Unofficial.** Grid is not affiliated with, endorsed by, or connected to
> SRM Institute of Science and Technology. It reads the same Academia pages
> you can already see in your browser, on your behalf.

## Features

- **Timetable** — day and full-week views, current/next class highlighting,
  and a customisation layer (mark classes optional, remove them, add your own)
  that lives on top of the scraped schedule without overwriting it.
- **Attendance** — per-course percentages plus a skip planner: how many
  classes you can still miss and stay above 75%, or how many you need to
  attend to recover.
- **Marks** — every registered course, with an honest "not graded yet" state.
- **GPA estimator** — models SRM's 60/40 internal/external split and works out
  the SGPA your estimates imply.
- **Courses** — the full registration record: credits, category, faculty,
  slot, room, joined to accrued attendance.
- **Calendar** — the day-order rotation projected across a month.

## How your credentials are handled

- Your password is sent **straight to SRM Academia** to sign in, and is never
  stored, logged, or retained after that request.
- The resulting Academia session is **AES-256-GCM encrypted** and stored in
  your own httpOnly cookie. **The server keeps no copy.** There is no session
  database — which means there's no central store of student sessions to be
  breached.
- Signing out deletes the cookie. That's the whole logout.

## Running it yourself

```bash
npm install
cp .env.example .env.local
```

Generate a session key and put it in `.env.local` as `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
npm run dev
```

Open http://localhost:3000 and sign in at `/login`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | Encrypts session cookies. Minimum 32 characters. Without it the app reports "Server not configured" rather than starting insecurely. |
| `UPSTASH_REDIS_REST_URL` | No | Enables per-IP login rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Paired with the URL above. |

Rate limiting is optional and **fails open** — if Upstash is unset or
unreachable, sign-in still works. Recommended for any public deployment.

## Deploying

Deploys to Vercel as-is; no database or other service required. Set
`SESSION_SECRET` in the project's environment variables (use a different value
than your local one), and optionally the two Upstash variables. Rotating
`SESSION_SECRET` signs everyone out.

## Tests

No test framework — pure logic is covered by standalone scripts:

```bash
npx tsx scripts/verify-gpa.ts          # or any other verify-*.ts
```

Each prints PASS/FAIL per check and exits non-zero on failure.

## Known limitations

- **Assessment marks are empty this term.** Academia hasn't published any, so
  the marks page shows "not graded yet" for everything. That's upstream, not a
  bug here.
- **Calendar day-orders are projections.** Academia exposes no academic
  calendar to student accounts, so day-orders are counted forward from one you
  confirm manually. They drift after any holiday the rotation skips, and the
  page says so.
- **GPA grade cutoffs are unverified.** The marks-to-grade table is a
  commonly-cited scale, not confirmed against an official SRM document.
- **Timetable slot templates cover batches 1 and 2 only.**
