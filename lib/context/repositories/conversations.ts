import type { PrismaClient, Conversation } from "@prisma/client";

/**
 * Saved chat threads. Every method filters by userId for authorization (Prisma
 * + Supabase RLS don't compose — auth is enforced in code, PRD §6).
 */
export function conversationsRepository(db: PrismaClient) {
  return {
    /**
     * Resolve the conversation for a turn: reuse the caller's if it's theirs,
     * else create a fresh one titled from the first message.
     */
    async ensure(
      userId: string,
      conversationId: string | null,
      firstMessage: string,
    ): Promise<{ id: string; title: string; created: boolean }> {
      if (conversationId) {
        const existing = await db.conversation.findFirst({
          where: { id: conversationId, userId },
          select: { id: true, title: true },
        });
        if (existing) return { ...existing, created: false };
      }
      const title = firstMessage.trim().slice(0, 60) || "New chat";
      const created = await db.conversation.create({ data: { userId, title } });
      return { id: created.id, title: created.title, created: true };
    },

    /** Append one turn and bump the conversation's updatedAt (recency order). */
    async appendMessage(
      conversationId: string,
      role: "user" | "assistant",
      text: string,
    ): Promise<void> {
      await db.$transaction([
        db.message.create({ data: { conversationId, role, text } }),
        db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
      ]);
    },

    async listRecent(
      userId: string,
      limit = 30,
    ): Promise<Pick<Conversation, "id" | "title" | "updatedAt">[]> {
      return db.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: { id: true, title: true, updatedAt: true },
      });
    },

    /** A conversation with its messages in order, or null if not the user's. */
    async getWithMessages(
      userId: string,
      id: string,
    ): Promise<{
      id: string;
      title: string;
      messages: { role: string; text: string }[];
    } | null> {
      return db.conversation.findFirst({
        where: { id, userId },
        select: {
          id: true,
          title: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: { role: true, text: true },
          },
        },
      });
    },
  };
}
