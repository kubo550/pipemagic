import type { PrismaClient, ScheduledJob } from "@prisma/client";

/**
 * Scheduled-job queue (PRD §5.3/§8). The claim is atomic — `FOR UPDATE SKIP
 * LOCKED` + `RETURNING` means two concurrent ticks never grab the same job, so
 * a job fires exactly once. `dedupeKey` (unique) makes enqueue idempotent: the
 * same trigger inserting twice is a no-op, not a duplicate.
 */

const RETRY_SUFFIX = /#r(\d+)$/;

/** Which retry attempt a job is on (0 = original), parsed from its dedupeKey. */
export function retryAttempt(dedupeKey: string): number {
  const m = dedupeKey.match(RETRY_SUFFIX);
  return m ? Number(m[1]) : 0;
}

/** The dedupeKey for the next retry of a job (encodes the attempt, no schema column). */
export function nextRetryKey(dedupeKey: string): string {
  const base = dedupeKey.replace(RETRY_SUFFIX, "");
  return `${base}#r${retryAttempt(dedupeKey) + 1}`;
}
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

    /**
     * A failed job: re-enqueue it after a delay (replaces Zapier's wait-and-
     * retry for transient CRM/network failures) until the attempt cap, then mark
     * it permanently errored. The current row is marked "retried"; a fresh job
     * carries the incremented attempt in its dedupeKey.
     */
    async retryLater(
      job: ScheduledJob,
      error: string,
      { delaySeconds = 60, maxAttempts = 3 }: { delaySeconds?: number; maxAttempts?: number } = {},
    ): Promise<{ retried: boolean; attempt: number }> {
      const attempt = retryAttempt(job.dedupeKey);
      if (attempt >= maxAttempts) {
        await this.fail(job.id, `${error} (gave up after ${attempt} retries)`);
        return { retried: false, attempt };
      }
      await this.enqueue({
        userId: job.userId,
        dedupeKey: nextRetryKey(job.dedupeKey),
        runAt: new Date(Date.now() + delaySeconds * 1000),
        request: job.request,
        sourceRef: job.sourceRef ?? undefined,
      });
      await db.scheduledJob.update({
        where: { id: job.id },
        data: { status: "retried", error: `retrying (attempt ${attempt + 1}): ${error}`.slice(0, 500) },
      });
      return { retried: true, attempt: attempt + 1 };
    },
  };
}
