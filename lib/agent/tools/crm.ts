import { z } from "zod";
import { env } from "@/lib/env";
import { getCrmAdapter } from "@/lib/integrations/crm";
import type { CrmAdapter } from "@/lib/integrations/crm/types";
import { summarizeDealContext } from "@/lib/workflows/deal-summary";
import type { Tool, RunContext } from "@/lib/agent/tools/types";

/**
 * `find_deal` — ports the Daisy "find the right deal" automation. Given the
 * meeting attendees' emails, drop the user's own people, look each remaining
 * contact up in the CRM, collect their deal ids, and pick the highest id as the
 * newest/most-current deal (the documented heuristic). Read-only → no approval.
 */

export interface FindDealResult {
  dealId: number | null;
  /** Distinct deal ids discovered across all external contacts. */
  candidates: number;
  /** External (non-own-domain) emails we looked up. */
  checkedEmails: number;
}

/** Domain of an email, lowercased, or null if malformed. */
function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/** True if `domain` equals or is a subdomain of any own-domain. */
function isOwnDomain(domain: string, own: Set<string>): boolean {
  if (own.has(domain)) return true;
  for (const o of own) {
    if (domain.endsWith(`.${o}`)) return true;
  }
  return false;
}

/**
 * Pure deal-finding logic over a CRM adapter — no DB, no env, fully unit
 * testable with a mock adapter. Each contact/email lookup is isolated so one
 * failure never stops us checking the rest (the Zapier "check everyone"
 * guarantee).
 */
export async function findDeal(
  adapter: CrmAdapter,
  userId: string,
  attendeeEmails: string[],
  ownDomains: string[],
  log?: RunContext["log"],
): Promise<FindDealResult> {
  const own = new Set(
    ownDomains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean),
  );

  // External, de-duplicated, well-formed attendee emails only.
  const external = [
    ...new Set(
      attendeeEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => {
          const d = domainOf(e);
          return d !== null && !isOwnDomain(d, own);
        }),
    ),
  ];

  const dealIds = new Set<number>();
  for (const email of external) {
    try {
      const contacts = await adapter.searchContactsByEmail(userId, email);
      for (const contact of contacts) {
        try {
          const deals = await adapter.listDealsForContact(userId, contact.id);
          for (const d of deals) dealIds.add(d.id);
        } catch (err) {
          log?.warn("listDealsForContact failed", { contactId: contact.id, err: String(err) });
        }
      }
    } catch (err) {
      log?.warn("searchContactsByEmail failed", { err: String(err) });
    }
  }

  // Highest id ≈ newest/most-current deal (the documented Daisy heuristic).
  const sorted = [...dealIds].sort((a, b) => b - a);
  return {
    dealId: sorted[0] ?? null,
    candidates: sorted.length,
    checkedEmails: external.length,
  };
}

/** Own-email domains: the user's own domain + any configured via env. */
async function resolveOwnDomains(
  ctx: RunContext,
  override?: string[],
): Promise<string[]> {
  if (override && override.length) return override;

  const domains: string[] = [];
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });
  const d = user?.email ? domainOf(user.email) : null;
  if (d) domains.push(d);

  if (env.OWN_EMAIL_DOMAINS) {
    domains.push(...env.OWN_EMAIL_DOMAINS.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return domains;
}

export const findDealTool: Tool<{
  attendeeEmails: string[];
  ownDomains?: string[];
}> = {
  name: "find_deal",
  description:
    "Find the CRM deal for a meeting from its attendees' email addresses. Drops the user's own colleagues, looks each external attendee up as a CRM contact, and returns the most current deal (highest deal id). Returns dealId null if nothing matches or no CRM is connected.",
  schema: z.object({
    attendeeEmails: z
      .array(z.string())
      .describe("Email addresses of everyone on the meeting."),
    ownDomains: z
      .array(z.string())
      .optional()
      .describe(
        "Email domains to treat as the user's own (excluded from the lookup). Defaults to the user's domain plus any configured.",
      ),
  }),
  async execute(input, ctx) {
    const adapter = await getCrmAdapter(ctx.userId);
    if (!adapter) {
      return { dealId: null, candidates: 0, checkedEmails: 0, error: "No CRM connected." };
    }
    const ownDomains = await resolveOwnDomains(ctx, input.ownDomains);
    return findDeal(adapter, ctx.userId, input.attendeeEmails, ownDomains, ctx.log);
  },
};

const SECTIONS = ["emails", "notes", "activities"] as const;
type Section = (typeof SECTIONS)[number];

export const getDealContextTool: Tool<{
  dealId: number;
  include?: Section[];
}> = {
  name: "get_deal_context",
  description:
    "Pull a CRM deal's history (email threads, notes, activities) and return a concise briefing note distilled from it — use after find_deal to ground a follow-up in what's already happened. Returns the note only, not the raw history.",
  schema: z.object({
    dealId: z.number().int().describe("The deal id, e.g. from find_deal."),
    include: z
      .array(z.enum(SECTIONS))
      .optional()
      .describe("Which parts to pull (default: all)."),
  }),
  async execute(input, ctx) {
    const adapter = await getCrmAdapter(ctx.userId);
    if (!adapter) return { note: "", error: "No CRM connected." };

    const want = new Set<Section>(input.include ?? SECTIONS);
    const [emails, notes, activities] = await Promise.all([
      want.has("emails") ? adapter.getDealEmails(ctx.userId, input.dealId) : [],
      want.has("notes") ? adapter.getDealNotes(ctx.userId, input.dealId) : [],
      want.has("activities")
        ? adapter.getDealActivities(ctx.userId, input.dealId)
        : [],
    ]);

    const counts = {
      emails: emails.length,
      notes: notes.length,
      activities: activities.length,
    };
    if (emails.length + notes.length + activities.length === 0) {
      return { note: "No CRM history found for this deal.", counts };
    }

    const { note, usage } = await summarizeDealContext({ emails, notes, activities });
    // Charge the summarizer's tokens to the run budget (same provider/model).
    ctx.cost.add(usage);
    return { note, counts };
  },
};

export const crmTools = [findDealTool, getDealContextTool];
