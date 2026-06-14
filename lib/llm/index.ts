import { env } from "@/lib/env";
import { createAnthropicProvider } from "@/lib/llm/anthropic";
import { createOpenAIProvider } from "@/lib/llm/openai";
import type { LlmProvider } from "@/lib/llm/types";

export type { LlmProvider } from "@/lib/llm/types";

/**
 * Resolve the active LLM provider from env. This is the only place that reads
 * the provider/model/key config — everything downstream takes an LlmProvider.
 */
export function getProvider(): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case "anthropic":
      return createAnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL,
      });
    case "openai":
      return createOpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
      });
  }
}
