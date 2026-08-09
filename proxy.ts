/**
 * Sends genuinely-new visitors to the landing page instead of a bare
 * "Not connected" panel.
 *
 * WHY HERE AND NOT IN THE PAGE: `app/(app)/page.tsx` can call redirect(), but
 * the `(app)` layout renders the header first, so streaming has already begun
 * by the time the page runs. Next then can't issue an HTTP redirect and falls
 * back to client-side rendering ("Switched to client rendering because the
 * server rendering errored: NEXT_REDIRECT") — the visitor sees a flash of
 * empty app shell before jumping to /welcome. Running before render makes it
 * a clean 307 with nothing painted, and skips a pointless Academia fetch for
 * someone who isn't signed in.
 *
 * (In Next 16 this file convention is `proxy`, not `middleware` — the latter
 * is deprecated and renamed.)
 *
 * Cookie PRESENCE only — no decryption. That's deliberate:
 *   - no cookie at all      -> never used Grid  -> /welcome, the pitch
 *   - cookie that won't decrypt (tampered, or SESSION_SECRET rotated)
 *                           -> returning user   -> falls through to
 *                              "Not connected", which links to /login
 *   - cookie Academia rejects -> "Session expired", also a reconnect prompt
 * Throwing marketing at someone trying to get back in would be worse than the
 * panel they'd otherwise see, so only the first case is redirected.
 *
 * Deciding on presence also keeps this edge-safe: no crypto, no secrets, no
 * imports beyond a string constant.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie-name";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/welcome", request.url));
}

export const config = {
  // Only the root. A bookmarked /attendance means the visitor already knows
  // what Grid is, so those pages keep their "Connect your account" state.
  matcher: "/",
};
