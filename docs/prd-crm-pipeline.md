# PRD — CRM-driven post-meeting pipeline

> Replaces the Daisy/Zapier automations (deal-finding, deal-context extraction,
> lead research) with composable **agent tools** inside PipeMagic. The agent
> loop orchestrates them; nothing is a hard-coded linear pipeline. Talkie is the
> reference tenant, Pipedrive the reference CRM — both behind interfaces so other
> tenants/CRMs slot in later.

## 0. Background & principle

The Zapier flows are a rigid chain: *find deal → pull emails → research → write*.
PipeMagic already has the better substrate: `runAgentLoop` (`lib/agent/loop.ts`)
drives provider-agnostic tool calls with iteration + cost guards and an approval
gate. So we **port each Zapier automation to a `Tool`**, and let the loop decide
when to call it. The post-meeting *orchestrator* gives the agent the right tools
and a goal; it does not re-encode Zapier's step order.

Reused, unchanged, as-is patterns:
- `Tool { name, description, schema (zod), requiresApproval?, execute(input, ctx) }` — `lib/agent/tools/types.ts`
- Integration adapter style — `lib/integrations/google.ts` (token load via `userId`, slim shapes out, raw payloads never logged/leaked)
- Encrypted OAuth tokens at rest — `OAuthToken` + `lib/auth/crypto.ts` (AES-256-GCM)
- Second, structured-output LLM call for summarization — same shape as `draftFollowUp` (`lib/workflows/post-meeting.ts`)
- Retry/scheduling — `ScheduledJob` + `/api/cron/tick` (dedupeKey + atomic claim), used instead of Zapier's `sleep`-then-retry

## 1. Scope

In: CRM adapter (Pipedrive), `find_deal`, `get_deal_context` (+ summarizer),
`search_web` + domain-picker, post-meeting orchestrator wiring, one delivery
channel. Out (later): HubSpot adapter, MCP exposure, multi-CRM token UI polish.

## 2. CRM abstraction

```ts
// lib/integrations/crm/types.ts
export interface CrmContact { id: string; name: string | null; email: string; }
export interface CrmDeal { id: number; title: string; stage: string | null; status: string | null; updatedAt: string | null; }
export interface CrmEmailMessage { from: string; to: string[]; subject: string | null; sentAt: string | null; body: string; }
export interface CrmNote { id: string; content: string; addedAt: string | null; }
export interface CrmActivity { id: string; subject: string; type: string | null; dueAt: string | null; done: boolean; }

export interface CrmAdapter {
  readonly name: string;                                  // "pipedrive"
  searchContactsByEmail(userId: string, email: string): Promise<CrmContact[]>;
  listDealsForContact(userId: string, contactId: string): Promise<CrmDeal[]>;
  getDealEmails(userId: string, dealId: number): Promise<CrmEmailMessage[]>;
  getDealNotes(userId: string, dealId: number): Promise<CrmNote[]>;
  getDealActivities(userId: string, dealId: number): Promise<CrmActivity[]>;
}
```

`getCrmAdapter(userId)` → picks adapter from the user's connected CRM token
(`OAuthToken.provider`), mirroring how `getProvider()` selects the LLM. Phase 1
ships only the Pipedrive impl; the registry makes a second CRM additive.

### 2.1 Pipedrive adapter — `lib/integrations/crm/pipedrive.ts`

- Auth: API token (simplest) or OAuth. Token stored encrypted in `OAuthToken`
  (provider `"pipedrive"`); loaded per-`userId` like Google. `env` gains
  `PIPEDRIVE_API_BASE` (default `https://api.pipedrive.com/v1`).
- Endpoints:
  - `GET /persons/search?term={email}&fields=email&exact_match=1`
  - `GET /persons/{id}/deals` (or `GET /deals?person_id=`)
  - `GET /deals/{id}/mailMessages?include_body=1` ⚠️ **without `include_body=1` the API truncates each message to 225 chars** — keep as a named constant + comment so nobody drops it.
  - `GET /deals/{id}/notes`, `GET /deals/{id}/activities`, (later) `/files`
- Returns slim CRM* shapes; raw Pipedrive JSON never leaves the adapter, never logged.
- On transient failure (5xx / network): throw — the *tool* layer decides retry
  (loop isolates a failed tool) and the *scheduler* owns the delayed retry.

## 3. Tools

### 3.1 `find_deal` — `lib/agent/tools/crm.ts`  *(read-only, no approval)*

```
input:  { attendeeEmails: string[], ownDomains?: string[] }
output: { dealId: number | null, title?: string, candidates: number, checkedEmails: number }
```

Logic (ports the Zapier flow):
1. Drop emails on the user's own domain(s). Default own-domains from the user's
   email (`User.email` domain) + optional `ownDomains` override → handles Talkie's
   "remove @talkie.ai attendees".
2. For each remaining email: `searchContactsByEmail` → for each contact
   `listDealsForContact` → collect deal ids. Per-email try/catch so one failure
   doesn't sink the loop (Zapier's "check all people" guarantee).
3. **Sort collected deal ids descending, take the highest** = newest/most-current
   deal (the documented heuristic). Return it + how many candidates/emails seen.
4. Empty → `dealId: null` (agent then asks the user or proceeds without CRM).

### 3.2 `get_deal_context` — `lib/agent/tools/crm.ts`  *(read-only)*

```
input:  { dealId: number, include?: ("emails"|"notes"|"activities")[] }   // default all
output: { note: string, counts: { emails, notes, activities } }
```

- Pulls emails (`include_body=1`), notes, activities via the adapter.
- **Two-stage LLM**: raw history → a dedicated *summarizer* call
  (`lib/workflows/deal-summary.ts`, cheap model, structured output like
  `draftFollowUp`) → one concise note. We do **not** feed raw email history to the
  writer AI — it's noise and the writer already has lots of context.
- Returns the note only; the writer consumes the note, not the transcript dump.

### 3.3 `research_lead` — extend `lib/agent/tools/web.ts`  *(approval-gated)*

- Add `search_web` (Tavily; key in env) alongside existing keyless `fetch_url`.
- Domain pick: small structured call `pickPrimaryDomain(leadName, domains[])`
  (`lib/workflows/domain-pick.ts`) — resolves "which attendee domain is the lead"
  better than Zapier's hack.
- Output a research note (company + optionally per-attendee), labelled "to verify"
  per the existing web-grounding rule in the system prompt.

## 4. Orchestrator — `lib/workflows/run.ts`

Add the three tools to the loop's tool list and extend the system prompt with the
post-meeting goal: *given a transcript + attendee emails, find the deal, pull its
context, research the lead, then draft the follow-up grounded in all of it.*
`onEvent` already streams `Looking at find_deal…` etc. — free progress UI.

Scheduled path is identical (it's the same `runWorkflow`): a `ScheduledJob`
fires post-meeting; transient CRM failure → re-enqueue with `runAt = now + 60s`
(replaces Zapier's wait-and-retry), capped retries.

## 5. Data / schema

`Company / Deal / Stakeholder / Meeting / Fact` already exist (empty). Minimal add:
- `Deal.externalId` + `Deal.source` ("pipedrive") so a found CRM deal maps to a
  local `Deal` (cache + Fact anchoring). Optional in Phase 1 — `find_deal` can
  return the id without persisting first.
- `CompanyResearchCache` (domain → note + fetchedAt) — already in TODO; cheap win
  so we don't re-research the same company per meeting.

## 6. Security / guardrails

- CRM token encrypted at rest (reuse `crypto.ts`); never logged.
- `find_deal` / `get_deal_context` read-only → no approval. `search_web` and any
  future CRM **write** → `requiresApproval: true` (loop already pauses).
- Own-domain filtering must be robust (subdomains, casing) — it's the privacy line
  that keeps internal attendees out of CRM lookups.

## 7. Build order

1. **CRM adapter + `find_deal`** — adapter types, Pipedrive impl, `getCrmAdapter`, tool, unit test of the sort-descending/own-domain-filter logic (mock adapter). ← start here
2. **`get_deal_context` + summarizer** — needs a deal id from step 1.
3. **`research_lead`** (`search_web` + domain pick) — mostly extends existing web tool.
4. **Orchestrator wiring** in `runWorkflow` + scheduled retry path.
5. **Delivery channel** (email/Slack) for scheduled runs.

## 8. Decisions (resolved 2026-06-25)

- **Pipedrive auth → per-user API token, pasted by the user.** Stored encrypted in
  `OAuthToken` (provider `"pipedrive"`, token in `accessTokenEnc`, `scope="api_token"`,
  placeholder refresh + far-future expiry — no migration). A connect screen lets the
  user paste it. Auth on requests via `?api_token=`.
- **Search → internet-enabled model directly** (no Tavily). `research_lead` hands the
  model the inputs + a research prompt; `fetch_url` stays as the keyless fallback.
- **Own-domain → configurable list.** `find_deal` takes `ownDomains?: string[]`;
  default = `User.email` domain + optional env `OWN_EMAIL_DOMAINS` (comma-sep). A
  per-user UI setting can replace the env later.
- **Found deals → stateless.** `find_deal` returns the id without persisting a local
  `Deal`. Local persistence + `Deal.externalId` defer to the CRM-write phase.
