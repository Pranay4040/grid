/**
 * Per-IP rate limiting for the login form.
 *
 * WHY: `/login` is public, and every submission is forwarded to Zoho. Without
 * a limit, two things go wrong. First, someone can brute-force SRM accounts
 * *through us*. Second — and more immediately damaging — the attempts all
 * originate from Vercel's IPs, so hammering our form is enough to get the
 * whole deployment throttled or CAPTCHA'd by Zoho, breaking sign-in for every
 * legitimate user. The limiter protects the service's ability to function at
 * all, not just other people's accounts.
 *
 * WHY UPSTASH AND NOT MEMORY: on serverless, an in-process counter is per
 * lambda instance. Concurrent requests land on different instances, each with
 * its own count, so the real ceiling is (limit x warm instances) — a number
 * you can neither predict nor control. That's weak in exactly the scenario
 * you'd want it for, and worse than nothing because it feels like protection.
 * Upstash's REST API is used directly over fetch, so this costs no dependency.
 *
 * FAIL OPEN, DELIBERATELY: if Upstash is unconfigured or unreachable, logins
 * are allowed through. A rate limiter should not be able to take the whole app
 * down when a third-party service has a bad day. The tradeoff is that an
 * Upstash outage leaves the form temporarily unprotected.
 *
 * Counts EVERY attempt, not just failures, because every attempt is a request
 * we make to Zoho — which is the resource actually being conserved.
 */

/** Attempts allowed per IP per window. Generous for real use (a student
 *  mistyping a password a few times is nowhere near this) but low enough to
 *  make automated guessing pointless. */
export const LOGIN_LIMIT = 10;

/** Window length. Fixed window, not sliding — simpler, and the imprecision at
 *  window boundaries (worst case ~2x the limit across a boundary) doesn't
 *  matter at this threshold. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the current window rolls over. Only meaningful when blocked. */
  retryAfterSec: number;
  /** Attempts left in this window. -1 when the limiter is inactive. */
  remaining: number;
  /** True when Upstash isn't configured or errored — i.e. we let this through
   *  without actually checking. Surfaced so callers can log/monitor it rather
   *  than silently believing they're protected. */
  degraded: boolean;
};

/* ------------------------- pure, testable helpers ------------------------- */

/** Start of the fixed window containing `now`. */
export function windowStart(now: number, windowMs = LOGIN_WINDOW_MS): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Redis key for an IP's counter in the current window. The window start is
 * baked into the key, so each window gets a fresh counter and a plain TTL is
 * enough for cleanup — no need for EXPIRE NX or any Redis 7-only behaviour.
 */
export function rateLimitKey(ip: string, now: number, windowMs = LOGIN_WINDOW_MS): string {
  return `rl:login:${ip}:${windowStart(now, windowMs)}`;
}

/** Seconds remaining in the current window, rounded up (never 0 while inside it). */
export function secondsUntilWindowEnd(
  now: number,
  windowMs = LOGIN_WINDOW_MS,
): number {
  return Math.max(1, Math.ceil((windowStart(now, windowMs) + windowMs - now) / 1000));
}

/** Decide from a post-increment count. `count` is the value AFTER this
 *  attempt, so the first request in a window arrives here as 1. */
export function evaluate(
  count: number,
  now: number,
  limit = LOGIN_LIMIT,
  windowMs = LOGIN_WINDOW_MS,
): RateLimitVerdict {
  const allowed = count <= limit;
  return {
    allowed,
    retryAfterSec: allowed ? 0 : secondsUntilWindowEnd(now, windowMs),
    remaining: Math.max(0, limit - count),
    degraded: false,
  };
}

/**
 * Pulls the client IP from proxy headers. Vercel sets x-forwarded-for; the
 * left-most entry is the original client (later entries are proxies).
 *
 * Returns null when absent. Callers must treat that as "don't limit" rather
 * than bucketing every unknown caller together — a shared "unknown" bucket
 * would let one script lock out every real user whose IP we also failed to
 * read, turning the limiter into the denial-of-service.
 */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

const ALLOWED: RateLimitVerdict = {
  allowed: true,
  retryAfterSec: 0,
  remaining: -1,
  degraded: true,
};

/* ------------------------------ Upstash I/O ------------------------------ */

export function rateLimitConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/**
 * Increments this IP's counter and reports whether the attempt is allowed.
 * Never throws — any failure resolves to an allowed+degraded verdict.
 */
export async function checkLoginRateLimit(
  ip: string | null,
  now = Date.now(),
): Promise<RateLimitVerdict> {
  if (!ip) return ALLOWED; // see clientIpFrom()
  if (!rateLimitConfigured()) return ALLOWED;

  const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const key = rateLimitKey(ip, now);
  const ttlSec = Math.ceil(LOGIN_WINDOW_MS / 1000);

  try {
    // One round trip: bump the counter and (re)set its TTL. Because the key is
    // window-specific, refreshing the TTL on every hit is harmless — it only
    // delays cleanup of a key that's already logically dead.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSec)],
      ]),
      cache: "no-store",
      // Don't let a hanging dependency stall the login request.
      signal: AbortSignal.timeout(2000),
    });

    if (!res.ok) return ALLOWED;

    const body: unknown = await res.json();
    if (!Array.isArray(body)) return ALLOWED;
    const count = (body[0] as { result?: unknown })?.result;
    if (typeof count !== "number") return ALLOWED;

    return evaluate(count, now);
  } catch {
    // Network error, timeout, malformed response — fail open.
    return ALLOWED;
  }
}
