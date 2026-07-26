"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { login } from "@/lib/academia/client";
import { saveSession } from "@/lib/academia/session-store";
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

  saveSession(outcome.session);
  revalidatePath("/");
  redirect("/");
}
