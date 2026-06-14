import { describe, expect, it } from "vitest";
import { createAnthropicProvider, type AnthropicLike } from "@/lib/llm/anthropic";
import { createOpenAIProvider, type OpenAILike } from "@/lib/llm/openai";
import type { LlmRequest } from "@/lib/llm/types";

// A request exercising every message shape: system, user, an assistant tool
// call, and the tool result that follows it.
const request: LlmRequest = {
  system: "SYSTEM PROMPT",
  messages: [
    { role: "user", content: [{ type: "text", text: "find events" }] },
    {
      role: "assistant",
      content: [{ type: "tool_call", id: "call-1", name: "echo", input: { msg: "hi" } }],
    },
    {
      role: "tool",
      content: [{ type: "tool_result", toolCallId: "call-1", content: "echoed:hi" }],
    },
  ],
  tools: [
    { name: "echo", description: "Echo.", parameters: { type: "object", properties: { msg: { type: "string" } } } },
  ],
  maxTokens: 1024,
};

describe("anthropic adapter", () => {
  it("maps the request to Anthropic's wire format and parses the response", async () => {
    let captured: Record<string, unknown> | undefined;
    const client: AnthropicLike = {
      messages: {
        create: async (params) => {
          captured = params;
          return {
            content: [
              { type: "text", text: "answer" },
              { type: "tool_use", id: "t9", name: "echo", input: { msg: "x" } },
            ],
            stop_reason: "tool_use",
            usage: { input_tokens: 11, output_tokens: 7 },
          };
        },
      },
    };

    const provider = createAnthropicProvider({ client, model: "claude-sonnet-4-6" });
    const res = await provider.complete(request);

    // outgoing payload
    const sent = captured as {
      system: string;
      model: string;
      tools: Array<{ name: string; input_schema: unknown }>;
      messages: Array<{ role: string; content: Array<{ type: string; [k: string]: unknown }> }>;
    };
    expect(sent.system).toBe("SYSTEM PROMPT");
    expect(sent.model).toBe("claude-sonnet-4-6");
    expect(sent.tools[0]).toMatchObject({ name: "echo" });
    expect(sent.tools[0].input_schema).toEqual(request.tools[0].parameters);
    // assistant turn carries a tool_use block
    expect(sent.messages[1].content[0]).toMatchObject({ type: "tool_use", id: "call-1", name: "echo" });
    // tool result rides in a user turn as tool_result
    expect(sent.messages[2].role).toBe("user");
    expect(sent.messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "call-1" });

    // parsed response
    expect(res.text).toBe("answer");
    expect(res.toolCalls).toEqual([{ id: "t9", name: "echo", input: { msg: "x" } }]);
    expect(res.stopReason).toBe("tool_use");
    expect(res.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });
});

describe("openai adapter", () => {
  it("maps the request to OpenAI's wire format and parses the response", async () => {
    let captured: Record<string, unknown> | undefined;
    const client: OpenAILike = {
      chat: {
        completions: {
          create: async (params) => {
            captured = params;
            return {
              choices: [
                {
                  message: {
                    content: "answer",
                    tool_calls: [
                      { id: "t9", function: { name: "echo", arguments: '{"msg":"x"}' } },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
              usage: { prompt_tokens: 11, completion_tokens: 7 },
            };
          },
        },
      },
    };

    const provider = createOpenAIProvider({ client, model: "gpt-4.1" });
    const res = await provider.complete(request);

    const sent = captured as {
      model: string;
      tools: Array<{ type: string; function: { name: string; parameters: unknown } }>;
      messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>;
    };
    expect(sent.model).toBe("gpt-4.1");
    // system is prepended as a system message
    expect(sent.messages[0]).toEqual({ role: "system", content: "SYSTEM PROMPT" });
    // tools are function-typed
    expect(sent.tools[0]).toMatchObject({ type: "function", function: { name: "echo" } });
    // assistant tool call serialized to a tool_calls array with stringified args
    const assistant = sent.messages[2] as { role: string; tool_calls: Array<{ function: { arguments: string } }> };
    expect(assistant.role).toBe("assistant");
    expect(JSON.parse(assistant.tool_calls[0].function.arguments)).toEqual({ msg: "hi" });
    // tool result becomes a role:"tool" message
    expect(sent.messages[3]).toMatchObject({ role: "tool", tool_call_id: "call-1", content: "echoed:hi" });

    // parsed response
    expect(res.text).toBe("answer");
    expect(res.toolCalls).toEqual([{ id: "t9", name: "echo", input: { msg: "x" } }]);
    expect(res.stopReason).toBe("tool_use");
    expect(res.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });
});
