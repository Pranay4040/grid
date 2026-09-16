"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { connectPortalAction, type ConnectPortalState } from "@/app/portal/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-accent transition-[filter] hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Checking with the portal…" : "Connect"}
    </button>
  );
}

export function PortalConnectForm() {
  const [state, formAction] = useActionState<ConnectPortalState, FormData>(connectPortalAction, null);
  const id = useId();

  return (
    <form action={formAction} className="grid gap-4">
      <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted">
        <li>
          Sign in to{" "}
          <a
            href="https://sp.srmist.edu.in/srmiststudentportal/"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-dotted underline-offset-2 hover:no-underline"
          >
            the SRM Student Portal
          </a>{" "}
          in this browser.
        </li>
        <li>Press F12, open the <b>Network</b> tab, then open your Attendance page on the portal.</li>
        <li>
          Right-click <code className="text-xs">studentAttendanceDetails.jsp</code> →{" "}
          <b>Copy</b> → <b>Copy as cURL (bash)</b>.
        </li>
        <li>Paste it below.</li>
      </ol>

      <label htmlFor={id} className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Copied cURL command</span>
        <textarea
          id={id}
          name="pasted"
          required
          rows={6}
          spellCheck={false}
          autoComplete="off"
          placeholder="curl 'https://sp.srmist.edu.in/srmiststudentportal/students/report/studentAttendanceDetails.jsp' …"
          className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-[var(--accent)]"
        />
      </label>

      {state?.message ? (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-xs text-faint">
        Grid keeps only the two session cookies from what you paste — never your password,
        which Grid doesn&apos;t see. They&apos;re encrypted into a cookie in your own browser;
        this server keeps no copy. Treat the copied command like a password: don&apos;t share
        or screenshot it.
      </p>
    </form>
  );
}
