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

console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
