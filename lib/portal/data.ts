import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { PORTAL_COOKIE } from "../auth/cookie-name";
import { sessionSecretMissing } from "../auth/session-crypto";
import { decodeSnapshot, type PortalSnapshot } from "./snapshot";

export type PortalResult = ({ state: "ok" } & PortalSnapshot) | { state: "not_connected" };

/** The last snapshot "Send to Grid" stored, if any. No network — the data was
 *  read in the student's own portal tab (see lib/portal/bookmarklet.ts). */
export const getPortal = cache(async (): Promise<PortalResult> => {
  if (sessionSecretMissing()) return { state: "not_connected" };
  const snapshot = decodeSnapshot((await cookies()).get(PORTAL_COOKIE)?.value);
  return snapshot ? { state: "ok", ...snapshot } : { state: "not_connected" };
});
