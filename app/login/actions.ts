"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { login } from "@/lib/academia/client";
import { writeSession, sessionSecretMissing } from "@/lib/auth/session-cookie";
import type { LoginFailure } from "@/lib/academia/types";

export type LoginState = {
  message: string;
  reason?: LoginFailure;
  /** Consecutive wrong-password attempts, carried across submissions via
   *  useActionState's prevState — resets to 0 on any other outcome. */
  badPasswordStreak: number;
} | null;

/**
 * The password only ever lives as a local variable here, passed straight
 * into login() and never returned, logged, or stored — matching the same
 * invariant lib/academia/client.ts already enforces for the CLI flow.
 */
export async function loginAction(
  prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const prevStreak = prevState?.badPasswordStreak ?? 0;

  // Fail before touching the password: with no SESSION_SECRET we could
  // authenticate against Zoho and then have nowhere safe to put the result.
  // Better to never send the credential at all than to hand it over for
  // a login we already know we can't persist.
  if (sessionSecretMissing()) {
    return {
      message:
        "This deployment isn't configured for sign-in yet (missing SESSION_SECRET). " +
        "Nothing was sent to SRM.",
      reason: "unexpected",
      badPasswordStreak: 0,
    };
  }

  if (!username || !password) {
    return {
      message: "Enter your SRM email or NetID and your password.",
      badPasswordStreak: prevStreak,
    };
  }

  const outcome = await login(username, password);
  if (!outcome.ok) {
    return {
      message: outcome.message,
      reason: outcome.reason,
      badPasswordStreak: outcome.reason === "bad_password" ? prevStreak + 1 : 0,
    };
  }

  // Server Action, so setting the cookie here is legal (a Server Component
  // render would not be — see lib/auth/session-cookie.ts).
  await writeSession(outcome.session);
  revalidatePath("/");
  redirect("/");
}
