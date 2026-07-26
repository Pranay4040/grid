"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession } from "@/lib/academia/session-store";

export async function logoutAction() {
  clearSession();
  revalidatePath("/");
  redirect("/login");
}
