import type { LlmProvider, AgentMessage, ToolResultPart } from "@/lib/llm/types";
import { toJsonSchema } from "@/lib/llm/json-schema";
import type { RunContext, Tool } from "@/lib/agent/tools/types";

/**
 * The agent loop: bounded while-loop with a hard iteration cap and a per-run
 * cost budget (PRD §5.1). LLM → tool calls → results → LLM, until the model
 * stops calling tools or a guard trips. Tools marked `requiresApproval` halt
 * the loop and surface the pending call for confirmation. Provider-agnostic —
 * it only sees the LlmProvider interface.
 */

export type RunStatus =
  | "completed"
  | "awaiting_approval"
  | "max_iterations"
  | "budget_exceeded";

export interface PendingApproval {
  toolName: string;
  input: unknown;
  toolCallId: string;
}

export interface RunResult {
  status: RunStatus;
  text: string;
  iterations: number;
  pendingApproval?: PendingApproval;
}

export type LoopEvent =
  | { type: "tool_call"; name: string }
  | { type: "answer"; text: string };

export interface RunOptions {
  provider: LlmProvider;
  system: string;
  request: string;
  tools: Tool[];
  ctx: RunContext;
  maxIterations?: number;
  maxCostUsd?: number;
  maxTokens?: number;
  /** Optional progress hook so a sink can stream tool-call / answer events. */
  onEvent?: (e: LoopEvent) => void;
}

export async function runAgentLoop(opts: RunOptions): Promise<RunResult> {
  const {
    provider,
    system,
    request,
    tools,
    ctx,
    maxIterations = 8,
    maxCostUsd = 0.5,
    maxTokens = 4096,
    onEvent,
  } = opts;

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const toolSchemas = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toJsonSchema(t.schema),
  }));

  const messages: AgentMessage[] = [
    { role: "user", content: [{ type: "text", text: request }] },
  ];
  let text = "";

  for (let i = 0; i < maxIterations; i++) {
    if (ctx.cost.usdSpent >= maxCostUsd) {
      ctx.log.warn("agent run hit budget", { usdSpent: ctx.cost.usdSpent });
      return { status: "budget_exceeded", text, iterations: i };
    }

    const res = await provider.complete({
      system,
      messages,
      tools: toolSchemas,
      maxTokens,
    });
    ctx.cost.add(res.usage);
    text = res.text;

    if (res.toolCalls.length === 0) {
      onEvent?.({ type: "answer", text });
      return { status: "completed", text, iterations: i + 1 };
    }

    // Record the assistant turn (text + tool calls) before running the tools.
    messages.push({
      role: "assistant",
      content: [
        ...(res.text ? [{ type: "text" as const, text: res.text }] : []),
        ...res.toolCalls.map((tc) => ({
          type: "tool_call" as const,
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      ],
    });

    const resultParts: ToolResultPart[] = [];
    for (const call of res.toolCalls) {
      const tool = toolMap.get(call.name);
      if (!tool) {
        resultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          content: `Unknown tool: ${call.name}`,
          isError: true,
        });
        continue;
      }
      onEvent?.({ type: "tool_call", name: call.name });
      if (tool.requiresApproval) {
        return {
          status: "awaiting_approval",
          text,
          iterations: i + 1,
          pendingApproval: {
            toolName: call.name,
            input: call.input,
            toolCallId: call.id,
          },
        };
      }
      try {
        const parsed = tool.schema.parse(call.input);
        const out = await tool.execute(parsed, ctx);
        resultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          content: typeof out === "string" ? out : JSON.stringify(out),
        });
      } catch (err) {
        ctx.log.warn("tool execution failed", { tool: call.name, err: String(err) });
        resultParts.push({
          type: "tool_result",
          toolCallId: call.id,
          content: `Error: ${String(err)}`,
          isError: true,
        });
      }
    }

    messages.push({ role: "tool", content: resultParts });
  }

  ctx.log.warn("agent run hit iteration cap", { maxIterations });
  return { status: "max_iterations", text, iterations: maxIterations };
}
