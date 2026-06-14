import type { LlmUsage } from "@/lib/llm/types";

/**
 * Per-run cost accounting. The agent loop checks `usdSpent` against a hard
 * budget before each LLM call (PRD §5.1 — budget guard). Prices are best-effort
 * defaults keyed by model; unknown models fall back to a conservative estimate.
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

const FALLBACK: ModelPricing = { inputPerMTok: 5, outputPerMTok: 15 };

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? FALLBACK;
}

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;

  constructor(private readonly pricing: ModelPricing) {}

  add(usage: LlmUsage): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
  }

  get usdSpent(): number {
    return (
      (this.inputTokens / 1_000_000) * this.pricing.inputPerMTok +
      (this.outputTokens / 1_000_000) * this.pricing.outputPerMTok
    );
  }

  get tokens(): { input: number; output: number } {
    return { input: this.inputTokens, output: this.outputTokens };
  }
}
