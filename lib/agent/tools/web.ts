import { z } from "zod";
import { fetchUrl } from "@/lib/integrations/web";
import { pickPrimaryDomain } from "@/lib/workflows/domain-pick";
import { researchLead, webResearchAvailable } from "@/lib/workflows/lead-research";
import type { Tool } from "@/lib/agent/tools/types";

/**
 * Keyless web enrichment (PRD Phase 5). `fetch_url` retrieves a public page and
 * returns its text — e.g. a company's site inferred from an attendee domain.
 * Read-only; web-sourced info must be cited and flagged "to verify" by the
 * agent (instructed in the system prompt). `research_lead` adds open-web
 * research via a web-enabled model (Phase 3).
 */
export const fetchUrlTool: Tool<{ url: string }> = {
  name: "fetch_url",
  description:
    "Fetch a public web page and return its text. Use it to research the other party — e.g. fetch https://<their-domain> to learn what a company does. Returns { url, title, text }.",
  schema: z.object({
    url: z.string().describe("An absolute http(s) URL to fetch."),
  }),
  async execute(input) {
    try {
      return await fetchUrl(input.url);
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) };
    }
  },
};

/** Domain of an email, lowercased, or null if malformed. */
function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

export const researchLeadTool: Tool<{
  leadName?: string;
  domain?: string;
  attendeeEmails?: string[];
  perPerson?: boolean;
}> = {
  name: "research_lead",
  description:
    "Research a sales lead on the open web using a web-enabled model. Give the company name and/or its domain (or the lead-side attendees' emails) and get back a concise, cited research note on the company and the people. Treat the result as 'to verify'.",
  schema: z.object({
    leadName: z.string().optional().describe("The lead company's name, if known."),
    domain: z
      .string()
      .optional()
      .describe("The lead's primary domain, if known (else inferred from emails)."),
    attendeeEmails: z
      .array(z.string())
      .optional()
      .describe("Lead-side attendee emails — used to infer the domain and research people."),
    perPerson: z
      .boolean()
      .optional()
      .describe("Also research the individual attendees (default true)."),
  }),
  async execute(input, ctx) {
    if (!webResearchAvailable()) {
      return {
        note: "",
        error:
          "Open-web research isn't configured. Use fetch_url on the lead's website instead.",
      };
    }

    // Resolve the primary domain: explicit input, else pick from attendee domains.
    let primaryDomain = input.domain?.trim().toLowerCase();
    if (!primaryDomain && input.attendeeEmails?.length) {
      const domains = [
        ...new Set(
          input.attendeeEmails.map(domainOf).filter((d): d is string => d !== null),
        ),
      ];
      if (domains.length) {
        const pick = await pickPrimaryDomain(input.leadName ?? "", domains);
        ctx.cost.add(pick.usage);
        primaryDomain = pick.domain;
      }
    }

    const { note, usage } = await researchLead({
      leadName: input.leadName,
      primaryDomain,
      attendeeEmails: input.attendeeEmails,
      perPerson: input.perPerson,
    });
    ctx.cost.add(usage);
    return { note, domain: primaryDomain ?? null };
  },
};

export const webTools = [fetchUrlTool, researchLeadTool];
