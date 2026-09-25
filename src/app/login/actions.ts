"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, createSessionCookieValue, verifySharedPassword } from "@/lib/auth/session";

export interface LoginActionState {
  error: string | null;
}

export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/audits");

  if (!password || !verifySharedPassword(password)) {
    return { error: "Incorrect password." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await createSessionCookieValue(), SESSION_COOKIE_OPTIONS);

  redirect(next.startsWith("/") ? next : "/audits");
}
