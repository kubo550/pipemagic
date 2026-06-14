import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  StopReason,
} from "@/lib/llm/types";

/**
 * Anthropic Messages API adapter. No env import — the factory passes apiKey and
 * model in, so this file stays unit-testable with an injected fake client.
 */

// Minimal surface we depend on, so tests can pass a fake.
export interface AnthropicLike {
  messages: { create(params: Record<string, unknown>): Promise<AnthropicMessage> };
}

interface AnthropicMessage {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: string; [k: string]: unknown }
  >;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

// Our normalized messages → Anthropic's. Tool results ride in a user turn.
function toAnthropicMessages(messages: AgentMessage[]) {
  return messages.map((m) => {
    if (m.role === "assistant") {
      return {
        role: "assistant" as const,
        content: m.content.map((p) =>
          p.type === "tool_call"
            ? { type: "tool_use", id: p.id, name: p.name, input: p.input }
            : { type: "text", text: (p as { text: string }).text },
        ),
      };
    }
    // "user" and "tool" both map to a user turn in Anthropic's format.
    return {
      role: "user" as const,
      content: m.content.map((p) =>
        p.type === "tool_result"
          ? {
              type: "tool_result",
              tool_use_id: p.toolCallId,
              content: p.content,
              ...(p.isError ? { is_error: true } : {}),
            }
          : { type: "text", text: (p as { text: string }).text },
      ),
    };
  });
}

export function createAnthropicProvider(opts: {
  client?: AnthropicLike;
  apiKey?: string;
  model?: string;
}): LlmProvider {
  const model = opts.model ?? "claude-sonnet-4-6";
  const client: AnthropicLike =
    opts.client ??
    (new Anthropic({ apiKey: opts.apiKey }) as unknown as AnthropicLike);

  return {
    name: "anthropic",
    model,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const res = await client.messages.create({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      });

      let text = "";
      const toolCalls = [];
      for (const block of res.content) {
        if (block.type === "text") text += (block as { text: string }).text;
        else if (block.type === "tool_use") {
          const b = block as { id: string; name: string; input: unknown };
          toolCalls.push({ id: b.id, name: b.name, input: b.input });
        }
      }

      const stopReason: StopReason =
        res.stop_reason === "tool_use"
          ? "tool_use"
          : res.stop_reason === "max_tokens"
            ? "max_tokens"
            : "end";

      return {
        text,
        toolCalls,
        stopReason,
        usage: {
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
        },
      };
    },
  };
}
