"use server";

import { getCurrentUserId } from "@/lib/auth/session";
import { saveAboutMe } from "@/lib/context/repositories/profile";

/**
 * Server action: persist the user's "about me". Auth is re-checked here — never
 * trust the client for the userId.
 */
export async function saveAboutMeAction(
  _prev: { ok: boolean } | null,
  formData: FormData,
): Promise<{ ok: boolean }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false };

  const aboutMe = String(formData.get("aboutMe") ?? "").slice(0, 8000);
  await saveAboutMe(userId, aboutMe);
  return { ok: true };
}
