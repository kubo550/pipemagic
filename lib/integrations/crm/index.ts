import { prisma } from "@/lib/db";
import { pipedriveAdapter, PROVIDER as PIPEDRIVE } from "@/lib/integrations/crm/pipedrive";
import type { CrmAdapter } from "@/lib/integrations/crm/types";

/**
 * CRM adapter registry. Picks the adapter for whichever CRM the user has
 * connected — mirrors how `getProvider()` selects the LLM. Phase 1 ships only
 * Pipedrive; adding a CRM = register its adapter here and store its token.
 */

const ADAPTERS: Record<string, CrmAdapter> = {
  [PIPEDRIVE]: pipedriveAdapter,
};

/**
 * The CRM adapter for a user, or null if they haven't connected one. We look
 * for any stored CRM credential (an `OAuthToken` whose provider is a known
 * adapter) and return the matching adapter.
 */
export async function getCrmAdapter(userId: string): Promise<CrmAdapter | null> {
  const rows = await prisma.oAuthToken.findMany({
    where: { userId, provider: { in: Object.keys(ADAPTERS) } },
    select: { provider: true },
  });
  for (const row of rows) {
    const adapter = ADAPTERS[row.provider];
    if (adapter) return adapter;
  }
  return null;
}

export type { CrmAdapter } from "@/lib/integrations/crm/types";
