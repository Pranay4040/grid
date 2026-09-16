/**
 * The Student Portal session, stored exactly like the Academia one
 * (lib/auth/session-cookie.ts): AES-256-GCM encrypted into the user's own
 * httpOnly cookie, no server-side copy. Same write constraint too — only
 * Server Actions may call write/clear.
 */
import "server-only";
import { cookies } from "next/headers";
import { PORTAL_COOKIE } from "../auth/cookie-name";
import { decryptSession, encryptSession, sessionSecretMissing } from "../auth/session-crypto";
import type { PortalSession } from "./client";

/** Browser-side lifetime only. The portal's own server-side timeout is
 *  unknown and almost certainly shorter; real expiry is detected from the
 *  response (see load.ts), this just stops a long-dead cookie being sent. */
const MAX_AGE_SEC = 7 * 24 * 60 * 60;

export async function readPortalSession(): Promise<PortalSession | null> {
  if (sessionSecretMissing()) return null;
  const stored = decryptSession((await cookies()).get(PORTAL_COOKIE)?.value);
  return stored ? { cookies: stored.cookies } : null;
}

export async function writePortalSession(session: PortalSession): Promise<void> {
  const now = Date.now();
  // issuedAt/expiresAt only satisfy the shared encrypted-token shape.
  const token = encryptSession({ cookies: session.cookies, issuedAt: now, expiresAt: now + MAX_AGE_SEC * 1000 });
  (await cookies()).set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearPortalSession(): Promise<void> {
  (await cookies()).delete(PORTAL_COOKIE);
}
