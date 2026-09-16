"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PORTAL_COOKIE } from "@/lib/auth/cookie-name";

export async function disconnectPortalAction() {
  (await cookies()).delete(PORTAL_COOKIE);
  revalidatePath("/", "layout");
  redirect("/portal");
}
