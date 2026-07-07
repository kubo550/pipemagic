import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jobsRepository } from "@/lib/context/repositories/jobs";
import { runWorkflow, type WorkflowSink } from "@/lib/workflows/run";
import { deliverToUser } from "@/lib/integrations/delivery";
import { env } from "@/lib/env";
import { log } from "@/lib/observability/logger";

// Time trigger (PRD §5.3): a cheap tick (cron or external scheduler) that claims
// due jobs atomically and runs each through the SAME runWorkflow the chat uses —
// only the sink differs. Guarded by a shared secret. Never holds work open
// synchronously beyond the claimed batch.
export const runtime = "nodejs";

// The run is always recorded in Run history; if the user has a delivery channel
// configured (Slack), the final text is also pushed there (below). The sink
// itself stays a no-op — we deliver from the outcome after the run completes.
function captureSink(): WorkflowSink {
  return { status: () => {}, final: () => {}, error: () => {} };
}

async function tick() {
  if (!env.CRON_SECRET) {
    return { ok: false, status: 503, body: "Cron not configured." };
  }

  const jobs = jobsRepository(prisma);
  const claimed = await jobs.claimDue(5);
  let completed = 0;

  for (const job of claimed) {
    try {
      const outcome = await runWorkflow(job.userId, job.request, {
        sink: captureSink(),
      });
      await jobs.complete(job.id, outcome.runId);
      completed++;

      // Push the result to the user's delivery channel, if configured. A
      // delivery failure must not fail the (successful) run — log and move on.
      if (outcome.status === "completed" && outcome.text.trim()) {
        try {
          const { delivered, channel } = await deliverToUser(job.userId, {
            text: outcome.text,
          });
          if (delivered) log.info("scheduled run delivered", { jobId: job.id, channel });
        } catch (err) {
          log.warn("delivery failed", { jobId: job.id, err: String(err) });
        }
      }
    } catch (err) {
      // Transient CRM/network failures get re-enqueued (now + 60s) up to a cap,
      // then marked permanently errored. Replaces Zapier's wait-and-retry.
      const { retried, attempt } = await jobs.retryLater(job, String(err));
      log.error("scheduled job failed", {
        jobId: job.id,
        err: String(err),
        retried,
        attempt,
      });
    }
  }

  log.info("cron tick", { claimed: claimed.length, completed });
  return { ok: true, status: 200, body: { claimed: claimed.length, completed } };
}

function authorized(req: NextRequest): boolean {
  return (
    !!env.CRON_SECRET && req.headers.get("x-cron-secret") === env.CRON_SECRET
  );
}

export async function POST(req: NextRequest) {
  if (env.CRON_SECRET && !authorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const r = await tick();
  return typeof r.body === "string"
    ? new Response(r.body, { status: r.status })
    : Response.json(r.body, { status: r.status });
}
