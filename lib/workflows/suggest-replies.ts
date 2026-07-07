import { getProvider } from "@/lib/llm";

/**
 * Suggested quick-replies for the chat UI: given the user's question and the
 * assistant's answer, propose 2–3 short next things the user might tap. A tiny,
 * cheap, provider-agnostic call that runs after the main answer — a failure
 * here must never break the answer (the caller swallows errors).
 */

const SYSTEM = [
  "You propose follow-up replies a USER might tap after reading an assistant's",
  "answer in a meeting-prep assistant. Return 2–3 options, each a short",
  "actionable phrase the user would send next (≤ 6 words, imperative or",
  "first-person, e.g. 'Draft the follow-up email', 'What are the risks?').",
  "Reply with ONLY a JSON array of strings — no prose, no markdown.",
].join("\n");

function parseArray(text: string): string[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function suggestReplies(input: {
  question: string;
  answer: string;
}): Promise<string[]> {
  const provider = getProvider();
  const res = await provider.complete({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `User asked:\n${input.question}\n\nAssistant answered:\n${input.answer.slice(0, 4000)}`,
          },
        ],
      },
    ],
    tools: [],
    maxTokens: 120,
  });
  return parseArray(res.text);
}
