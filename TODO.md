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
- **Phase 6**: run history (`Run` persisted) + `/history` view + onboarding nudge.
- **Phase 7 (core)**: `ScheduledJob` + `/api/cron/tick`; idempotent enqueue (dedupeKey) + atomic claim (SKIP LOCKED) → fires exactly once. Capture sink → Run history.
- **CRM pipeline P1–P4** (see `docs/prd-crm-pipeline.md`): `CrmAdapter` + Pipedrive impl (per-user API token, encrypted, no migration); `/connections` paste-token screen (verified before save); `find_deal` tool (own-domain filter → contact lookup → highest deal id, unit-tested); `get_deal_context` tool + dedicated summarizer (raw email/notes/activities → one concise note, charged to run budget); `research_lead` tool — web-enabled-model research (Anthropic `web_search`, self-contained) + `pickPrimaryDomain` mini-AI. All three tools + token usage wired into `runWorkflow`. **P4 orchestrator**: `runPostMeeting(transcript, attendeeEmails)` seeds the full chain through the agent loop; scheduled failures re-enqueue via `jobs.retryLater` (attempt encoded in `dedupeKey`, capped, now+60s — unit-tested) instead of permanently failing.

## To do — no external accounts needed
- [x] Delivery: **Slack** incoming webhook (paste URL in `/connections`, verified with a test message, encrypted at rest); cron tick pushes the completed run's text. Email still TODO behind the same `deliverToUser`.
- [ ] Trigger producers: enqueue briefs ~30 min before calendar events; daily 8:00 cron. (Infra ready; need the producer + a real cron caller hitting `/api/cron/tick`.)
- [ ] Tighten the "to verify" labelling on web facts in the chat prompt.
- [ ] `CompanyResearchCache` (cache fetched company research by domain).
- [x] Approval-gate UI round-trip in chat: loop pauses on a `requiresApproval` tool and returns its `messages`; chat streams an `approval` event; UI shows Approve/Decline; `resumeWorkflow` settles the decision and continues (stateless — state round-trips through the client, Vercel-safe). Unit-tested (pause / resume-approve / resume-decline).
- [x] `create_event` tool (approval-gated) + Google `calendar.events` scope + `createCalendarEvent`. **Users must reconnect Google** (new scope needs fresh consent) and the OAuth consent screen must list `calendar.events`.

## To do — needs an external key/account
- [ ] **Anthropic API key** — get one at https://console.anthropic.com → put in `.env` as `ANTHROPIC_API_KEY`, set `LLM_PROVIDER="anthropic"` (+ `ANTHROPIC_MODEL="claude-sonnet-4-6"`) to verify the Claude provider path live. (Currently `.env` has only `OPENAI_API_KEY`; Anthropic is unset.)
- [ ] **`search_web`** (open-web search) — needs a search API key. Recommended: **Tavily** (free tier, LLM-friendly). Then add a `search_web` tool.
- [ ] **Recall.ai** account → live "meeting ended" webhook + transcript capture (Phase 4/7).
- [ ] **HubSpot** account → CRM write (note / next step / stage) behind approval gate. *(deferred to the end per decision)*

## Notes
- `.env` is git-ignored; `.env.example` lists all vars. Models live in env, not code.
- Supabase direct host is IPv6-only → use the pooler (`aws-1-eu-north-1.pooler.supabase.com`).
