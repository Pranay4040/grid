"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession } from "@/lib/auth/session-cookie";

export async function logoutAction() {
  // Drops the encrypted cookie. Since the server keeps no copy of the session,
  // deleting the user's cookie IS the logout — there's no server-side record
  // left behind to revoke.
  await clearSession();
  revalidatePath("/");
  redirect("/login");
}
