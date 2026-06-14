"use server";

import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth/session";
import { factsRepository } from "@/lib/context/repositories/facts";

/**
 * Approval-gated write: persist transcript-extracted facts into the store.
 * Creates a generic Meeting to anchor them (no deal required) and saves the
 * facts with sourceType="transcript". Nothing is written until the user clicks.
 */
export async function saveMeetingFactsAction(
  facts: Array<{ text: string; confidence: number }>,
  title: string,
): Promise<{ saved: number }> {
  const userId = await getCurrentUserId();
  if (!userId || facts.length === 0) return { saved: 0 };

  const meeting = await prisma.meeting.create({
    data: { userId, title: title.slice(0, 200) || "Untitled meeting" },
  });

  const saved = await factsRepository(prisma).addMany(
    facts.map((f) => ({
      userId,
      meetingId: meeting.id,
      text: f.text,
      sourceType: "transcript" as const,
      sourceRef: `meeting:${meeting.id}`,
      confidence: f.confidence,
    })),
  );

  return { saved };
}
