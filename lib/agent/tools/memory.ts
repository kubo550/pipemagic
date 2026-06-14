import { z } from "zod";
import { factsRepository } from "@/lib/context/repositories/facts";
import type { Tool } from "@/lib/agent/tools/types";

/**
 * Reads the durable Fact store so the assistant actually uses what it has
 * remembered (PRD §5.2 — the moat). Read-only; facts were written through the
 * typed service (post-meeting), never ad-hoc here.
 */
export const recallFactsTool: Tool<{ query?: string; limit?: number }> = {
  name: "recall_facts",
  description:
    "Recall facts you've previously saved about people, companies, and past meetings. Call this before answering questions about who/what the user is dealing with. Optionally pass a query to filter.",
  schema: z.object({
    query: z
      .string()
      .optional()
      .describe("Optional keyword to filter remembered facts (case-insensitive)."),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  async execute(input, ctx) {
    const facts = await factsRepository(ctx.db).listRecentForUser(
      ctx.userId,
      input.limit ?? 30,
    );
    // Match on ANY query word (token-OR), not the whole phrase — the model's
    // query is rarely a contiguous substring of the stored fact.
    const terms = (input.query ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const filtered = terms.length
      ? facts.filter((f) => {
          const t = f.text.toLowerCase();
          return terms.some((term) => t.includes(term));
        })
      : facts;
    return filtered.map((f) => ({
      text: f.text,
      source: f.sourceType,
      observedAt: f.observedAt.toISOString().slice(0, 10),
    }));
  },
};
