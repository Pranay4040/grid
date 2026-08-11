/** Zoho service identifiers scraped from the signin iframe (not hardcoded). */
export type ServiceConfig = {
  /** e.g. "10002227248" */
  clientId: string;
  /** e.g. "40" */
  orgtype: string;
  /** "<orgtype>-<clientId>", the id the lookup/password routes expect. */
  lookupId: string;
  /** The Creator app prefix, e.g. "49910842". */
  appPrefix: string;
  /** Absolute URL of the signin iframe. */
  frameUrl: string;
};

/** Outcome of the account-lookup step (username only, pre-password). */
export type LookupResult = {
  /** Opaque per-attempt identifier the password step is posted against. */
  identifier: string;
  /** Auth modes Zoho reports for this account, e.g. ["PASSWORD"]. */
  modes: string[];
  /** Digest echoed back into the password payload when present. */
  digest?: string;
};

/** A completed, replayable session — the only thing we persist per user. */
export type AcademiaSession = {
  /** Cookie name→value bundle scoped to academia.srmist.edu.in. */
  cookies: Record<string, string>;
  /**
   * Soft, self-extending deadline: pushed forward on every successful data
   * fetch (see extendSession() in client.ts), so a session that's actually
   * still being used doesn't get thrown away on our own guess. Real
   * invalidity is detected from the fetch itself, not this clock.
   */
  expiresAt: number;
  /** When this session was first established via password login — never
   *  extended. Backstops the sliding window with a hard outer lifetime so a
   *  forgotten session can't stay valid forever just by being opened. */
  issuedAt: number;
};

/** Discriminated result so callers branch on failure without try/catch soup. */
export type LoginOutcome =
  | { ok: true; session: AcademiaSession }
  | { ok: false; reason: LoginFailure; message: string };

export type LoginFailure =
  | "unknown_user" // account lookup rejected the identifier
  | "bad_password" // credentials rejected
  | "password_expired" // password is CORRECT but Zoho wants it changed first
  | "account_locked" // locked/disabled/suspended upstream
  | "captcha_required" // Zoho demanded a challenge we can't solve headless
  | "mfa_required" // second factor enabled on the account
  | "rate_limited" // too many attempts
  | "portal_unavailable" // upstream down / unexpected shape
  | "unexpected"; // anything we didn't model
