import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/llm";
import { CostTracker, pricingFor } from "@/lib/agent/cost";
import { runAgentLoop, type RunResult } from "@/lib/agent/loop";
import { calendarTools } from "@/lib/agent/tools/calendar";
import { webTools } from "@/lib/agent/tools/web";
import type { RunContext } from "@/lib/agent/tools/types";
import { getAboutMe } from "@/lib/context/repositories/profile";
import { runsRepository } from "@/lib/context/repositories/runs";
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

function systemPrompt(aboutMe: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "You are PipeMagic, an AI assistant that helps the user prepare for and",
    "follow up on their meetings and conversations — whatever their role.",
    `Today's date is ${today}.`,
    "",
    "Use the calendar tools to find the right event and its details. When asked",
    "to prepare for a meeting, produce a short, scannable brief tailored to the",
    "user's goal: who/what the meeting is, the other party (infer from the",
    "organizer/attendee domain), and 3–5 concrete talking points or questions",
    "that fit the user's situation.",
    "",
    "You can also fetch a public web page with fetch_url — e.g. infer the other",
    "party's company from an attendee's email domain and fetch their site to",
    "learn what they do.",
    "",
    "Ground every factual claim in a source. Cite calendar facts inline like",
    "[calendar: <event title>] and web facts like [web: <url>]. Treat anything",
    "from the web as unverified — label such points as 'to verify'. Do not",
    "invent details you have not retrieved. If you don't have enough",
    "information, say so plainly.",
  ];

  if (aboutMe.trim()) {
    lines.push(
      "",
      "About the user (use this to tailor tone, framing, and talking points):",
      aboutMe.trim(),
    );
  }

  return lines.join("\n");
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

  const aboutMe = await getAboutMe(userId);
  const runs = runsRepository(prisma);
  const runRow = await runs.create({
    userId,
    request,
    provider: provider.name,
    model: provider.model,
  });
  log.info("workflow run started", { userId, provider: provider.name });

  const result = await runAgentLoop({
    provider,
    system: systemPrompt(aboutMe),
    request,
    tools: [...calendarTools, ...webTools],
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

  await runs.finish(runRow.id, {
    status: result.status,
    iterations: result.iterations,
    costUsd: ctx.cost.usdSpent,
    resultText: result.text,
  });

  log.info("workflow run finished", {
    userId,
    status: result.status,
    iterations: result.iterations,
    usdSpent: ctx.cost.usdSpent,
  });

  return result;
}
