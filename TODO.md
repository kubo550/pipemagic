# PipeMagic — TODO / roadmap

Status snapshot of the phased build (see the PRD for full detail). Stack: Next 16
(App Router) · Prisma 6 + Supabase (pooler/IPv4) · own Google OAuth · LLM
abstraction (OpenAI default `gpt-4o-mini`, Anthropic behind the same interface).

> **Product direction:** generic meeting/conversation-prep assistant driven by the
> user's **About me**, NOT sales-only. CRM is one optional sink, deferred to the end.

## Done ✅
- **Phase 1 — Foundation**: Google OAuth (offline, encrypted tokens, refresh), session, redacting logger.
- **Phase 2 — Engine + context skeleton**: LLM abstraction + adapters, agent loop (iteration + cost guards + approval gate), calendar tools, context entities, `buildContext()`, Vitest (loop passes for both providers).
- **Phase 3 — Walking skeleton**: streaming `/api/chat` + `runWorkflow`, shadcn chat UI, meeting brief with source citation.
- **About me + app shell**: `UserProfile`, generic system prompt, shadcn left-nav (Assistant / Post-meeting / About me; Usage/Billing placeholders).
- **Phase 4 (account-free)**: transcript → follow-up draft + summary + next steps; atomic fact extraction → memory (approval-gated save); generalized `Fact` (optional deal, optional meeting anchor).
- **Phase 5 (account-free)**: `fetch_url` web enrichment (SSRF-guarded) + `[web: …]` citations.

## To do — no external accounts needed
- [ ] **Phase 6 — Onboarding + run history**: persist each `Run` to DB; History view; onboarding nudge/flow to fill About me. *(in progress)*
- [ ] **Phase 7 (core) — Proactive**: `ScheduledJob` + cron tick + queue → `runWorkflow`; idempotency/dedupe/atomic claim. (Recall webhook part needs an account — below.)
- [ ] Tighten the "to verify" labelling on web facts in the chat prompt.
- [ ] `CompanyResearchCache` (cache fetched company research by domain).
- [ ] Approval-gate UI round-trip in chat (loop already supports `awaiting_approval`).

## To do — needs an external key/account
- [ ] **Anthropic API key** — get one at https://console.anthropic.com → put in `.env` as `ANTHROPIC_API_KEY`, set `LLM_PROVIDER="anthropic"` (+ `ANTHROPIC_MODEL="claude-sonnet-4-6"`) to verify the Claude provider path live. (Currently `.env` has only `OPENAI_API_KEY`; Anthropic is unset.)
- [ ] **`search_web`** (open-web search) — needs a search API key. Recommended: **Tavily** (free tier, LLM-friendly). Then add a `search_web` tool.
- [ ] **Recall.ai** account → live "meeting ended" webhook + transcript capture (Phase 4/7).
- [ ] **HubSpot** account → CRM write (note / next step / stage) behind approval gate. *(deferred to the end per decision)*

## Notes
- `.env` is git-ignored; `.env.example` lists all vars. Models live in env, not code.
- Supabase direct host is IPv6-only → use the pooler (`aws-1-eu-north-1.pooler.supabase.com`).
