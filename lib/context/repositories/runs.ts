import type { PrismaClient, Run } from "@prisma/client";

/** History of agent runs. Filtered by userId for authorization. */
export function runsRepository(db: PrismaClient) {
  return {
    async create(input: {
      userId: string;
      request: string;
      provider: string;
      model: string;
    }): Promise<Run> {
      return db.run.create({
        data: { ...input, status: "running" },
      });
    },

    async finish(
      id: string,
      input: {
        status: string;
        iterations: number;
        costUsd: number;
        resultText: string;
      },
    ): Promise<void> {
      await db.run.update({ where: { id }, data: input });
    },

    async listForUser(userId: string, limit = 50): Promise<Run[]> {
      return db.run.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    },
  };
}
