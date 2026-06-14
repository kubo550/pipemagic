import type { PrismaClient } from "@prisma/client";
import { factsRepository } from "@/lib/context/repositories/facts";

/**
 * Context assembly (PRD §5.2, warmth layer 2). A *function*, not a stored
 * object: it selects, ranks, budgets, and renders the durable knowledge into a
 * ContextPackage to seed a Run. Phase-2 skeleton — selection is by recency +
 * confidence with a char-based budget; richer ranking/summarization comes later.
 *
 * Only the start-of-run seed goes through here. In-loop drill-down reads narrow
 * data straight from repositories (the second read path in §5.2).
 */

export interface ContextItem {
  text: string;
  source: string; // provenance marker, e.g. "calendar" / "web (verify)"
  confidence: number;
}

export interface ContextPackage {
  dealName: string;
  companyName: string | null;
  /** Rendered, budget-limited context block ready to drop into a prompt. */
  rendered: string;
  /** The selected items with provenance, for callers that want structure. */
  items: ContextItem[];
  truncated: boolean;
}

const DEFAULT_BUDGET_CHARS = 6000;

export async function buildContext(
  db: PrismaClient,
  userId: string,
  dealId: string,
  opts: { budgetChars?: number } = {},
): Promise<ContextPackage | null> {
  const budget = opts.budgetChars ?? DEFAULT_BUDGET_CHARS;

  const deal = await db.deal.findFirst({
    where: { id: dealId, userId },
    include: { company: true },
  });
  if (!deal) return null;

  const facts = await factsRepository(db).listCurrentForDeal(userId, dealId);

  // Web facts are flagged "verify"; trusted sources are not (PRD §5.2/§8).
  const items: ContextItem[] = facts.map((f) => ({
    text: f.text,
    source: f.sourceType === "web" ? "web (verify)" : f.sourceType,
    confidence: f.confidence,
  }));

  // Budget: take items in ranked order until the char budget is spent.
  const selected: ContextItem[] = [];
  let used = 0;
  let truncated = false;
  for (const item of items) {
    const cost = item.text.length + item.source.length + 8;
    if (used + cost > budget) {
      truncated = true;
      break;
    }
    selected.push(item);
    used += cost;
  }

  const header = `Deal: ${deal.name}${deal.company ? ` (${deal.company.name})` : ""}`;
  const body = selected.length
    ? selected.map((i) => `- [${i.source}] ${i.text}`).join("\n")
    : "(no facts recorded yet)";

  return {
    dealName: deal.name,
    companyName: deal.company?.name ?? null,
    rendered: `${header}\n\n${body}`,
    items: selected,
    truncated,
  };
}
