/**
 * The app's per-user session store: one encrypted httpOnly cookie.
 *
 * Replaces the single-user `scripts/.session.json` file for everything the
 * running app does. That file still exists for LOCAL CLI DIAGNOSTICS ONLY
 * (see lib/academia/session-store.ts) — it is not, and must not become, the
 * app's auth path again, because Vercel has no writable filesystem and a
 * shared file cannot represent more than one user.
 *
 * WRITE CONSTRAINT (enforced by Next, not by us): cookies can only be SET
 * from a Server Function or Route Handler — never during a Server Component
 * render, because headers are already flushed once streaming starts. So
 * `readSession()` is safe anywhere, while `writeSession()`/`clearSession()`
 * are only legal from the login/logout actions.
 */
import "server-only";
import { cookies } from "next/headers";
import { isExpired, SESSION_ABSOLUTE_MAX_MS } from "../academia/client";
import { decryptSession, encryptSession, sessionSecretMissing } from "./session-crypto";
import type { AcademiaSession } from "../academia/types";

/** Renaming this logs every user out (their old cookie is simply ignored).
 *  Safe to have changed pre-launch; treat as frozen now. */
export const SESSION_COOKIE = "grid_session";

export { sessionSecretMissing };

/**
 * Reads and decrypts the caller's session. Returns null when there is no
 * cookie, it fails authentication (tampered/forged/stale key), or it's past
 * the hard 30-day backstop. Safe in Server Components.
 */
export async function readSession(): Promise<AcademiaSession | null> {
  if (sessionSecretMissing()) return null;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = decryptSession(token);
  if (!session) return null;

  // Same backstop the file-based store applied. The cookie's max-age should
  // already have expired it client-side, but a client controls its own cookie
  // jar, so re-check server-side rather than trusting that.
  if (isExpired(session)) return null;
  return session;
}

/**
 * Persists a session to the caller's cookie.
 * SERVER ACTIONS / ROUTE HANDLERS ONLY — see the write constraint above.
 */
export async function writeSession(session: AcademiaSession): Promise<void> {
  const token = encryptSession(session);

  // Pin the cookie's lifetime to the session's own hard deadline so the
  // browser stops sending it exactly when the server would reject it.
  const remainingMs = session.issuedAt + SESSION_ABSOLUTE_MAX_MS - Date.now();
  const maxAge = Math.max(0, Math.floor(remainingMs / 1000));

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // never readable from JS — XSS can't lift the session
    secure: process.env.NODE_ENV === "production", // plain http on localhost
    sameSite: "lax", // survives top-level navigation, blocks cross-site POSTs
    path: "/",
    maxAge,
  });
}

/**
 * Drops the session cookie.
 * SERVER ACTIONS / ROUTE HANDLERS ONLY — see the write constraint above.
 */
export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
