import { NextResponse, type NextRequest } from "next/server";
import { PORTAL_COOKIE } from "@/lib/auth/cookie-name";
import { sessionSecretMissing } from "@/lib/auth/session-crypto";
import { PORTAL_ORIGIN } from "@/lib/portal/bookmarklet";
import { buildPortalSnapshot, encodeSnapshot } from "@/lib/portal/snapshot";

/** Real pages total ~25 KB; anything far past this isn't the bookmarklet. */
const MAX_BYTES = 2_000_000;
const SNAPSHOT_MAX_AGE_SEC = 60 * 60 * 24 * 60;

/**
 * Receives the "Send to Grid" bookmarklet's form POST (lib/portal/bookmarklet.ts),
 * parses it, and stores the snapshot in the caller's own encrypted cookie.
 *
 * Origin must be the portal: browsers set it on form POSTs and a page can't
 * forge it, so another site can't push fake attendance into someone's Grid.
 * 303 (not redirect()'s 307) so the browser follows with a GET.
 */
export async function POST(request: NextRequest) {
  const back = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  if (request.headers.get("origin") !== PORTAL_ORIGIN) return back("/portal?import=rejected");
  if (sessionSecretMissing()) return back("/portal?import=misconfigured");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return back("/portal?import=error");

  let details: Record<string, string> = {};
  let form: FormData;
  try {
    form = await request.formData();
    const parsed: unknown = JSON.parse(String(form.get("details") ?? "{}"));
    if (parsed && typeof parsed === "object") {
      details = Object.fromEntries(
        Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
      );
    }
  } catch {
    return back("/portal?import=error");
  }

  const result = buildPortalSnapshot({
    attendance: String(form.get("attendance") ?? ""),
    marks: String(form.get("marks") ?? ""),
    details,
  });
  if (result.state !== "ok") return back(`/portal?import=${result.state}`);

  const response = back("/attendance");
  response.cookies.set(PORTAL_COOKIE, encodeSnapshot(result.snapshot), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax: the cookie is SET on this cross-site POST's response (allowed) and
    // sent on the same-site GET that follows.
    sameSite: "lax",
    path: "/",
    maxAge: SNAPSHOT_MAX_AGE_SEC,
  });
  return response;
}
