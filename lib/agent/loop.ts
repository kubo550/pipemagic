import type {
  LlmProvider,
  AgentMessage,
  ToolCallPart,
  ToolResultPart,
} from "@/lib/llm/types";
import { toJsonSchema } from "@/lib/llm/json-schema";
import type { RunContext, Tool } from "@/lib/agent/tools/types";

/**
 * The agent loop: bounded while-loop with a hard iteration cap and a per-run
 * cost budget (PRD §5.1). LLM → tool calls → results → LLM, until the model
 * stops calling tools or a guard trips. A turn containing any tool marked
 * `requiresApproval` halts the loop and surfaces the pending call for
 * confirmation; the caller resumes with a decision (see `approval`).
 * Provider-agnostic — it only sees the LlmProvider interface.
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
  /** Conversation state at an approval pause — pass back verbatim to resume. */
  messages?: AgentMessage[];
}

export type LoopEvent =
  | { type: "tool_call"; name: string }
  | { type: "answer"; text: string };

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface RunOptions {
  provider: LlmProvider;
  system: string;
  request: string;
  tools: Tool[];
  ctx: RunContext;
  /** Prior conversation turns to seed before the new request (multi-turn memory). */
  history?: HistoryTurn[];
  /** Resume a paused run: the exact `messages` returned at the approval pause. */
  resumeMessages?: AgentMessage[];
  /** The user's decision on the pending approval when resuming. */
  approval?: { approved: boolean };
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
    history = [],
    resumeMessages,
    approval,
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

  // Run one tool call to a result part (no approval logic — that's handled by
  // the pause/resume flow before we get here).
  async function executeCall(call: {
    id: string;
    name: string;
    input: unknown;
  }): Promise<ToolResultPart> {
    const tool = toolMap.get(call.name);
    if (!tool) {
      return {
        type: "tool_result",
        toolCallId: call.id,
        content: `Unknown tool: ${call.name}`,
        isError: true,
      };
    }
    onEvent?.({ type: "tool_call", name: call.name });
    try {
      const parsed = tool.schema.parse(call.input);
      const out = await tool.execute(parsed, ctx);
      return {
        type: "tool_result",
        toolCallId: call.id,
        content: typeof out === "string" ? out : JSON.stringify(out),
      };
    } catch (err) {
      ctx.log.warn("tool execution failed", { tool: call.name, err: String(err) });
      return {
        type: "tool_result",
        toolCallId: call.id,
        content: `Error: ${String(err)}`,
        isError: true,
      };
    }
  }

  const messages: AgentMessage[] = resumeMessages
    ? [...resumeMessages]
    : [
        ...history.map(
          (t): AgentMessage => ({
            role: t.role,
            content: [{ type: "text", text: t.text }],
          }),
        ),
        { role: "user", content: [{ type: "text", text: request }] },
      ];
  let text = "";

  // Resuming: settle the pending tool call(s) in the last assistant turn using
  // the user's decision, then fall through into the normal loop.
  if (approval) {
    const last = messages[messages.length - 1];
    const calls =
      last?.role === "assistant"
        ? last.content.filter((p): p is ToolCallPart => p.type === "tool_call")
        : [];
    const parts: ToolResultPart[] = [];
    for (const call of calls) {
      const tool = toolMap.get(call.name);
      if (tool?.requiresApproval && !approval.approved) {
        parts.push({
          type: "tool_result",
          toolCallId: call.id,
          content: `The user declined to run ${call.name}. Do not try it again; acknowledge and continue.`,
        });
      } else {
        parts.push(await executeCall(call));
      }
    }
    if (parts.length) messages.push({ role: "tool", content: parts });
  }

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

    // If any call in this turn needs approval, pause the whole turn before
    // running anything — the caller confirms, then resumes with the decision.
    const pending = res.toolCalls.find(
      (tc) => toolMap.get(tc.name)?.requiresApproval,
    );
    if (pending) {
      onEvent?.({ type: "tool_call", name: pending.name });
      return {
        status: "awaiting_approval",
        text,
        iterations: i + 1,
        pendingApproval: {
          toolName: pending.name,
          input: pending.input,
          toolCallId: pending.id,
        },
        messages,
      };
    }

    const resultParts: ToolResultPart[] = [];
    for (const call of res.toolCalls) {
      resultParts.push(await executeCall(call));
    }
    messages.push({ role: "tool", content: resultParts });
  }

  ctx.log.warn("agent run hit iteration cap", { maxIterations });
  return { status: "max_iterations", text, iterations: maxIterations };
}
