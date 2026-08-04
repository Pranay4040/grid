"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/app/login/actions";

/** More than 2 wrong-password attempts in a row surfaces a reset hint. */
const RESET_HINT_THRESHOLD = 3;

const fieldClass =
  "rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]";
const labelClass = "grid gap-1 text-sm";
const captionClass = "text-xs font-medium text-muted";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-accent transition-[filter] hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );
  const userId = useId();
  const passId = useId();

  // The streak is carried server-side across submissions via useActionState's
  // prevState (see loginAction) — nothing to derive or track locally here.
  const showResetHint = (state?.badPasswordStreak ?? 0) >= RESET_HINT_THRESHOLD;

  return (
    <form action={formAction} className="grid gap-4">
      <label htmlFor={userId} className={labelClass}>
        <span className={captionClass}>SRM email or NetID</span>
        <input
          id={userId}
          name="username"
          autoComplete="username"
          autoFocus
          required
          placeholder="pp7136 or pp7136@srmist.edu.in"
          className={fieldClass}
        />
      </label>

      <label htmlFor={passId} className={labelClass}>
        <span className={captionClass}>Password</span>
        <input
          id={passId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClass}
        />
      </label>

      {state?.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}

      {showResetHint ? (
        <p className="text-sm text-muted">
          Still not working?{" "}
          <a
            href="https://academia.srmist.edu.in/"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-dotted underline-offset-2 hover:no-underline"
          >
            Reset your password on the official SRM Academia portal
          </a>{" "}
          — we don&apos;t handle password resets ourselves.
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-xs text-faint">
        Your password is sent straight to SRM Academia and never stored — only
        the resulting session cookie is saved, locally, on this machine.
      </p>
    </form>
  );
}
