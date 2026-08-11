/**
 * Regression check for classifyError(): a wrong password must classify as
 * bad_password with a friendly message, not fall through to "unexpected"
 * with a raw JSON dump. The real signin.ac response for a bad password is
 * `{"t":"json","error":{"msg":"Invalid Email Address or Password"}}` —
 * singular `error.msg`, which the classifier used to miss entirely (it only
 * checked the plural `errors[]` array, `message`, and `localized_message`),
 * so this fell through and surfaced as:
 *   "Unrecognised signin.ac response: {"t":"json","error":{"msg":"Invalid Email Address or Password"}}"
 * to the user instead of "Incorrect NetID or password."
 */
import { classifyError, type ZohoEnvelope } from "../lib/academia/client";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) {
    failures++;
    console.log(`  expected: ${expected}, actual: ${actual}`);
  }
}

// The exact real-world response that triggered this bug.
const realBadPassword: ZohoEnvelope = {
  t: "json",
  error: { msg: "Invalid Email Address or Password" },
};

const result = classifyError(realBadPassword);
check("real bad-password response classifies as bad_password", result.reason, "bad_password");
check("message is the friendly one, not a raw dump", result.message, "Incorrect NetID or password.");

// The previously-supported shapes must keep working too.
check(
  "plural errors[] array still works",
  classifyError({ errors: [{ message: "Incorrect password" }] }).reason,
  "bad_password",
);
check(
  "captcha via singular error.msg is detected",
  classifyError({ error: { msg: "captcha verification required" } }).reason,
  "captcha_required",
);
check(
  "unrecognised shape still falls through safely",
  classifyError({ message: "some future Zoho response we don't model" }).reason,
  "unexpected",
);

/* ---------------------------------------------------------------------------
 * The other half of "my correct password keeps getting rejected": the
 * classifier used to match the BARE words "password" / "invalid" / "incorrect",
 * so anything mentioning them became "Incorrect NetID or password." — including
 * states where the password was right, and handshake faults that had nothing to
 * do with credentials at all. Each of these must now say what really happened.
 * ------------------------------------------------------------------------- */

check(
  "an expired password is not reported as a wrong one",
  classifyError({ message: "Your password has expired" }).reason,
  "password_expired",
);
check(
  "a forced password change is not reported as a wrong password",
  classifyError({ error: { msg: "You must change your password to continue" } }).reason,
  "password_expired",
);
check(
  "a locked account says so instead of blaming the password",
  classifyError({ message: "Your account has been locked" }).reason,
  "account_locked",
);
check(
  "a disabled account says so too",
  classifyError({ message: "This account is disabled" }).reason,
  "account_locked",
);
check(
  "an unknown user is not reported as a wrong password",
  classifyError({ message: "This user does not exist" }).reason,
  "unknown_user",
);

// Handshake faults: real breakage that must stay visible, not be disguised.
check(
  "an invalid CSRF token is NOT a wrong password",
  classifyError({ message: "Invalid CSRF token" }).reason,
  "unexpected",
);
check(
  "an invalid request is NOT a wrong password",
  classifyError({ message: "Invalid request" }).reason,
  "unexpected",
);
check(
  "an internal server error is NOT a wrong password",
  classifyError({ errors: [{ code: "INTERNAL_SERVER_ERROR", message: "Internal error" }] }).reason,
  "unexpected",
);
check(
  "the invalid-CSRF message survives to the user verbatim",
  classifyError({ message: "Invalid CSRF token" }).message,
  "Invalid CSRF token",
);

// …while genuine credential rejections keep working.
check(
  "invalid username or password still classifies",
  classifyError({ message: "Invalid username or password" }).reason,
  "bad_password",
);
check(
  "invalid credentials still classifies",
  classifyError({ error: { msg: "Invalid credentials supplied" } }).reason,
  "bad_password",
);

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
