import OpenAI from "openai";
import type {
  AgentMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  StopReason,
} from "@/lib/llm/types";

/**
 * OpenAI Chat Completions adapter. Same contract as the Anthropic adapter —
 * the agent loop can't tell them apart. No env import (factory injects config).
 */

export interface OpenAILike {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<OpenAICompletion>;
    };
  };
}

interface OpenAICompletion {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// Our normalized messages → OpenAI's. Tool results become role:"tool" messages,
// one per result. System prompt is prepended as a system message.
function toOpenAIMessages(system: string, messages: AgentMessage[]) {
  const out: Array<Record<string, unknown>> = [
    { role: "system", content: system },
  ];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("");
      const toolCalls = m.content
        .filter((p) => p.type === "tool_call")
        .map((p) => {
          const c = p as { id: string; name: string; input: unknown };
          return {
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          };
        });
      out.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else if (m.role === "tool") {
      for (const p of m.content) {
        if (p.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: p.toolCallId,
            content: p.content,
          });
        }
      }
    } else {
      out.push({
        role: "user",
        content: m.content
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join(""),
      });
    }
  }
  return out;
}

export function createOpenAIProvider(opts: {
  client?: OpenAILike;
  apiKey?: string;
  model?: string;
}): LlmProvider {
  const model = opts.model ?? "gpt-4.1";
  const client: OpenAILike =
    opts.client ??
    (new OpenAI({ apiKey: opts.apiKey }) as unknown as OpenAILike);

  return {
    name: "openai",
    model,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const res = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens,
        messages: toOpenAIMessages(req.system, req.messages),
        tools: req.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      });

      const choice = res.choices[0];
      const text = choice.message.content ?? "";
      const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}"),
      }));

      const stopReason: StopReason =
        choice.finish_reason === "tool_calls"
          ? "tool_use"
          : choice.finish_reason === "length"
            ? "max_tokens"
            : "end";

      return {
        text,
        toolCalls,
        stopReason,
        usage: {
          inputTokens: res.usage.prompt_tokens,
          outputTokens: res.usage.completion_tokens,
        },
      };
    },
  };
}
