import "server-only";
import { cache } from "react";
import { readPortalSession } from "./session-cookie";
import { loadPortal, type PortalResult } from "./load";

export type { PortalResult };

/** Per-request cache: several components on one page share one portal fetch. */
export const getPortal = cache(async (): Promise<PortalResult> => {
  const session = await readPortalSession();
  return session ? loadPortal(session) : { state: "not_connected" };
});
