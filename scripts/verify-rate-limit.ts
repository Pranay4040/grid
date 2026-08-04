/**
 * Checks the login rate limiter's pure logic — window maths, key derivation,
 * the allow/block decision, and client-IP extraction. The Upstash round trip
 * itself isn't covered here (it needs network); what matters is that the
 * decision layer is right and that every degraded path fails OPEN.
 *
 *   npx tsx scripts/verify-rate-limit.ts
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
  checkLoginRateLimit,
  clientIpFrom,
  evaluate,
  rateLimitConfigured,
  rateLimitKey,
  secondsUntilWindowEnd,
  windowStart,
} from "../lib/auth/rate-limit";

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

const W = LOGIN_WINDOW_MS;

/* ------------------------------ window maths ----------------------------- */

check("window start floors to the window", windowStart(W * 3 + 1234), W * 3);
check("exact boundary is its own window start", windowStart(W * 3), W * 3);
check("t=0 is window 0", windowStart(0), 0);
check(
  "one ms before a boundary is the previous window",
  windowStart(W * 4 - 1),
  W * 3,
);

check("full window remaining at the start", secondsUntilWindowEnd(W * 3), W / 1000);
check("never reports 0 while inside the window", secondsUntilWindowEnd(W * 4 - 1), 1);

/* ------------------------------- key shape ------------------------------- */

{
  const a = rateLimitKey("1.2.3.4", W * 3 + 10);
  const b = rateLimitKey("1.2.3.4", W * 3 + 9999);
  const c = rateLimitKey("1.2.3.4", W * 4 + 10);
  const d = rateLimitKey("5.6.7.8", W * 3 + 10);

  check("same IP+window -> same key", a === b, true);
  check("next window -> different key", a === c, false);
  check("different IP -> different key", a === d, false);
  check("key embeds the window start", a.endsWith(String(W * 3)), true);
  check("key is namespaced", a.startsWith("rl:login:"), true);
}

/* ---------------------------- allow / block ------------------------------ */

{
  const now = W * 3;
  check("first attempt allowed", evaluate(1, now).allowed, true);
  check("attempt at the limit still allowed", evaluate(LOGIN_LIMIT, now).allowed, true);
  check("one past the limit blocked", evaluate(LOGIN_LIMIT + 1, now).allowed, false);
  check("far past the limit blocked", evaluate(LOGIN_LIMIT + 500, now).allowed, false);

  check("remaining counts down", evaluate(1, now).remaining, LOGIN_LIMIT - 1);
  check("remaining is 0 at the limit", evaluate(LOGIN_LIMIT, now).remaining, 0);
  check("remaining never goes negative", evaluate(LOGIN_LIMIT + 9, now).remaining, 0);

  check("no retry hint while allowed", evaluate(1, now).retryAfterSec, 0);
  check(
    "retry hint set when blocked",
    evaluate(LOGIN_LIMIT + 1, now).retryAfterSec,
    W / 1000,
  );
  check("a real decision is not degraded", evaluate(1, now).degraded, false);
}

/* ------------------------------ client IP -------------------------------- */

const h = (init: Record<string, string>) => new Headers(init);

check(
  "takes the left-most x-forwarded-for entry",
  clientIpFrom(h({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" })),
  "203.0.113.9",
);
check(
  "trims whitespace",
  clientIpFrom(h({ "x-forwarded-for": "  203.0.113.9  " })),
  "203.0.113.9",
);
check("single entry works", clientIpFrom(h({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
check("falls back to x-real-ip", clientIpFrom(h({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
check(
  "x-forwarded-for wins over x-real-ip",
  clientIpFrom(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.7" })),
  "203.0.113.9",
);
check("no headers -> null", clientIpFrom(h({})), null);
check("empty x-forwarded-for -> null", clientIpFrom(h({ "x-forwarded-for": "" })), null);

/* ------------------------- fail-open guarantees --------------------------- */

async function main() {
  const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
  const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  check("unconfigured is reported", rateLimitConfigured(), false);

  const noIp = await checkLoginRateLimit(null);
  check("null IP is allowed through", noIp.allowed, true);
  check("null IP is flagged degraded", noIp.degraded, true);

  const unconfigured = await checkLoginRateLimit("1.2.3.4");
  check("unconfigured allows the attempt", unconfigured.allowed, true);
  check("unconfigured is flagged degraded", unconfigured.degraded, true);

  // Point at an unroutable address so the fetch fails fast, proving a broken
  // Upstash can never block a login.
  process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:1";
  process.env.UPSTASH_REDIS_REST_TOKEN = "dummy";
  check("configured is reported", rateLimitConfigured(), true);
  const unreachable = await checkLoginRateLimit("1.2.3.4");
  check("unreachable Upstash allows the attempt", unreachable.allowed, true);
  check("unreachable Upstash is flagged degraded", unreachable.degraded, true);

  /* --------- end-to-end against a fake Upstash (the blocking path) --------
     Everything above proves we fail open. This proves we actually CLOSE:
     without it, the HTTP/JSON parsing that turns a pipeline response into a
     count is untested, and a limiter that silently never blocks is worse than
     none. Binds port 0 (OS-assigned) so it can't collide with anything. */
  const counters = new Map<string, number>();
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const cmds = JSON.parse(body) as string[][];
      const out = cmds.map(([cmd, key]) => {
        if (cmd === "INCR") {
          const n = (counters.get(key) ?? 0) + 1;
          counters.set(key, n);
          return { result: n };
        }
        return { result: 1 }; // EXPIRE
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  const now = W * 100; // pin the window so all attempts share one key
  const verdicts = [];
  for (let i = 0; i < LOGIN_LIMIT + 3; i++) {
    verdicts.push(await checkLoginRateLimit("9.9.9.9", now));
  }

  check(
    `first ${LOGIN_LIMIT} attempts allowed`,
    verdicts.slice(0, LOGIN_LIMIT).every((v) => v.allowed),
    true,
  );
  check(
    "attempts past the limit are blocked",
    verdicts.slice(LOGIN_LIMIT).every((v) => !v.allowed),
    true,
  );
  check("a real verdict is not degraded", verdicts[0].degraded, false);
  check("remaining counts down from the limit", verdicts[0].remaining, LOGIN_LIMIT - 1);
  check("blocked verdict carries a retry hint", verdicts[LOGIN_LIMIT].retryAfterSec > 0, true);

  // A different IP must have its own budget — otherwise one abuser locks out
  // everyone, which is the failure mode this whole design avoids.
  const other = await checkLoginRateLimit("8.8.8.8", now);
  check("a different IP is unaffected", other.allowed, true);
  check("different IP starts with a fresh budget", other.remaining, LOGIN_LIMIT - 1);

  // Rolling into the next window resets the blocked IP.
  const nextWindow = await checkLoginRateLimit("9.9.9.9", now + W);
  check("next window resets the counter", nextWindow.allowed, true);

  await new Promise<void>((r) => server.close(() => r()));

  if (savedUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = savedUrl;
  if (savedToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;

  console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
  // Set the code and let the loop drain rather than process.exit(): the
  // fail-open tests leave AbortSignal.timeout handles armed, and tearing the
  // process down mid-close trips a libuv assertion on Windows (exit 127 even
  // when every check passed). Node exits on its own once those timers fire.
  process.exitCode = failures ? 1 : 0;
}

main();
