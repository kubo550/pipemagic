import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/llm";
import { CostTracker, pricingFor } from "@/lib/agent/cost";
import { runAgentLoop, type RunResult } from "@/lib/agent/loop";
import { calendarTools } from "@/lib/agent/tools/calendar";
import type { RunContext } from "@/lib/agent/tools/types";
import { log } from "@/lib/observability/logger";

/**
 * The single, UI-independent entry into the engine (PRD §5.1). Chat calls it
 * now; the scheduler/worker will call the same function later — they differ
 * only in their sink. It assembles a RunContext, picks the env-configured
 * provider, and drives the agent loop over the available tools.
 */

export interface WorkflowSink {
  status(message: string): void;
  final(text: string): void;
  error(message: string): void;
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are PipeMagic, an AI sales-prep assistant for a B2B salesperson.",
    `Today's date is ${today}.`,
    "",
    "You help the rep get ready for meetings. Use the calendar tools to find the",
    "right event and its details. When asked to prepare for a meeting, produce a",
    "short, scannable brief: who/what the meeting is, the company (infer from the",
    "organizer/attendee domain), and 3–5 concrete talking points or questions.",
    "",
    "Ground every factual claim in a source. Cite calendar facts inline like",
    "[calendar: <event title>]. Do not invent details you have not retrieved —",
    "in this phase you only have calendar data, no web research. If you don't",
    "have enough information, say so plainly.",
  ].join("\n");
}

export async function runWorkflow(
  userId: string,
  request: string,
  opts: { sink: WorkflowSink },
): Promise<RunResult> {
  const provider = getProvider();
  const ctx: RunContext = {
    userId,
    db: prisma,
    cost: new CostTracker(pricingFor(provider.model)),
    log,
  };

  log.info("workflow run started", { userId, provider: provider.name });

  const result = await runAgentLoop({
    provider,
    system: systemPrompt(),
    request,
    tools: calendarTools,
    ctx,
    onEvent: (e) => {
      if (e.type === "tool_call") opts.sink.status(`Looking at ${e.name}…`);
    },
  });

  switch (result.status) {
    case "completed":
      opts.sink.final(result.text);
      break;
    case "awaiting_approval":
      opts.sink.status(
        `Waiting for approval to run ${result.pendingApproval?.toolName}.`,
      );
      break;
    case "budget_exceeded":
      opts.sink.error("This request hit its cost budget. Try narrowing it.");
      break;
    case "max_iterations":
      opts.sink.error("This request took too many steps. Try rephrasing it.");
      break;
  }

  log.info("workflow run finished", {
    userId,
    status: result.status,
    iterations: result.iterations,
    usdSpent: ctx.cost.usdSpent,
  });

  return result;
}
