import type { PrismaClient, Fact } from "@prisma/client";

/**
 * Typed read/write access to the Fact store. Writes go through services like
 * this, never ad-hoc from the agent (PRD §5.2). Every query filters by userId —
 * that's how authorization is enforced (Prisma has no RLS).
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

    async add(input: {
      userId: string;
      dealId: string;
      text: string;
      sourceType: Fact["sourceType"];
      sourceRef?: string;
      confidence?: number;
      observedAt?: Date;
    }): Promise<Fact> {
      return db.fact.create({
        data: {
          userId: input.userId,
          dealId: input.dealId,
          text: input.text,
          sourceType: input.sourceType,
          sourceRef: input.sourceRef,
          confidence: input.confidence ?? 1.0,
          observedAt: input.observedAt,
        },
      });
    },
  };
}
