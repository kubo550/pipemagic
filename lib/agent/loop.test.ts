import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentLoop } from "@/lib/agent/loop";
import { CostTracker, pricingFor } from "@/lib/agent/cost";
import { createAnthropicProvider, type AnthropicLike } from "@/lib/llm/anthropic";
import { createOpenAIProvider, type OpenAILike } from "@/lib/llm/openai";
import type { LlmProvider, LlmResponse } from "@/lib/llm/types";
import type { RunContext, Tool } from "@/lib/agent/tools/types";

// --- test doubles ---

const stubLog = { info() {}, warn() {}, error() {} };

function makeCtx(budget = pricingFor("claude-sonnet-4-6")): RunContext {
  return {
    userId: "u1",
    db: {} as never,
    cost: new CostTracker(budget),
    log: stubLog as unknown as RunContext["log"],
  };
}

function echoTool(calls: string[]): Tool<{ msg: string }> {
  return {
    name: "echo",
    description: "Echo a message back.",
    schema: z.object({ msg: z.string() }),
    async execute(input) {
      calls.push(input.msg);
      return `echoed:${input.msg}`;
    },
  };
}

// Fake SDK clients that replay scripted responses by call index.
function fakeAnthropic(
  responses: Array<Parameters<AnthropicLike["messages"]["create"]> extends never ? never : Awaited<ReturnType<AnthropicLike["messages"]["create"]>>>,
): AnthropicLike {
  let i = 0;
  return { messages: { create: async () => responses[i++] } };
}
function fakeOpenAI(
  responses: Array<Awaited<ReturnType<OpenAILike["chat"]["completions"]["create"]>>>,
): OpenAILike {
  let i = 0;
  return { chat: { completions: { create: async () => responses[i++] } } };
}

// Each builder scripts the SAME conversation in its provider's wire format:
// turn 1 → call `echo({msg:"hi"})`, turn 2 → final text "done".
const builders: Record<string, () => LlmProvider> = {
  anthropic: () =>
    createAnthropicProvider({
      client: fakeAnthropic([
        {
          content: [{ type: "tool_use", id: "t1", name: "echo", input: { msg: "hi" } }],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
        {
          content: [{ type: "text", text: "done" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 8, output_tokens: 4 },
        },
      ]),
    }),
  openai: () =>
    createOpenAIProvider({
      client: fakeOpenAI([
        {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  { id: "c1", function: { name: "echo", arguments: '{"msg":"hi"}' } },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
        {
          choices: [{ message: { content: "done" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 8, completion_tokens: 4 },
        },
      ]),
    }),
};

// --- the Phase-2 Done criterion: same test passes for both providers ---

describe("agent loop: tool-call → result → answer", () => {
  it.each(["anthropic", "openai"])("works for %s", async (name) => {
    const calls: string[] = [];
    const result = await runAgentLoop({
      provider: builders[name](),
      system: "You are a test agent.",
      request: "Please echo hi.",
      tools: [echoTool(calls)],
      ctx: makeCtx(),
    });

    expect(result.status).toBe("completed");
    expect(result.text).toBe("done");
    expect(result.iterations).toBe(2);
    expect(calls).toEqual(["hi"]); // the tool actually ran, exactly once
  });
});

// --- provider-agnostic guard behavior (mock provider) ---

function mockProvider(script: LlmResponse[]): LlmProvider {
  let i = 0;
  return {
    name: "mock",
    model: "mock",
    async complete() {
      return script[Math.min(i++, script.length - 1)];
    },
  };
}

const toolCallResponse: LlmResponse = {
  text: "",
  toolCalls: [{ id: "x", name: "echo", input: { msg: "a" } }],
  stopReason: "tool_use",
  usage: { inputTokens: 1, outputTokens: 1 },
};

describe("agent loop guards", () => {
  it("stops at the iteration cap when the model never finishes", async () => {
    const result = await runAgentLoop({
      provider: mockProvider([toolCallResponse]), // always asks for a tool
      system: "s",
      request: "r",
      tools: [echoTool([])],
      ctx: makeCtx(),
      maxIterations: 3,
    });
    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(3);
  });

  it("stops when the cost budget is exceeded", async () => {
    const result = await runAgentLoop({
      provider: mockProvider([
        {
          ...toolCallResponse,
          usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        },
      ]),
      system: "s",
      request: "r",
      tools: [echoTool([])],
      ctx: makeCtx(),
      maxCostUsd: 0.001, // first call blows the budget; 2nd iteration pre-check trips
    });
    expect(result.status).toBe("budget_exceeded");
  });

  it("pauses for approval before running a gated tool", async () => {
    const gated: Tool<{ msg: string }> = {
      ...echoTool([]),
      requiresApproval: true,
    };
    const result = await runAgentLoop({
      provider: mockProvider([toolCallResponse]),
      system: "s",
      request: "r",
      tools: [gated],
      ctx: makeCtx(),
    });
    expect(result.status).toBe("awaiting_approval");
    expect(result.pendingApproval?.toolName).toBe("echo");
  });

  it("reports unknown tools as an error result and keeps going", async () => {
    const result = await runAgentLoop({
      provider: mockProvider([
        {
          text: "",
          toolCalls: [{ id: "u", name: "missing", input: {} }],
          stopReason: "tool_use",
          usage: { inputTokens: 1, outputTokens: 1 },
        },
        {
          text: "recovered",
          toolCalls: [],
          stopReason: "end",
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      ]),
      system: "s",
      request: "r",
      tools: [echoTool([])],
      ctx: makeCtx(),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toBe("recovered");
  });
});

// --- approval pause → resume round-trip ---

const finalResponse: LlmResponse = {
  text: "done",
  toolCalls: [],
  stopReason: "end",
  usage: { inputTokens: 1, outputTokens: 1 },
};

describe("agent loop: approval resume", () => {
  it("does not run the gated tool at the pause", async () => {
    const ran: string[] = [];
    const gated: Tool<{ msg: string }> = { ...echoTool(ran), requiresApproval: true };
    const paused = await runAgentLoop({
      provider: mockProvider([toolCallResponse]),
      system: "s",
      request: "r",
      tools: [gated],
      ctx: makeCtx(),
    });
    expect(paused.status).toBe("awaiting_approval");
    expect(paused.messages).toBeTruthy();
    expect(ran).toEqual([]); // gated tool held until approved
  });

  it("runs the gated tool on resume when approved, then finishes", async () => {
    const ran: string[] = [];
    const gated: Tool<{ msg: string }> = { ...echoTool(ran), requiresApproval: true };
    const paused = await runAgentLoop({
      provider: mockProvider([toolCallResponse]),
      system: "s",
      request: "r",
      tools: [gated],
      ctx: makeCtx(),
    });

    const done = await runAgentLoop({
      provider: mockProvider([finalResponse]),
      system: "s",
      request: "",
      tools: [gated],
      ctx: makeCtx(),
      resumeMessages: paused.messages,
      approval: { approved: true },
    });
    expect(done.status).toBe("completed");
    expect(done.text).toBe("done");
    expect(ran).toEqual(["a"]); // executed exactly once, on resume
  });

  it("skips the gated tool on resume when declined", async () => {
    const ran: string[] = [];
    const gated: Tool<{ msg: string }> = { ...echoTool(ran), requiresApproval: true };
    const paused = await runAgentLoop({
      provider: mockProvider([toolCallResponse]),
      system: "s",
      request: "r",
      tools: [gated],
      ctx: makeCtx(),
    });

    const done = await runAgentLoop({
      provider: mockProvider([finalResponse]),
      system: "s",
      request: "",
      tools: [gated],
      ctx: makeCtx(),
      resumeMessages: paused.messages,
      approval: { approved: false },
    });
    expect(done.status).toBe("completed");
    expect(ran).toEqual([]); // never executed
  });
});
