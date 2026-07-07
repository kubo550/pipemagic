import { getProvider } from "@/lib/llm";
import type { LlmUsage } from "@/lib/llm/types";

/**
 * Tiny structured call that picks the lead's primary domain from a set of
 * attendee email domains (the Daisy "which domain is the lead" step, done
 * better than the Zapier hack). Provider-agnostic. Returns the chosen domain
 * plus token usage so the caller can charge it to the run budget.
 */

export interface DomainPick {
  domain: string;
  usage: LlmUsage;
}

const SYSTEM = [
  "You are given a lead/company name and a list of email domains seen among",
  "meeting attendees. Pick the ONE domain that belongs to that lead company.",
  "Ignore generic mail providers (gmail.com, outlook.com, …) and the user's",
  "own vendor domain. Reply with ONLY the bare domain, nothing else.",
].join("\n");

export async function pickPrimaryDomain(
  leadName: string,
  domains: string[],
): Promise<DomainPick> {
  const unique = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  // Trivial cases: skip the model call entirely.
  if (unique.length <= 1) {
    return { domain: unique[0] ?? "", usage: { inputTokens: 0, outputTokens: 0 } };
  }

  const provider = getProvider();
  const res = await provider.complete({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Lead/company: ${leadName || "(unknown)"}\nDomains: ${unique.join(", ")}`,
          },
        ],
      },
    ],
    tools: [],
    maxTokens: 30,
  });

  // Normalize the reply to a bare domain; fall back to the first candidate.
  const guess = res.text.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const domain = unique.includes(guess) ? guess : unique[0];
  return { domain, usage: res.usage };
}
