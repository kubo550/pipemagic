import { prisma } from "@/lib/db";

/**
 * The user's "about me" profile (PRD Phase 6 seller context, generalized — see
 * the generic-not-sales-only project note). Folded into the agent system prompt
 * so the assistant adapts to whoever the user is.
 */

export async function getAboutMe(userId: string): Promise<string> {
  const row = await prisma.userProfile.findUnique({ where: { userId } });
  return row?.aboutMe ?? "";
}

export async function saveAboutMe(userId: string, aboutMe: string): Promise<void> {
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, aboutMe },
    update: { aboutMe },
  });
}
