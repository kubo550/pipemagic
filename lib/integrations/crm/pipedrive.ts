import { env } from "@/lib/env";
import { getCrmApiToken } from "@/lib/integrations/crm/credentials";
import type {
  CrmAdapter,
  CrmActivity,
  CrmContact,
  CrmDeal,
  CrmEmailMessage,
  CrmNote,
} from "@/lib/integrations/crm/types";

/**
 * Pipedrive adapter (Pipedrive is the reference CRM). Auth = per-user API token
 * passed as `?api_token=` (decision §8). Returns the slim Crm* shapes; raw
 * Pipedrive JSON never leaves this file and the token is never logged.
 *
 * NOTE: response shapes below follow the Pipedrive v1 API as documented; verify
 * field names against the live API / the Daisy Zapier export before trusting in
 * production. Each mapper is defensive (optional chaining) so a shape drift
 * degrades to empty rather than throwing.
 */

export const PROVIDER = "pipedrive";

// ⚠️ Without include_body=1 the mailMessages endpoint truncates each message to
// the first ~225 characters. This is THE gotcha from the Daisy automation —
// keep it.
const INCLUDE_BODY = "1";

const TIMEOUT_MS = 15_000;

interface PipedriveEnvelope<T> {
  success?: boolean;
  data?: T;
}

async function request<T>(userId: string, path: string): Promise<T | null> {
  const token = await getCrmApiToken(userId, PROVIDER);
  if (!token) return null;

  const url = new URL(`${env.PIPEDRIVE_API_BASE}${path}`);
  url.searchParams.set("api_token", token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // Don't include the URL — it carries the api_token query param.
      throw new Error(`Pipedrive request failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as PipedriveEnvelope<T>;
    return json.data ?? null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a raw API token before we store it — hit a cheap authenticated
 * endpoint. Returns false on 401/network/timeout so the connect screen can
 * reject a bad token instead of saving it silently. Never logs the token.
 */
export async function verifyPipedriveToken(apiToken: string): Promise<boolean> {
  const url = new URL(`${env.PIPEDRIVE_API_BASE}/users/me`);
  url.searchParams.set("api_token", apiToken);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// --- Pipedrive payload shapes (only the fields we read) -----------------------

interface PdPersonItem {
  item?: { id?: number; name?: string | null };
  primary_email?: string | null;
}
interface PdDeal {
  id?: number;
  title?: string | null;
  stage_id?: number | null;
  status?: string | null;
  update_time?: string | null;
}
interface PdMailMessage {
  data?: {
    from?: { email_address?: string }[];
    to?: { email_address?: string }[];
    subject?: string | null;
    body?: string | null;
    message_time?: string | null;
  };
}
interface PdNote {
  id?: number;
  content?: string | null;
  add_time?: string | null;
}
interface PdActivity {
  id?: number;
  subject?: string | null;
  type?: string | null;
  due_date?: string | null;
  done?: boolean;
}

export const pipedriveAdapter: CrmAdapter = {
  name: PROVIDER,

  async searchContactsByEmail(userId, email): Promise<CrmContact[]> {
    const data = await request<{ items?: PdPersonItem[] }>(
      userId,
      `/persons/search?term=${encodeURIComponent(email)}&fields=email&exact_match=true`,
    );
    return (data?.items ?? [])
      .map((row): CrmContact | null => {
        const id = row.item?.id;
        if (id == null) return null;
        return {
          id: String(id),
          name: row.item?.name ?? null,
          email: row.primary_email ?? email,
        };
      })
      .filter((c): c is CrmContact => c !== null);
  },

  async listDealsForContact(userId, contactId): Promise<CrmDeal[]> {
    const data = await request<PdDeal[]>(
      userId,
      `/persons/${encodeURIComponent(contactId)}/deals?status=all_not_deleted`,
    );
    return (data ?? [])
      .map((d): CrmDeal | null => {
        if (d.id == null) return null;
        return {
          id: d.id,
          title: d.title ?? "(untitled deal)",
          stage: d.stage_id != null ? String(d.stage_id) : null,
          status: d.status ?? null,
          updatedAt: d.update_time ?? null,
        };
      })
      .filter((d): d is CrmDeal => d !== null);
  },

  async getDealEmails(userId, dealId): Promise<CrmEmailMessage[]> {
    const data = await request<PdMailMessage[]>(
      userId,
      `/deals/${dealId}/mailMessages?include_body=${INCLUDE_BODY}`,
    );
    return (data ?? []).map((m): CrmEmailMessage => {
      const d = m.data ?? {};
      return {
        from: d.from?.[0]?.email_address ?? "",
        to: (d.to ?? [])
          .map((t) => t.email_address ?? "")
          .filter((e) => e !== ""),
        subject: d.subject ?? null,
        sentAt: d.message_time ?? null,
        body: d.body ?? "",
      };
    });
  },

  async getDealNotes(userId, dealId): Promise<CrmNote[]> {
    const data = await request<PdNote[]>(userId, `/notes?deal_id=${dealId}`);
    return (data ?? [])
      .map((n): CrmNote | null => {
        if (n.id == null) return null;
        return {
          id: String(n.id),
          content: n.content ?? "",
          addedAt: n.add_time ?? null,
        };
      })
      .filter((n): n is CrmNote => n !== null);
  },

  async getDealActivities(userId, dealId): Promise<CrmActivity[]> {
    const data = await request<PdActivity[]>(
      userId,
      `/activities?deal_id=${dealId}`,
    );
    return (data ?? [])
      .map((a): CrmActivity | null => {
        if (a.id == null) return null;
        return {
          id: String(a.id),
          subject: a.subject ?? "",
          type: a.type ?? null,
          dueAt: a.due_date ?? null,
          done: a.done ?? false,
        };
      })
      .filter((a): a is CrmActivity => a !== null);
  },
};
