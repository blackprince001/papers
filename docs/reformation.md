---
type: Assessment
title: Project Reformation — Pitfalls, Improvements, and Feature Considerations
description: A whole-project review of usage-side pitfalls, backend improvements worth a rewrite, and feature ideas — derived from the OKF codebase index. Drives follow-up ADRs and the deep-research feature plan.
tags: [assessment, review, planning, pitfalls, features]
timestamp: 2026-06-28T00:00:00Z
---

A whole-project review of the `papers` codebase, derived from documenting it as
an OKF bundle. Groups: [usage-side pitfalls](#usage-side-pitfalls),
[backend improvements](#backend-pitfalls--improvements), [feature
considerations](#feature-considerations), and [additional things to
consider](#additional-things-to-consider). Each item cites the concept it came
from. Items marked **ADR candidate** should become an entry under
[/decisions/](/decisions/index.md) when acted on.

The flagship forward-looking feature —
[deep research](/features/deep-research.md) — is referenced where it overlaps
with backend improvements and feature considerations below.

# Usage-side pitfalls

1. **BYO provider is a hard cold-start** — The only server-side key is
   `GOOGLE_API_KEY`, used strictly for embeddings
   ([/backend/config.md](/backend/config.md)). A brand-new user who hasn't
   configured `UserAISettings` + a default provider gets **zero** AI features
   — no summaries, findings, reading guides, highlights, or chat — until they
   bring their own API key, even though the marketing site advertises
   "AI-Powered Reading" as the headline value. *Mitigation*: allow
   `GOOGLE_API_KEY` (already present server-side) to double as a metered
   default/trial provider so users taste the AI immediately and graduate to
   BYO for volume. *See feature consideration #1.*

2. **Semantic search is globally Google-bound** — Even a user who picks
   OpenAI/Anthropic for chat still depends on `GOOGLE_API_KEY` being present
   server-side — embeddings are not in the BYO system
   ([/backend/services/services-catalog.md](/backend/services/services-catalog.md)).
   If that key is missing or quota-exhausted, `/search` semantic mode, the
   `rag_tool`, and recommendation features silently degrade for **everyone**,
   with no in-product signal. At minimum surface "semantic search unavailable
   (no server embedding key)" in the UI.

3. **AI retry is opaque and slow** — Celery AI tasks are globally rate-limited
   `10/m` ([/backend/tasks.md](/backend/tasks.md)) and `retry_incomplete_ai`
   only sweeps every 10 minutes. A user who uploads a batch of papers waits up
   to 10 min for summaries on transient failures, with no UI visibility.
   Discovery already pushes progress over Redis — paper-processing doesn't.
   *Fix*: paper-processing should emit Redis progress events too.

4. **401 → silent refresh → fallback to clear-auth is too aggressive** —
   `fetchApi` treats any 401 as "try `/auth/refresh`, on failure clear session"
   ([/frontend/api-layer.md](/frontend/api-layer.md)). A single transient 401
   (clock skew, a backend hiccup, an access token whose refresh cookie is also
   expired) tears down the session and redirects to `/login`. There's no
   "this looks like a backend issue, just retry with backoff" middle path.

5. **Streaming `RATE_LIMIT` arrives mid-stream with limited recovery** — The
   structured `ERROR_CODE_RATE_LIMIT`
   ([/decisions/structured-ai-errors.md](/decisions/structured-ai-errors.md))
   is good, but the user got half a response. `useChatStream` exposes `retry`
   but only for the user to click; no backoff guidance, no auto-retry affordance
   for transient rate limits ([/frontend/chat-system.md](/frontend/chat-system.md)).

6. **PDF dark mode is visual inversion** — `invert(1) hue-rotate(180deg)` on
   `.react-pdf__Page canvas` with `usePdfDarkMode` refining image regions
   ([/frontend/pdf-reader.md](/frontend/pdf-reader.md)). Works for text-heavy
   PDFs but renders colored figures, syntax-highlighted code listings, and
   already-dark PDFs incorrectly. A true dark-PDF path (per-page reflow or a
   theme-aware renderer) would be a larger but cleaner fix.

7. **Heat-of-the-session tab loss** — Tabs persist to `localStorage`
   `nexus-tabs`, max 10 with last-5
   ([/frontend/state-management.md](/frontend/state-management.md)).
   Device/browser changes lose them, and there's no server-side "recently
   opened." A small `recent_papers` table [scoping concept].

# Backend pitfalls / improvements

1. ✅ **Done 2026-07-01** ([ADR](/decisions/migrations-own-schema.md)) —
   **`init_db()` runs `Base.metadata.create_all` alongside Alembic**
   ([/backend/database.md](/backend/database.md)) — In production this is
   anti-pattern: `create_all` on every startup masks schema drift and overlaps
   with `alembic upgrade head`. **ADR candidate**: `init_db()` should only
   `CREATE EXTENSION IF NOT EXISTS vector`; migrations own the schema.

2. **Almost zero route/DB-integration tests** ([/backend/tests.md](/backend/tests.md))
   — all 10 test files target the AI agent layer. Ingestion, auth, sharing,
   paper CRUD, citation extraction — the load-bearing business logic — has no
   automated coverage. **Highest-ROI investment**: a pytest fixture with a
   test Postgres (testcontainers) + smoke tests on `/auth/google`,
   `/ingest/urls`, `/papers`, `/groups/share`.

3. ✅ **Done 2026-07-01** ([ADR](/decisions/http-error-envelope.md)) —
   **No global error envelope** ([/backend/entry-point.md](/backend/entry-point.md))
   — no custom exception handlers; routes raise `HTTPException` directly, so
   the wire format is `{"detail": "..."}` everywhere. The chat layer already
   has a beautifully structured error-code taxonomy
   ([/decisions/structured-ai-errors.md](/decisions/structured-ai-errors.md))
   — the inconsistency is jarring. Add a global handler producing
   `{code, message, details}` so the frontend can do typed HTTP-error handling
   too. **ADR candidate** (mirror the SSE pattern at HTTP level).

4. **Dual CRUD locations** ([/backend/crud.md](/backend/crud.md)) — newer
   per-user AI entities live in top-level `crud/`, everything else lives in
   `api/crud/`. Consolidate into one `crud/<domain>.py` package before the
   codebase grows further.

5. **Two parallel AI abstractions** — `BaseAIService` + `AIProvider` ABC + the
   registry (legacy, [/backend/services/ai-providers.md](/backend/services/ai-providers.md))
   **plus** `MultiProviderBuilder` + `OpenAIProvider` from the openai-agents SDK
   ([/backend/services/ai-agent.md](/backend/services/ai-agent.md));
   `services/ai/base_ai_service.py` is literally a legacy shim. All five
   registered providers are OpenAI-compatible now, so the legacy
   `provider.generate()` path
   ([/decisions/optional-agents-sdk.md](/decisions/optional-agents-sdk.md)) may
   be dead weight. Pick one; sunset the shim. **ADR candidate** (reverse of
   the optional-SDK decision — or a refinement).

6. **Global Celery rate limit, not per-user** ([/backend/tasks.md](/backend/tasks.md))
   — `10/m` across **all** users. One user bulk-ingesting 50 papers starves
   everyone else's AI. Move to a Redis token bucket per `user_id`. *This also
   unblocks the [deep-research](/features/deep-research.md) per-user daily
   cap — see its plan.*

7. **DLQ recovery is manual** — `POST /tasks/dead-letter/{task_id}/requeue`
   ([/backend/api/infra.md](/backend/api/infra.md)) requires an admin to
   notice and act. Add automated retry with exponential backoff before going
   to DLQ, plus an admin-visible DLQ metric.

8. **No per-provider HTTP timeout enforcement** — `AGENT_MAX_TURNS=25` + Celery
   soft/hard time limits (300/360s) bound a run, but a user-configured slow
   `base_url` can hang a worker slot until the hard limit. Add per-request
   `httpx`/provider timeouts.

9. ✅ **Done 2026-07-01** ([ADR](/decisions/separate-encryption-key.md);
   the hard-fail-in-prod part was declined by the owner — warn-and-generate
   stays) — **Fernet keyed from `JWT_SECRET_KEY`** ([/backend/security.md](/backend/security.md))
   — rotating the JWT secret **destroys** all encrypted user AI keys (they
   become undecryptable). Destructive coupling. **ADR candidate**: use a
   separate `AI_KEY_ENCRYPTION_KEY` (or KMS-derived). Related: `JWT_SECRET_KEY`
   auto-generated in DEBUG **and still auto-generated with a warning out of
   DEBUG** — should hard-fail in prod if unset.

10. **Admin bootstrap is env-bound** ([/backend/entry-point.md](/backend/entry-point.md))
    — `seed_admin_user` reads base64 env vars. Works for one admin; no
    first-run setup flow. Either promote a normal user to admin via
    `PATCH /users/{id}` or add a first-run-wizard; drop the base64 env pattern.

11. **Sync engine doubles driver surface** — Two SQLAlchemy engines (async
    asyncpg for FastAPI, sync psycopg2 for Celery —
    [/backend/database.md](/backend/database.md)). Celery ≥5.3 supports async
    tasks; a move to `psycopg[c]` async-only would drop psycopg2.

12. **`stream_db_session()` opens a second connection per stream**
    ([/decisions/stream-db-session.md](/decisions/stream-db-session.md)) —
    necessary, but at high chat concurrency the asyncpg pool can saturate.
    Size and monitor the pool; the deep-research streaming path
    ([/features/deep-research.md](/features/deep-research.md)) will increase
    stream volume.

# Feature considerations

1. **Guided BYO onboarding + free trial via Google** — First-run detection of
   empty `UserAISettings` → walk the user through provider setup with the
   `/ai/providers/test` smoke test. Offer a metered Google-Gemini default so
   new users get value before configuring anything. *Addresses the #1
   usage-side pitfall.*

2. **Inline citation-map expansion** — You already have `@xyflow/react` map +
   Semantic Scholar neighbors + `citation_map_service` (see
   [/frontend/components.md](/frontend/components.md),
   [/backend/services/services-catalog.md](/backend/services/services-catalog.md)).
   From any node in the map, let the user "Expand neighbors" / "Add to library"
   inline rather than bouncing to `/discovery`. The pieces are already there.

3. **Ad-hoc multi-paper chat** — `MultiChatSession` is group-scoped
   ([/backend/models.md](/backend/models.md)). Allow selecting N papers across
   groups for a one-off "research session" — relax the `group` FK to nullable.

4. **Saved-search subscriptions** — `SavedSearch` exists
   ([/backend/models.md](/backend/models.md)) but doesn't re-run. Schedule
   saved searches via Celery beat, surface new results via Resend email + an
   in-app notification. Reuses the existing email + task infra.

5. **Annotations/highlights export** — `/papers/export` covers CSV/JSON/BibTeX
   ([/backend/api/papers.md](/backend/api/papers.md)). Power users want their
   highlights as Markdown/Obsidian/Notion for note-taking outside the app.

6. **Reading streaks + weekly digest** — You already track `ReadingSession`
   server-side ([/frontend/hooks.md](/frontend/hooks.md)) and have a
   Dashboard. A weekly digest via Resend could compound retention.

7. **Admin ops dashboard** — `/health` is a ping; `/statistics/dashboard` is
   user-scoped. Add an admin page showing Celery queue depth, DLQ size, AI
   provider error rates, per-user usage — backed by a `/metrics` endpoint.

8. **Provider-based citation extraction** — `citation_extractor.py`
   ([/backend/services/services-catalog.md](/backend/services/services-catalog.md))
   parses reference sections with heuristics — fragile across journals. Since
   users already have an AI provider configured, route citation extraction
   through their provider and validate against Semantic Scholar.

9. **Passkey / magic-link login** — Only Google OAuth + admin env login today
   ([/backend/security.md](/backend/security.md)). Self-hosters who don't want
   Google in the loop can't easily adopt. A passkey or email magic-link path
   (the Resend integration is already there — see
   [/backend/services/services-catalog.md](/backend/services/services-catalog.md))
   would broaden adoption.

10. **[Deep research](/features/deep-research.md)** — Multi-step, source-backed
    research sessions driven by an agent against an external MCP server, with
    a per-user daily cap and a per-deployment feature flag. Tracked as the
    flagship feature plan under [/features/](/features/index.md). Its
    prerequisites touch backend pitfalls #6 (per-user rate limit) and #9
    (separate encryption key), and overlap with feature #4 (saved-search
    subscriptions and deep-research could share a scheduling + notification
    pipeline).

# Additional things to consider

1. **`.gitignore` had `*.md` blanket-ignoring the whole bundle** — This
   ignored ALL markdown repo-wide — CLAUDE.md, the `docs/` OKF bundle,
   AGENTS.md — so OKF edits never appeared in `git status`, silently defeating
   the point of a versioned knowledge bundle. **Fixed as part of this
   reformation**: `docs/`, `docs/**`, and `CLAUDE.md` are now explicitly
   re-included via `!` negations. Keep this in mind when adding markdown
   elsewhere in the repo.

2. **Two Vite apps with zero shared code** — `frontend-v2/` and `landing/`
   both use React 19 + Tailwind v4 + Radix (see [/landing/app.md](/landing/app.md)
   and [/frontend/build-config.md](/frontend/build-config.md)). If the landing
   site changes more than occasionally, a `packages/ui` workspace would
   prevent style drift; if it's set-and-forget, duplication is fine.

3. **Observability is thin** — structlog is good (see
   [/backend/core.md](/backend/core.md)) but there are no metrics, no tracing.
   A `/metrics` (Prometheus) endpoint + Celery Flower-style task metrics would
   meaningfully help self-host ops. Overlaps with feature #7.

4. ✅ **Done 2026-07-01** (PolyForm Noncommercial 1.0.0 at repo-root
   `LICENSE`, owner blackprince001 — allows use and personal modification,
   bans commercial use) — **No LICENSE file** — README says "personal project, fork and customize,"
   but anyone who actually wants to fork/self-host needs a real license
   (MIT/Apache/AGPL). Without it, the default is "all rights reserved."

5. **Self-hosting assumes Google** — README's prerequisite list requires
   `GOOGLE_API_KEY` + `GOOGLE_CLIENT_ID`. A "no-Google" path (admin-only mode
   + passkeys + provider-only AI, accepting that semantic search degrades)
   would widen the self-host audience. Tied to feature #9.

6. **i18n is absent** — Everything in the frontend is English string literals
   (see [/frontend/components.md](/frontend/components.md)). If multilingual
   support is ever in scope, retrofitting i18n across `components/`, `pages/`,
   and `lib/` is substantial — worth deciding proactively.

7. **OKF link-rot risk (now mitigated)** — Because `docs/` was gitignored,
   renames in the bundle wouldn't show up in `git status`, so cross-links could
   silently break over time. With #1 fixed, the bundle is version-controlled
   and `git diff` will catch renames. Running a periodic OKF link-checker is
   still a good idea (cross-links are deliberately tolerant of broken links —
   see [/index.md](/index.md) — but you want to know when they break).

8. ✅ **Done 2026-07-01** (resolved by *removal*: the revised deep-research
   approach won't need an external MCP config, so the three vars were dropped
   from `.env.example` and both compose files) —
   **`ENABLE_DEEP_RESEARCH` env vars are drift** — `DEEP_RESEARCH_MODEL` /
   `_MCP_URL` / `_MCP_TOKEN` are in the compose env but **not** `Settings`
   fields ([/backend/config.md](/backend/config.md)). Either add them to
   `Settings` (the [deep-research](/features/deep-research.md) plan calls for
   this) or drop them until deep-research lands for real.

# Follow-up tracking

+ **ADR candidates**: backend pitfalls #1, #3, #5, #9 → add to
  [/decisions/](/decisions/index.md) when acted on.
+ **Feature plans**: deep-research is tracked at
  [/features/deep-research.md](/features/deep-research.md); features #1–9
  above can graduate into their own `Feature Plan` concepts as they're taken
  up.

# Citations

[1] OKF bundle root — [/index.md](/index.md).
[2] Deep research feature plan — [/features/deep-research.md](/features/deep-research.md).
[3] Existing ADRs — [/decisions/](/decisions/index.md).
