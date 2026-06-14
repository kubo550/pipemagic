import type { PrismaClient, Fact } from "@prisma/client";

/**
 * Typed read/write access to the Fact store. Writes go through services like
 * this, never ad-hoc from the agent (PRD §5.2). Every query filters by userId —
 * that's how authorization is enforced (Prisma has no RLS). Facts are generic:
 * anchored optionally to a Meeting and/or a Deal, always to a user.
 */
export function factsRepository(db: PrismaClient) {
  return {
    /** Current (non-superseded) facts for a deal, newest first. */
    async listCurrentForDeal(userId: string, dealId: string): Promise<Fact[]> {
      return db.fact.findMany({
        where: { userId, dealId, supersededById: null },
        orderBy: [{ confidence: "desc" }, { observedAt: "desc" }],
      });
    },

    /** Current facts for a meeting, newest first. */
    async listCurrentForMeeting(userId: string, meetingId: string): Promise<Fact[]> {
      return db.fact.findMany({
        where: { userId, meetingId, supersededById: null },
        orderBy: [{ confidence: "desc" }, { observedAt: "desc" }],
      });
    },

    /** Most recent current facts for a user across everything. */
    async listRecentForUser(userId: string, limit = 50): Promise<Fact[]> {
      return db.fact.findMany({
        where: { userId, supersededById: null },
        orderBy: { observedAt: "desc" },
        take: limit,
      });
    },

    /** Insert many facts at once (e.g. extracted from one transcript). */
    async addMany(
      facts: Array<{
        userId: string;
        dealId?: string;
        meetingId?: string;
        text: string;
        sourceType: Fact["sourceType"];
        sourceRef?: string;
        confidence?: number;
        observedAt?: Date;
      }>,
    ): Promise<number> {
      if (facts.length === 0) return 0;
      const res = await db.fact.createMany({
        data: facts.map((f) => ({
          userId: f.userId,
          dealId: f.dealId,
          meetingId: f.meetingId,
          text: f.text,
          sourceType: f.sourceType,
          sourceRef: f.sourceRef,
          confidence: f.confidence ?? 1.0,
          observedAt: f.observedAt,
        })),
      });
      return res.count;
    },
  };
}
