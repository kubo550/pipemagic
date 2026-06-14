import type { PrismaClient, ScheduledJob } from "@prisma/client";

/**
 * Scheduled-job queue (PRD §5.3/§8). The claim is atomic — `FOR UPDATE SKIP
 * LOCKED` + `RETURNING` means two concurrent ticks never grab the same job, so
 * a job fires exactly once. `dedupeKey` (unique) makes enqueue idempotent: the
 * same trigger inserting twice is a no-op, not a duplicate.
 */
export function jobsRepository(db: PrismaClient) {
  return {
    /** Idempotent enqueue: returns the existing job if the dedupeKey is taken. */
    async enqueue(input: {
      userId: string;
      dedupeKey: string;
      runAt: Date;
      request: string;
      sourceRef?: string;
    }): Promise<{ job: ScheduledJob; created: boolean }> {
      const existing = await db.scheduledJob.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      if (existing) return { job: existing, created: false };
      const job = await db.scheduledJob.create({ data: input });
      return { job, created: true };
    },

    /**
     * Atomically claim up to `limit` due jobs. The single UPDATE…RETURNING with
     * SKIP LOCKED is the concurrency-safe core — no two workers claim the same row.
     */
    async claimDue(limit = 5): Promise<ScheduledJob[]> {
      return db.$queryRaw<ScheduledJob[]>`
        UPDATE "ScheduledJob"
        SET status = 'claimed', "claimedAt" = now(), "updatedAt" = now()
        WHERE id IN (
          SELECT id FROM "ScheduledJob"
          WHERE status = 'pending' AND "runAt" <= now()
          ORDER BY "runAt"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *`;
    },

    async complete(id: string, resultRunId: string): Promise<void> {
      await db.scheduledJob.update({
        where: { id },
        data: { status: "done", resultRunId },
      });
    },

    async fail(id: string, error: string): Promise<void> {
      await db.scheduledJob.update({
        where: { id },
        data: { status: "error", error: error.slice(0, 500) },
      });
    },
  };
}
