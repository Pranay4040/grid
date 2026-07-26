/**
 * Dev-only local session persistence.
 *
 * Lets the password-bearing login happen once (user-run) and every subsequent
 * data call reuse the resulting cookie bundle. This file gets used regardless
 * of how long it's been sitting idle — only a 30-day hard backstop forces a
 * fresh login (see isExpired() in client.ts); everything short of that is
 * decided by actually trying the cookies against Academia, not by guessing.
 * dashboard.ts re-saves the session (via extendSession()) after each
 * successful fetch, refreshing the "last confirmed working" stamp.
 *
 * This is a DEVELOPMENT convenience. The production multi-user app must NOT
 * write sessions to a plaintext file; it will encrypt cookie bundles in a
 * server-side store keyed to our own session token. The file written here is
 * gitignored, but it does grant account access while valid — treat it like a
 * credential and delete it when done (`npx tsx scripts/clear-session.ts` or
 * just remove scripts/.session.json).
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
