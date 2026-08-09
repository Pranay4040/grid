/**
 * The session cookie's name, alone in its own module.
 *
 * `proxy.ts` runs before rendering (and may be deployed to a CDN edge), so it
 * must not import `lib/auth/session-cookie.ts` — that pulls in `server-only`
 * and `next/headers`, neither of which belongs in that environment. Keeping
 * the name here lets the proxy and the session store share one definition
 * without the proxy dragging in the whole server-side module.
 *
 * Renaming this logs every user out (their old cookie is simply ignored).
 * Safe to have changed pre-launch; treat as frozen now.
 */
export const SESSION_COOKIE = "grid_session";
