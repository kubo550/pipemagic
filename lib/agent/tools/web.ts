import { z } from "zod";
import { fetchUrl } from "@/lib/integrations/web";
import type { Tool } from "@/lib/agent/tools/types";

/**
 * Keyless web enrichment (PRD Phase 5). `fetch_url` retrieves a public page and
 * returns its text — e.g. a company's site inferred from an attendee domain.
 * Read-only; web-sourced info must be cited and flagged "to verify" by the
 * agent (instructed in the system prompt). Broad open-web `search_web` needs a
 * search-API key and is added separately.
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

export const webTools = [fetchUrlTool];
