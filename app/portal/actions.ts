"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { extractPortalCookies, hasRequiredCookies } from "@/lib/portal/client";
import { loadPortal } from "@/lib/portal/load";
import { clearPortalSession, writePortalSession } from "@/lib/portal/session-cookie";
import { sessionSecretMissing } from "@/lib/auth/session-crypto";

export type ConnectPortalState = { message: string } | null;

/**
 * Takes whatever the user pasted, keeps only JSESSIONID + the F5 TS cookie,
 * and saves them ONLY after a live fetch proves the portal accepts them — so a
 * stale or wrong paste is reported here rather than as a broken page later.
 * No password is involved: the user signed in (captcha and all) on the real
 * portal themselves.
 */
export async function connectPortalAction(
  _prev: ConnectPortalState,
  formData: FormData,
): Promise<ConnectPortalState> {
  if (sessionSecretMissing()) {
    return { message: "This deployment is missing SESSION_SECRET, so the session can't be stored safely." };
  }

  const cookies = extractPortalCookies(String(formData.get("pasted") ?? ""));
  if (!hasRequiredCookies({ cookies })) {
    return {
      message:
        "Couldn't find both portal session cookies (JSESSIONID and a TS… cookie) in what you pasted. " +
        "Copy the request again with Copy → Copy as cURL (bash) and paste the whole thing.",
    };
  }

  const result = await loadPortal({ cookies });
  if (result.state === "expired") {
    return {
      message:
        "The Student Portal rejected that session — it has probably expired. " +
        "Refresh the portal in your browser (sign in again if asked), copy a fresh cURL, and paste that.",
    };
  }
  if (result.state !== "ok") {
    return { message: result.state === "error" ? result.message : "Couldn't connect." };
  }

  await writePortalSession({ cookies });
  revalidatePath("/", "layout");
  redirect("/attendance");
}

export async function disconnectPortalAction() {
  await clearPortalSession();
  revalidatePath("/", "layout");
  redirect("/portal");
}
