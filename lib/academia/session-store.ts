/**
 * LOCAL CLI DIAGNOSTICS ONLY — **not** the app's auth path.
 *
 * The running app is multi-user and stores each user's session in their own
 * encrypted httpOnly cookie (lib/auth/session-cookie.ts). Do NOT wire this
 * file back into the app: it is a single shared session (so every visitor
 * would share one student's data) and it writes to local disk (which does not
 * exist on Vercel — the deploy target).
 *
 * What it's still for: the `scripts/*.ts` probes and parsers, which run under
 * plain `npx tsx` outside Next and therefore have no cookie jar. `npx tsx
 * scripts/save-session.ts` writes the file; the inspect/probe/verify scripts
 * read it.
 *
 * The file is gitignored, but it grants account access while valid — treat it
 * like a credential and delete it when done (`npx tsx scripts/clear-session.ts`).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AcademiaSession } from "./types";
import { isExpired, SESSION_SOFT_WINDOW_MS } from "./client";

export const SESSION_FILE = "scripts/.session.json";

export function saveSession(session: AcademiaSession, path = SESSION_FILE): void {
  writeFileSync(path, JSON.stringify(session), "utf8");
}

/** Returns the stored session, or null if absent/expired/corrupt. */
export function loadSession(path = SESSION_FILE): AcademiaSession | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw?.cookies || typeof raw.expiresAt !== "number") return null;

    // Files written before `issuedAt` existed: back-fill a reasonable estimate
    // (the old fixed window was always expiresAt - 6h) instead of forcing a
    // needless re-login purely over an internal format change.
    const session: AcademiaSession =
      typeof raw.issuedAt === "number"
        ? raw
        : { ...raw, issuedAt: raw.expiresAt - SESSION_SOFT_WINDOW_MS };

    if (isExpired(session)) return null;
    if (session !== raw) saveSession(session, path);
    return session;
  } catch {
    return null;
  }
}

export function clearSession(path = SESSION_FILE): void {
  if (existsSync(path)) rmSync(path);
}
