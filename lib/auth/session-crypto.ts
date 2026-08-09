/**
 * Authenticated encryption for the per-user Academia session bundle.
 *
 * WHY THIS EXISTS: the app is multi-user and deploys to Vercel, where there is
 * no writable filesystem — the old `scripts/.session.json` path cannot work
 * there. Rather than stand up a database holding every user's live SRM
 * session (a single, very attractive breach target), each user carries their
 * OWN session, encrypted, in their own httpOnly cookie. The server keeps no
 * copy. If this deployment is compromised, there is no vault of sessions to
 * steal — an attacker gets the key, but no ciphertext to use it on.
 *
 * AES-256-GCM: confidentiality AND integrity. The auth tag means a tampered or
 * forged cookie fails to decrypt rather than yielding attacker-chosen data, so
 * `decryptSession()` can safely be fed whatever a client sends.
 *
 * The key is derived from SESSION_SECRET with HKDF-SHA256. HKDF (not scrypt)
 * is the right tool because we require a HIGH-ENTROPY secret rather than a
 * human password — it's fast enough to run per request, and we cache it anyway.
 * A short/absent secret throws loudly instead of silently falling back to
 * something weak.
 *
 * SECURITY INVARIANT: passwords never reach this module. Only the post-login
 * cookie bundle is ever encrypted — the same invariant client.ts enforces.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { AcademiaSession } from "../academia/types";

/** Format marker, so the token layout can change without silently misreading
 *  old cookies — an unknown version is rejected rather than guessed at. */
const VERSION = "v1";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const TAG_BYTES = 16;

/** Domain-separation label for HKDF — keeps this key distinct from any other
 *  key ever derived from the same secret. Changing this string changes the
 *  derived key, which invalidates every existing session cookie. Treat it as
 *  frozen now that the app is public; rotate SESSION_SECRET instead if you
 *  ever need a global sign-out. */
const HKDF_INFO = "grid.session.v1";

/**
 * Below this, a secret is too weak to be worth encrypting with. 32 chars is
 * what `openssl rand -hex 32` / `openssl rand -base64 32` produce, and the
 * error tells the operator exactly that.
 */
export const MIN_SECRET_LENGTH = 32;

export class SessionSecretError extends Error {}

let cachedKey: Buffer | null = null;
let cachedFrom: string | null = null;

/** True when SESSION_SECRET is absent or too short — lets callers surface a
 *  clear "server misconfigured" state instead of a 500 on every page. */
export function sessionSecretMissing(): boolean {
  const secret = process.env.SESSION_SECRET;
  return !secret || secret.length < MIN_SECRET_LENGTH;
}

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new SessionSecretError(
      "SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` " +
        "and add it to .env.local (locally) or the Vercel project's " +
        "environment variables (deployed).",
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new SessionSecretError(
      `SESSION_SECRET is too short (${secret.length} chars, need at least ` +
        `${MIN_SECRET_LENGTH}). Generate one with \`openssl rand -hex 32\`.`,
    );
  }
  // Re-derive if the secret changed (matters for tests; in production it's
  // read once and cached for the life of the lambda).
  if (cachedKey && cachedFrom === secret) return cachedKey;
  cachedKey = Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), HKDF_INFO, KEY_BYTES),
  );
  cachedFrom = secret;
  return cachedKey;
}

/** Test seam: forget the memoized key so a changed SESSION_SECRET takes effect. */
export function resetKeyCache(): void {
  cachedKey = null;
  cachedFrom = null;
}

const b64 = (buf: Buffer) => buf.toString("base64url");

/**
 * Encrypts a session into a cookie-safe token.
 * Throws SessionSecretError when the deployment isn't configured — that's a
 * misconfiguration the operator must fix, not something to paper over.
 */
export function encryptSession(session: AcademiaSession): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES); // fresh per encryption — never reused
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join(".");
}

/** Structural check on decrypted content. The GCM tag already proves WE wrote
 *  this, but a token minted by an older or different build could still carry a
 *  shape this code no longer expects — so validate rather than cast. */
function isSession(value: unknown): value is AcademiaSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (typeof s.expiresAt !== "number" || typeof s.issuedAt !== "number") return false;
  if (!s.cookies || typeof s.cookies !== "object") return false;
  return Object.values(s.cookies as Record<string, unknown>).every(
    (v) => typeof v === "string",
  );
}

/**
 * Decrypts a token back into a session, or returns null for ANY failure —
 * absent, malformed, wrong version, tampered, key rotated, or structurally
 * unexpected. Callers treat null as "not signed in"; nothing here throws on
 * bad input, because the input is attacker-controlled by definition.
 *
 * (A missing SESSION_SECRET still throws, since that's an operator error
 * rather than a bad request — check sessionSecretMissing() first.)
 */
export function decryptSession(token: string | undefined | null): AcademiaSession | null {
  if (!token) return null;
  const key = getKey();

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, ivB64, tagB64, ctB64] = parts;

  // Constant-time compare on the version marker — not security-critical (it's
  // public), but it keeps the comparison style uniform across this module.
  const vGiven = Buffer.from(version);
  const vWant = Buffer.from(VERSION);
  if (vGiven.length !== vWant.length || !timingSafeEqual(vGiven, vWant)) return null;

  try {
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const ciphertext = Buffer.from(ctB64, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    // .final() is what throws on a bad tag — that's the integrity check.
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    const parsed: unknown = JSON.parse(plaintext);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null; // tampered, truncated, wrong key, or not JSON
  }
}
