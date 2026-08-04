/**
 * Adversarial checks on the session cookie's encryption. This is the module
 * standing between a forged cookie and someone else's SRM session, so the
 * tests here are mostly about what must FAIL, not what must work.
 *
 *   npx tsx scripts/verify-session-crypto.ts
 */
import {
  decryptSession,
  encryptSession,
  resetKeyCache,
  sessionSecretMissing,
  SessionSecretError,
  MIN_SECRET_LENGTH,
} from "../lib/auth/session-crypto";
import type { AcademiaSession } from "../lib/academia/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

function throws(name: string, fn: () => unknown, type?: new (...a: never[]) => Error) {
  let threw = false;
  let right = true;
  try {
    fn();
  } catch (e) {
    threw = true;
    if (type) right = e instanceof type;
  }
  check(name, threw && right, true);
}

const SECRET_A = "a".repeat(16) + "0123456789abcdef"; // 32 chars
const SECRET_B = "b".repeat(16) + "0123456789abcdef"; // 32 chars, different

function applySecret(secret: string | undefined) {
  if (secret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secret;
  resetKeyCache();
}

const session: AcademiaSession = {
  cookies: { _iamadt_client_1: "abc123", JSESSIONID: "xyz789", iamcsr: "csrf-val" },
  expiresAt: 1_800_000_000_000,
  issuedAt: 1_700_000_000_000,
};

/* ---------------------------- configuration ---------------------------- */

applySecret(undefined);
check("missing secret is detected", sessionSecretMissing(), true);
throws("encrypt throws with no secret", () => encryptSession(session), SessionSecretError);

applySecret("tooshort");
check("short secret is detected", sessionSecretMissing(), true);
throws("encrypt throws on short secret", () => encryptSession(session), SessionSecretError);

applySecret("x".repeat(MIN_SECRET_LENGTH));
check("secret at the minimum length is accepted", sessionSecretMissing(), false);

/* ------------------------------ round trip ------------------------------ */

applySecret(SECRET_A);
{
  const token = encryptSession(session);
  check("round trip preserves the session", decryptSession(token), session);
  check("token is cookie-safe (no ; , space or =)", /^[A-Za-z0-9._-]+$/.test(token), true);
  check("token is versioned", token.startsWith("v1."), true);
  check("ciphertext is not plaintext", token.includes("JSESSIONID"), false);
  check("cookie values do not leak into the token", token.includes("xyz789"), false);
}

/* --------------------------- nonce uniqueness --------------------------- */

{
  // Reusing a GCM nonce with the same key is catastrophic — two encryptions of
  // identical input must still differ.
  const a = encryptSession(session);
  const b = encryptSession(session);
  check("same input encrypts to different tokens", a === b, false);
  check("both still decrypt correctly", [decryptSession(a), decryptSession(b)], [session, session]);
}

/* ------------------------------- tampering ------------------------------ */

{
  const token = encryptSession(session);
  const [v, iv, tag, ct] = token.split(".");

  const flip = (s: string) => {
    // Change one base64url char to something else in the same alphabet.
    const i = Math.floor(s.length / 2);
    const c = s[i] === "A" ? "B" : "A";
    return s.slice(0, i) + c + s.slice(i + 1);
  };

  check("tampered ciphertext rejected", decryptSession([v, iv, tag, flip(ct)].join(".")), null);
  check("tampered auth tag rejected", decryptSession([v, iv, flip(tag), ct].join(".")), null);
  check("tampered IV rejected", decryptSession([v, flip(iv), tag, ct].join(".")), null);
  check("wrong version rejected", decryptSession(["v2", iv, tag, ct].join(".")), null);
  check("truncated token rejected", decryptSession([v, iv, tag].join(".")), null);
  check("extra segment rejected", decryptSession([v, iv, tag, ct, ct].join(".")), null);
  check("empty string rejected", decryptSession(""), null);
  check("undefined rejected", decryptSession(undefined), null);
  check("null rejected", decryptSession(null), null);
  check("garbage rejected", decryptSession("not-a-token"), null);
  check("short IV rejected", decryptSession([v, "AAAA", tag, ct].join(".")), null);
  check("short tag rejected", decryptSession([v, iv, "AAAA", ct].join(".")), null);
}

/* ------------------------------- key change ----------------------------- */

{
  const token = encryptSession(session);
  applySecret(SECRET_B);
  check("token from another key is rejected", decryptSession(token), null);
  applySecret(SECRET_A);
  check("original key still reads it", decryptSession(token), session);
}

/* -------------------------- structural validation ----------------------- */

{
  // Even authenticated plaintext must match the expected shape — a token
  // minted by a different/older build shouldn't be cast blindly.
  const bad = [
    { cookies: {}, expiresAt: "nope", issuedAt: 1 },
    { cookies: null, expiresAt: 1, issuedAt: 1 },
    { expiresAt: 1, issuedAt: 1 },
    { cookies: { a: 123 }, expiresAt: 1, issuedAt: 1 }, // non-string cookie value
    "just a string",
    42,
    null,
  ];
  for (const [i, value] of bad.entries()) {
    const token = encryptSession(value as unknown as AcademiaSession);
    check(`malformed payload #${i} rejected on decrypt`, decryptSession(token), null);
  }

  // Empty cookie jar is structurally valid (weird, but not malformed).
  const empty: AcademiaSession = { cookies: {}, expiresAt: 1, issuedAt: 1 };
  check("empty cookie jar round trips", decryptSession(encryptSession(empty)), empty);
}

/* ------------------------------ size budget ----------------------------- */

{
  // Real bundles are ~10 cookies / ~700 bytes of values. Browsers cap a cookie
  // at ~4096 bytes, so prove a realistic payload fits with room to spare.
  const realistic: AcademiaSession = {
    cookies: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`cookie_name_number_${i}`, "v".repeat(70)]),
    ),
    expiresAt: Date.now(),
    issuedAt: Date.now(),
  };
  const size = encryptSession(realistic).length;
  console.log(`     (realistic token size: ${size} bytes)`);
  check("realistic token fits well under the 4096-byte cookie cap", size < 3000, true);
}

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
