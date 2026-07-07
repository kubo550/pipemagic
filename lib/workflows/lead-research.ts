import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { LlmUsage } from "@/lib/llm/types";

/**
 * Lead research via a web-enabled model (the Daisy "research the lead"
 * automation). Decision §8: give the model direct internet access rather than a
 * separate search API. Our provider abstraction only carries custom function
 * tools, so this is a self-contained Anthropic call using the server-side
 * web_search tool (like deal-summary is a self-contained structured call).
 *
 * Only runs when Anthropic is the configured provider and a key is set; the
 * agent still has the keyless fetch_url tool as a fallback otherwise.
 */

// web_search server tool (dynamic filtering); supported on Sonnet 4.6 + Opus
// 4.6/4.7/4.8 — the models this project targets. Older models would need the
// basic web_search_20250305 variant.
const WEB_SEARCH_TYPE = "web_search_20260209";
const MAX_SEARCHES = 5;
// Guard against the server-tool loop never settling.
const MAX_CONTINUATIONS = 3;

export interface LeadResearchInput {
  leadName?: string;
  primaryDomain?: string;
  attendeeEmails?: string[];
  /** Also research the individual people, not just the company. */
  perPerson?: boolean;
}

export interface LeadResearch {
  note: string;
  usage: LlmUsage;
  available: boolean;
}

export function webResearchAvailable(): boolean {
  return env.LLM_PROVIDER === "anthropic" && Boolean(env.ANTHROPIC_API_KEY);
}

function buildPrompt(input: LeadResearchInput): string {
  const lines = ["Research this sales lead for a meeting follow-up."];
  if (input.leadName) lines.push(`Company: ${input.leadName}`);
  if (input.primaryDomain) lines.push(`Website/domain: ${input.primaryDomain}`);
  if (input.attendeeEmails?.length)
    lines.push(`People on the lead side: ${input.attendeeEmails.join(", ")}`);
  lines.push(
    "",
    "Produce a concise briefing note (bullet points): what the company does,",
    "size/industry, anything recent or relevant to a sales conversation, and —",
    "if you can find it — a line on each named person (role, background).",
    "Cite sources inline. Keep it under ~200 words. If you can't find solid",
    "information, say so plainly rather than guessing.",
  );
  if (input.perPerson === false) {
    lines.push("(Focus on the company; skip per-person detail.)");
  }
  return lines.join("\n");
}

export async function researchLead(
  input: LeadResearchInput,
): Promise<LeadResearch> {
  if (!webResearchAvailable()) {
    return {
      note: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      available: false,
    };
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: buildPrompt(input) },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let note = "";

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const res = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages,
      tools: [
        { type: WEB_SEARCH_TYPE, name: "web_search", max_uses: MAX_SEARCHES },
      ] as unknown as Anthropic.Messages.ToolUnion[],
    });

    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    note = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // The server-tool loop can pause (pause_turn) before finishing; resume by
    // echoing the assistant turn back and calling again.
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    break;
  }

  return { note, usage: { inputTokens, outputTokens }, available: true };
}
