---
type: Feature Plan
title: Reader and AI Experience Reformation
description: A gated, file-level implementation blueprint for the PDF reader, AI chat presentation, thinking states, duotone iconography, illustrated empty states, and a secure conversational deep-research rewrite.
tags: [feature-plan, reader, pdf, chat, deep-research, icons, empty-states, ai, accessibility]
timestamp: 2026-08-29T00:00:00Z
status: in-progress
---

# Status

**In progress.** Deep-research safety work is underway; Phase 5 shared AI
presentation and Phase 6 icon implementation are complete. Phase 7 illustrated
empty states is now open at EMPTY-01.

This is the working contract for the next Lumen experience pass. It turns the
requested direction into staged changes that can remain buildable and reviewable
throughout the work. Update this document before implementation whenever scope or
a decision changes.

# Destination

Lumen should feel like one coherent research workspace:

- the PDF reader makes selecting, marking, revisiting, and asking about passages
  reliable;
- ordinary paper chat and deep research use the same clear, expressive AI
  presentation language;
- agent activity is understandable without exposing raw private reasoning;
- icons are larger, consistent, and duotone where the context supports it;
- empty states explain the next useful action through restrained illustration and
  motion;
- deep research is a secure, resumable, source-backed conversation rather than a
  long opaque one-shot job.

The delivery order matters. Deep research currently has cross-tenant tool access
and broken resume semantics. Those issues are release blockers and take priority
over visual additions.

# Decisions in this plan

1. **Preserve Lumen's reader shell.** Port the learning app's stronger highlight
   lifecycle and grounding model. Do not copy its whole reader or app shell.
2. **Spike EmbedPDF behind the existing viewer interface.** Replace pdf.js only
   if a measured comparison proves better selection accuracy without unacceptable
   regressions in startup, scrolling, old annotations, dark mode, zen mode, or
   accessibility.
3. **Own the AI presentation layer.** Beautiful UI is a reference and code source,
   not a framework dependency. Selected patterns are rewritten around Lumen's
   tokens, HeroUI facades, icon API, streaming model, and accessibility contract.
4. **Use Thinking Orbs narrowly.** A project-owned wrapper may represent meaningful
   agent states. It does not replace ordinary loading spinners.
5. **Keep the icon call-site API stable.** Duotone layers belong in the icon factory
   and glyph definitions so the migration does not become a mandatory 103-file API
   rewrite.
6. **Rewrite the deep-research vertical slice, not the product stack.** Keep
   FastAPI, Postgres, Celery, BYO provider resolution, academic discovery adapters,
   the route family, and shared frontend primitives. Replace the unsafe run-state,
   replay, evidence, authorization, and orchestration internals.
7. **Use one bounded workflow, not a fictional team of agents.** Code owns phases,
   budgets, permissions, persistence, and verification. Models plan and synthesize
   within typed boundaries.
8. **Do not expose raw chain-of-thought.** The UI receives curated progress events,
   tool summaries, sources, and verifier outcomes.

# Assumptions and approval gates

The plan proceeds with these assumptions unless they are changed before the
corresponding ticket starts:

- “Entire app” means the authenticated `frontend-v2` SPA. The separate `landing/`
  marketing application is out of scope for this pass.
- Existing public deep-research route paths remain stable where practical. Response
  fields may be extended additively; changed stream semantics get an explicit
  compatibility transition.
- Existing completed deep-research reports remain readable after migration. Raw SDK
  checkpoints and Redis-list replay do not need to be migrated as active runs.
- Existing annotations remain the single mark/highlight resource. There will not be
  a competing “highlights” subsystem.
- Deep-research follow-ups expose an explicit choice between **Ask this research**
  (answer from the existing evidence ledger) and **Research further** (start a new
  bounded research generation). Hidden automatic cost escalation is not acceptable.

Approval is required at these gates:

1. **ReUI license gate.** ReUI's requested duotone icons are paid, authenticated
   registry content under a commercial seat license. Before using their actual SVG
   geometry, provide/confirm a valid license and an approved way to retrieve and
   retain the assets. Without that, implement the requested duotone direction as a
   project-owned evolution of Lumen's current glyphs.
2. **Reader engine gate.** Approve an EmbedPDF cutover only after the comparison
   report and browser demo.
3. **Deep-research data gate.** Confirm whether administrators may inspect another
   user's research content. The recommended default is **no**; support access should
   use explicit audited elevation rather than `user_id = NULL` behavior. Also choose
   the migration disposition for existing orphaned rows: the recommendation is delete
   or quarantine under an explicit audited retention process, never assign them to an
   administrator.
4. **Illustration direction gate.** Approve one small art direction sheet before
   producing all empty-state illustrations.

# Current baseline

## Stack

- Backend: Python 3.13, FastAPI `>=0.128`, SQLAlchemy `>=2.0.45`, Pydantic
  `>=2.12.5`, Celery `>=5.4`, Redis, Postgres 16 + pgvector, OpenAI Agents SDK.
- Main frontend: React 19.2, TypeScript 5.9, Vite 7.2, Tailwind 4.3, HeroUI 3.2,
  Motion 12.25, TanStack Query 5.
- Reader: `react-pdf@10.4.1`, `pdfjs-dist@5.4.296`, `pdf-lib@1.17.1`,
  `@tanstack/react-virtual@3.13.26`.
- Current icon system: 109 project-owned outline glyphs on a 24×24 grid, one
  `createIcon` factory, one barrel, 103 importing call-site files.
- Frontend verification: build, ESLint, standards audit, `/dev/icons`, and
  `/dev/ui`; there is currently no frontend unit, component, browser, or visual
  regression suite.

## Reader strengths to preserve

Lumen already has virtualized continuous scrolling, velocity-aware buffering,
thumbnail virtualization, search, outline navigation, rotation, authenticated file
loading, normalized multi-line annotation geometry, responsive margin/inline
annotations, zen mode, dark reading, permissions, sharing, eight mark themes,
deep links, reading sessions, per-paper tabs, and a persistent right rail.

## Learning-app behavior to adapt

The sibling learning app has a stronger selection/highlight lifecycle:

- glyph-derived multi-line selection geometry through EmbedPDF;
- explicit draft, committing, failed, persisted, selected, deleting, asking, and
  saved-answer states;
- optimistic marks that remain visible with Retry when creation fails;
- at-mark recolor and note editing;
- measured responsive margin-note stacking with linked focus/hover;
- five-second deferred deletion with undo;
- reading-position restore where explicit `?page=` navigation wins;
- cached, streamed explanations grounded in a stored passage/evidence model.

Its EmbedPDF path adds roughly 434 KB viewer JavaScript, 709 KB worker JavaScript,
and 4.63 MB PDFium WASM. That cost must be earned.

## Deep-research release blockers

The audit confirmed:

- several agent tools read papers across tenants without the shared visibility
  filter, including metadata, citations, library search, and vector search;
- resumed streams replay old terminal events and close before new work arrives;
- recoverable errors are emitted as terminal errors before retry decisions;
- the `research` queue shares the same worker processes, so it does not reserve
  capacity from interactive AI work;
- start/resume/delete are not atomic or idempotent and lack a generation lease or
  cooperative cancellation;
- all surfaced search results are labeled citations without claim-level evidence;
- the workflow is a single broad loop with no durable plan/evidence/verifier phases;
- there are no per-user concurrency, request-size, event-size, or cost controls;
- model-produced URLs can reach ingestion, whose PDF downloader lacks sufficient
  SSRF and download bounds;
- there are no deep-research tests or eval release gates.

# Success criteria

## Reader

1. A selected passage produces stable normalized rectangles for multi-line text,
   zoom, mixed page sizes, and rotations at 0/90/180/270 degrees.
2. Failed annotation creation leaves a recoverable draft. A user can retry or
   discard it without reselecting text.
3. Annotation deletion can be undone for five seconds and commits on expiry or
   unmount.
4. Margin notes do not overlap at supported desktop widths; the same actions remain
   available inline at smaller widths.
5. An explicit page/focus deep link wins over stored reading position; otherwise the
   last stable page restores without page-one overwrite.
6. Existing annotations replay correctly after any engine cutover.
7. Core reader work is keyboard-operable, screen-reader named, responsive at 200%
   zoom, and safe under reduced motion.

## AI presentation

1. Paper chat, full-page chat, thread replies, group chat, and deep research share
   the same message, source, activity, error, and completion primitives wherever
   their behavior is equivalent.
2. Rich responses support headings, prose, lists, tables, math, code, quotations,
   source chips/cards, task/progress rows, warnings, and compact result summaries
   without unsafe HTML.
3. Agent status is understandable without raw chain-of-thought. Meaningful state
   changes have text and live-region output; the orb is supplementary.
4. All presentation remains usable with animation disabled.

## Icons and empty states

1. All authenticated-app icons use one duotone-capable Lumen factory and barrel.
2. Existing names and `IconProps` remain compatible unless a reviewed exception is
   recorded.
3. Default icon scale increases deliberately by context, not through global blind
   enlargement: compact controls, toolbars, navigation, content, and illustrations
   each have reviewed sizes and touch targets.
4. Every page/panel empty state uses a standard primitive or a documented
   control-local exception.
5. Illustrations are decorative by default, have no flashing or forced motion, and
   retain meaning as static SVGs.

## Deep research

1. Cross-tenant tool access has a hard-zero test gate.
2. Start, resume, retry, cancel, delete, duplicate delivery, broker failure, and
   worker death have explicit, tested state transitions.
3. SSE resumes after a monotonic cursor without replaying an earlier generation's
   terminal event.
4. Every report citation resolves to a durable source/evidence ID. Unsupported or
   missing evidence prevents a false “verified” completion.
5. A user can ask follow-up questions from the existing evidence or explicitly
   start a new research generation in the same conversation.
6. Permission, prompt-injection, contract, and citation failures block release.
7. Quality must beat a simple search-plus-one-model-call baseline on the same eval
   set without breaching agreed latency and cost limits.

# Target architecture

## Reader boundary

`ReaderShell` remains the product orchestrator. It talks to a project-owned viewer
contract rather than directly owning engine details. The current pdf.js adapter is
the control; a parallel EmbedPDF adapter implements the same handle and overlay
contract during the spike.

The canonical annotation rectangle remains normalized top-left coordinates:
`{left, top, width, height}` in `[0,1]`. Engine adapters convert into this form at
one seam. Existing stored JSON is read without a destructive migration.

Reader interaction state moves out of the large inline overlay block into a focused
highlight controller and overlay component. The right rail remains the home for
long explanations; the mark menu is the local entry point. Do not add a competing
floating answer panel.

## Shared AI presentation

Create project-owned primitives around stable product concepts rather than copying a
whole component catalog:

- `AIMessage` — author, content, actions, status, references;
- `AIResponse` — safe markdown and structured content blocks;
- `AgentActivity` — curated phase/tool summaries and expandable bounded results;
- `AgentStatus` — text, live-region announcement, optional Thinking Orb;
- `SourceList` / `SourceCard` — stable source identity and evidence state;
- `AIError` — stable code, recovery action, settings link, retry timing;
- `AIComposer` — shared composition slots, provider status, cancel/submit behavior.

`lib/ai/reasoning.ts` remains the normalization seam initially. It is renamed or
extended only when the new event contract is settled. Group chat and threaded chat
migrate onto the shared rendering/state path instead of retaining private typewriter
and stream reducers.

## Deep-research workflow

Use a deterministic, bounded workflow:

`queued → planning → searching → reading → synthesizing → verifying → completed`

Orthogonal outcomes: `paused`, `retrying`, `cancelling`, `cancelled`, `failed`.

- A model produces a small validated search plan.
- Code executes bounded, independently parallel searches through allowlisted
  academic providers and visible-library tools.
- Code normalizes, deduplicates, scores, and persists sources/evidence.
- A model drafts against stable evidence IDs.
- Deterministic checks verify citation existence and formatting.
- A calibrated support verifier grades claim/evidence support.
- Insufficient evidence is a valid visible outcome.

Do not call this general web research until arbitrary web retrieval and content
fetching are safely implemented. The initial truthful scope is library + academic
literature research.

## Conversational research

Add durable turns to a research session:

- `deep_research_messages` stores user/assistant messages with generation and safe
  source references.
- **Ask this research** answers from the current evidence ledger with a smaller
  bounded call and no external searches.
- **Research further** creates a new generation, preserves prior evidence, executes
  a new plan, and appends a new verified answer.
- Each generation has its own status, budgets, event cursor, prompt/tool versions,
  and stop reason.
- A user sees the provider, scope, expected effort class, current phase, elapsed
  time, source count, verification state, retry/cancel controls, and reconnect state.

## Persistence and streaming

- `deep_research_sessions`: non-null owner, checked aggregate status, active
  generation pointer, retention/deletion policy, and timestamps.
- `deep_research_generations`: one durable record per generation with status,
  provider/model/prompt/tool versions, safe error code, budgets/usage, task ID,
  lease/cancellation state, cursor bounds, stop reason, and timestamps. Prior
  generations remain describable after a follow-up starts.
- `deep_research_messages`: conversational turns and answer mode.
- `deep_research_sources`: normalized provenance, scope, retrieval timestamp,
  content hash, quality metadata, and cited state.
- `deep_research_claims` or an equivalent evidence-link table: report claim to
  source/evidence links and verifier result.
- `deep_research_events`: durable monotonic `(session_id, generation, seq)` events
  with bounded safe payloads.
- `deep_research_outbox`: transactional dispatch, or an equivalent durable queued
  row swept by a dispatcher.

Postgres is the replay source of truth. Redis Streams or pub/sub may wake listeners,
but Redis is not the only event record. SSE uses an opaque cursor encoding both
`generation` and `seq` (for example a versioned `g<generation>:s<seq>` token) through
`Last-Event-ID` or `after=<cursor>`. A stale-generation cursor finishes that retained
generation and then emits an explicit generation transition; it is never reinterpreted
as a sequence in the active generation. The compatibility transition accepts no bare
sequence after the new stream contract is enabled. The server reads durable events
after the cursor, waits for notification, and rechecks terminal state. Recoverable failures emit `retrying`, not terminal `error`. Terminal status and
its one terminal event commit atomically.

## Provider contract

A generation pins the provider/model selected at start after a capability check for
structured output, tool use, context, and expected budget. Automatic failover is off
by default because switching models can change tool/citation behavior and cost. A
recoverable provider failure retries the pinned provider within budget; an unavailable
or incompatible provider pauses with a settings/reselect action. If later evals justify
fallback, a switch becomes an explicit persisted transition with old/new versions,
remaining budget, a curated `provider_switched` event, and the same safety/citation
gates. Tests cover selection, pause, retry, and any approved switch.

## Tool and data boundary

Every tool has typed bounded input/output, timeout, permission checks in application
code, provenance IDs, stable errors, and result-size limits. All paper tools use one
shared visibility policy, including vector SQL. External titles, abstracts, PDFs, and
web content are untrusted evidence, never instructions. Tool outputs delimit this
content explicitly.

Ingestion and future fetch tools enforce: HTTP/HTTPS only, DNS and resolved-IP checks
before and after redirects, a validated/pinned connection path (or network-level egress
policy) so the connected address cannot differ through DNS rebinding, denial of
loopback/private/link-local/metadata networks, content-type and size limits, timeouts, redirect caps, and safe filenames.

# External-source adoption decisions

| Source | Decision | Conditions |
|---|---|---|
| Beautiful UI | Adapt selected patterns | MIT site license; inspect each copied component; remove `iconoir-react` and local atom assumptions; avoid `glimm`/`liveline` unless one reviewed component proves they are necessary; reimplement with Lumen tokens/facades and audit accessibility. |
| Thinking Orbs `0.3.1` | Narrow pinned adoption after spike | Exact pin; verify tarball, lock diff, React 19/Vite 7 build, hidden-tab pause, screen-reader label, reduced motion, dark mode, DPR/performance; wrap in `ThinkingOrb`; no ordinary spinner replacement. |
| ReUI duotone icons | License-gated | Actual icon registry content is paid and authenticated. Use only with a valid license and reviewed payload. Never put the license key into source, browser code, logs, or a persistent CLI config. Import owned SVG geometry through Lumen's factory rather than adding a runtime icon layer. |
| EmbedPDF | Comparison spike | Isolated lazy adapter; exact compatible versions; same-origin WASM; no runtime CDN; measure bundle, selection, scroll, memory, old marks, auth, PWA, a11y, dark/zen/outline behavior before cutover. |

# Work breakdown

Each ticket is intended to fit one focused implementation session. Checkpoints keep
the system working after every few tickets.

## Phase 0 — contain current deep-research risk

### DR-00: Freeze unsafe deep-research starts and resumes — S

**Depends on:** none. **Immediate release blocker.**

Until DR-10 through DR-14 replace the lifecycle, event replay, and evidence path,
new starts and resumes must be unavailable in every deployment, including single-user
installs. Keep completed reports readable. The API returns a stable service-unavailable
code for new work, and the frontend hides/disables start and resume controls with
honest maintenance copy. Any temporary operator override is explicitly unsafe, off by
default, and never the release path.
Do not delete or silently fail existing records.

Expected files:

- `backend/app/api/deep_research.py`
- `backend/app/core/config.py` only if a temporary operator override is required
- `frontend-v2/src/pages/DeepResearch.tsx`
- `frontend-v2/src/pages/DeepResearchArchive.tsx`
- `frontend-v2/src/components/deep-research/ResearchComposer.tsx`
- API and UI tests

Acceptance:

- no unproven legacy start or resume can enqueue work in any deployment by default;
- completed reports and archive access remain available under normal ownership;
- the freeze has an explicit removal condition: DR-10–DR-14 lifecycle, replay,
  permission, and evidence gates are green.

### DR-01: Enforce tenant visibility in every agent paper tool — M

**Depends on:** DR-00. **Release blocker.**

Expected files:

- `backend/app/services/access.py`
- `backend/app/services/ai/agent/tools/paper_tools.py`
- `backend/app/services/ai/agent/tools/rag_tool.py`
- `backend/app/services/ai/agent/tools/discovery_tools.py`
- new `backend/tests/test_agent_tool_authorization.py`

Acceptance:

- owner, shared/editor, unrelated user, admin, and orphan fixtures exercise every
  paper ID and search/vector path;
- unrelated content is neither returned nor distinguishable through counts/errors;
- permission violations are a hard-zero test gate;
- agent paper queries fail closed when identity is absent, while the verified admin
  capability is forwarded into chat, multi-chat, and research worker contexts;
- annotations, notes, figures, layouts, and citations apply the same paper scope,
  including the cited-paper target, and discovery remains limited to public external
  records rather than tenant-owned paper rows.

Implementation checkpoint (2026-08-16): added the fail-closed scope helper, applied it
across paper, annotation, citation, figure, layout, keyword, and vector tools, and
added owner/share/group/orphan authorization tests. The deep-research mutation freeze
remains in place while lifecycle replacement continues.

Verification: targeted pytest, full backend suite after baseline repair, Ruff,
Pyright.

### DR-02: Bound ingestion and deep-research inputs — M

**Depends on:** DR-01.

Expected files:

- `backend/app/schemas/deep_research.py`
- `backend/app/api/deep_research.py`
- `backend/app/services/deep_research_service.py`
- `backend/app/services/ingestion.py`
- `backend/app/services/url_policy.py`
- `backend/app/api/ingest.py`
- `backend/app/core/config.py` only if operator-set bounds are justified
- new `backend/tests/test_ingestion_url_policy.py`
- new `backend/tests/test_deep_research_limits.py`, including concurrent starts

Acceptance:

- question length, active-run count, payload/event sizes, redirects, response size,
  scheme, hostname, and resolved IP are bounded;
- loopback, private, link-local, metadata, and redirect-to-private targets fail with
  stable errors, including DNS-rebinding attempts;
- active-run enforcement is transactional/race-tested rather than schema-only;
- normal academic PDF ingestion still works.

Implementation checkpoint (2026-08-16): added bounded research questions, transactional
active-run limits on start/resume, bounded checkpoints/reports/events, public-IP URL
validation, redirect limits, streaming download caps, pinned-IP outbound downloads,
PDF magic-byte checks, pasted/upload batch limits, and authenticated discovery
add-to-library ownership propagation. Lifecycle freeze remains enabled while the
replacement is completed.

### DR-03: Separate research worker capacity — S

**Depends on:** none.

Expected files:

- `backend/app/celery_app.py`
- `backend/app/main.py` or a dedicated worker-health API
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- compose health checks as required
- `docs/infra/docker.md`
- `docs/backend/tasks.md`

Acceptance:

- interactive workers do not consume `research`;
- a dedicated research worker consumes only `research` with explicit concurrency;
- health/operations can distinguish missing interactive and research workers;
- docs stop claiming Redis supports AMQP dead-letter behavior it ignores.

**Checkpoint A:** security tests pass; separate workers start; existing chat remains
responsive while research workers are saturated.

## Phase 1 — establish proof before the visual refactor

### QA-01: Repair backend test baseline — M

Expected files:

- `backend/pyproject.toml`
- `backend/tests/conftest.py`
- stale agent test modules under `backend/tests/`
- `docs/backend/tests.md`

Acceptance:

- the documented command imports `app` without an ad hoc environment variable;
- async tests actually execute;
- stale `layout_blocks` mocks match production contracts;
- the suite has a recorded green baseline before deep-research replacement work.

### QA-02: Add frontend component/browser verification skeleton — M

Expected files:

- `frontend-v2/package.json`
- frontend lockfile selected by the project (`bun.lock` or `package-lock.json`, not
  silently both)
- new test-runner configuration
- new `frontend-v2/src/test/` support or equivalent
- browser E2E configuration and first smoke spec
- `frontend-v2/vite.config.ts` only if test configuration requires it

Acceptance:

- unit/component tests run in CI-compatible headless mode;
- one browser smoke test covers login fixture → paper reader → chat shell;
- accessibility queries are preferred over test IDs;
- exact commands are documented.

### QA-03: Expand review surfaces — S

Expected files:

- `frontend-v2/src/pages/dev/IconSheet.tsx`
- `frontend-v2/src/pages/dev/KitchenSink.tsx`
- new dev fixtures for AI messages and empty states if the kitchen sink would become
  unwieldy
- `frontend-v2/src/router.tsx`
- `frontend-v2/scripts/audit-standards.mjs`
- `frontend-v2/package.json` to add the documented `audit:standards` script

Acceptance:

- light/dark, reduced/full motion, density, long copy, error, loading, offline, and
  narrow/wide variants are reviewable without backend data;
- the standards audit checks barrel-only icons and required duotone metadata;
- screenshots can be captured deterministically.

**Checkpoint B:** backend baseline green; frontend build/lint/audit/tests green;
reader/chat fixtures render in both themes.

## Phase 2 — deep-research core replacement

This phase begins immediately after the QA baseline and blocks visual phases. Every
boundary built in DR-10 through DR-14 must emit redacted correlation, generation,
task/lease, version, phase-latency, budget/usage, retry, and safe stop-reason telemetry.
DR-17 later turns those signals into dashboards, alerts, and a verified runbook; it is
not permission to bolt observability on after the workflow exists.

### DR-10: Model checked state, generations, events, evidence, messages, and outbox — L

**Depends on:** DR-00, QA-01.

Expected files:

- `backend/app/models/deep_research.py`
- `backend/app/models/__init__.py`
- `backend/app/models/user.py` if relationship/FK deletion behavior changes
- `backend/app/schemas/deep_research.py`
- new models if kept in separate modules
- new Alembic migration after the then-current head
- new state/domain modules under `backend/app/services/deep_research/`
- migration, transition, CAS, ownership, retention, and telemetry tests

Acceptance: non-null owner; explicit session and per-generation records; checked
transitions; monotonic generation/sequence; versioned checkpoints; bounded payloads;
safe retention; correlation/version fields; and concurrent transition proof. Existing
orphaned rows are deleted or quarantined under the approved audited retention policy,
never silently assigned to an administrator. Migration upgrade/downgrade and deletion
semantics are tested.

Implementation checkpoint (2026-08-16): added durable session version/generation
fields, generation/event/evidence/message/outbox models, orphan quarantine, non-null
owner migration, checked transition/CAS primitives, bounded JSON helpers, and initial
generation creation on start/resume. Migration upgrade and downgrade were exercised
against local Postgres. DR-11 event-store/SSE replacement and DR-12 atomic outbox
dispatch remain next.

### DR-11: Implement durable event store and generation-aware cursor SSE — L

Implementation checkpoint (2026-08-16): added the Postgres event store with
per-generation monotonic sequences, signed opaque cursors, stale-generation
rejection, durable worker event emission, retrying-vs-terminal events, and
cursor-aware SSE replay. The frontend now preserves SSE IDs, sends
`Last-Event-ID`, deduplicates by cursor through bounded reconnects, and treats
404/403/409 as terminal connection errors. Remaining work includes deeper
outbox/dispatch atomicity and production-grade listener wakeups.

**Depends on:** DR-10 and QA-02 frontend test support.

Expected files:

- new `backend/app/services/deep_research/event_store.py`
- `backend/app/api/deep_research.py`
- `backend/app/services/deep_research_service.py` compatibility facade
- `backend/app/services/ai/agent/stream_adapter.py`
- backend API/Redis/Postgres integration tests
- `frontend-v2/src/lib/ai/parseSSE.ts`
- `frontend-v2/src/lib/ai/chatStream.ts`
- `frontend-v2/src/lib/api/deepResearch.ts`
- `frontend-v2/src/hooks/use-deep-research-stream.ts`
- frontend reducer/hook tests

Acceptance: opaque generation+sequence cursor; documented stale-generation behavior;
generation isolation; exactly one terminal event; retrying vs terminal distinction;
fatal 404/403 handling; bounded backoff; per-connection lag telemetry; and no
one-second infinite reconnect loop. Cancellation is not claimed until DR-12.

### DR-12 implementation checkpoint (2026-08-16)

Start and resume commit a generation and durable outbox record in one
transaction. A periodic dispatcher leases unpublished records, publishes them
after commit, records broker errors with bounded backoff, and reconciles expired
worker leases. Start accepts `Idempotency-Key`, so a retried request returns the
original session. Cancellation is cooperative: `POST /{id}/cancel` locks the
lifecycle row; a queued delivery finalizes cancellation itself, and a running
worker checks between streamed events. Terminal state and terminal event now
commit together. Deleting an active session requests cancellation instead of
dropping its history. The opt-in local integration suite proves broker-outage retry, duplicate delivery, queued cancellation, and expired-worker recovery against Postgres. Generation lease tokens fence recovered workers; an old worker stops before it can append events or persist a later lifecycle state. Starts and resumes are enabled. A missing provider pauses the run safely; live-model evaluation remains a post-release validation task.

### DR-13 implementation checkpoint (2026-08-16)

The evidence ledger normalizes HTTPS URLs, rejects unsupported source kinds,
uses a stable provenance hash, bounds metadata, and deduplicates each generation.
The research prompt treats tool and source output as untrusted content. Completion
checks that external report links appear in the evidence ledger; an unmatched
link pauses the run for review. Existing tenant-scoped library tools remain the
source of authorization for library evidence.

### DR-13A implementation checkpoint (2026-08-16)

`backend/evals/deep_research/v1/` defines a versioned case set, release
thresholds, a deterministic citation-structure baseline, and stored baseline
output. It is a contract fixture, not an approval to unfreeze mutations: it still
needs representative model trials and calibrated claim-support grading.

### DR-14 implementation checkpoint (2026-08-16)

The worker records checked `planning`, `searching`, `reading`, `synthesizing`,
and `verifying` states around one bounded provider run. Turns and evidence items
are configuration bounds. The provider is selected once per generation and the
report is checked against durable evidence before completion. This is a bounded
workflow foundation; separate phase-specific model calls and release eval results
remain work before the lifecycle gate can open.

### DR-12: Make lifecycle dispatch atomic and cancellable — L

**Depends on:** DR-10 and DR-11.

Expected files:

- `backend/app/api/deep_research.py`
- `backend/app/tasks/deep_research_tasks.py`
- `backend/app/tasks/__init__.py` if an outbox dispatcher task is added
- new orchestrator/state/outbox modules
- `backend/app/celery_app.py`
- concurrency/broker-outage/worker-kill/cancellation tests

Acceptance: idempotent start, guarded resume, generation lease/CAS, stale-writer
rejection, cooperative cancellation, delete policy, broker-outage recovery, duplicate
Celery delivery safety, one terminal status/event transaction, and task/lease/queue-wait
telemetry.

### DR-13: Build typed tools and the evidence ledger — L

**Depends on:** DR-01, DR-10, and DR-12.

Expected files:

- `backend/app/services/access.py`
- `backend/app/services/ai/agent/tools/paper_tools.py`
- `backend/app/services/ai/agent/tools/rag_tool.py`
- `backend/app/services/ai/agent/tools/discovery_tools.py`
- new `backend/app/services/deep_research/evidence.py`
- source normalization/dedup/authorization/injection tests

Acceptance: bounded typed results, stable provenance IDs, visible-library policy,
untrusted-content delimiters, source quality/access metadata, durable evidence across
retries/generations, source-count/tool-latency telemetry, and hard-zero tenant leakage.

### DR-13A: Define the eval contract and baseline before adding agency — M

**Depends on:** QA-01 and DR-13's typed tool fixtures; blocks DR-14.

Expected files:

- new versioned deep-research eval dataset/config/runner under `backend/`
- simple search-plus-one-call baseline runner
- grader calibration fixtures and stored baseline results

Before orchestration is implemented, record populations, cases, model/prompt/tool
versions, repeated-trial protocol, claim-support and citation metrics, permission hard
limits, latency/token/cost distributions, and release thresholds. Cases include factual,
sparse, conflicting, date-scoped, inaccessible/private, malicious, missing-evidence,
and provider/tool-failure scenarios.

### DR-14: Implement plan → search → read → synthesize → verify — L

**Depends on:** DR-12, DR-13, and DR-13A.

Expected files:

- new `backend/app/services/deep_research/orchestrator.py`
- new `state.py`, `evidence.py`, verifier/prompt modules
- `backend/app/services/ai/agent/agents.py` only for versioned prompt definitions
- `backend/app/services/ai/agent/error.py`
- `backend/app/tasks/deep_research_tasks.py`
- unit/integration/eval harness tests

Acceptance: explicit phase and budget limits; pinned provider/model with capability
check; pause/reselect behavior; versioned prompt/tools; citation-ID draft; citation
existence and support checks; valid insufficient-evidence completion; safe stop reasons;
phase/budget/provider telemetry; and no raw reasoning events. The new workflow must
beat the recorded simple baseline without violating hard safety gates.

**Checkpoint C:** DR-10–DR-14 and the cursor/lifecycle chaos tests are green; the eval
contract beats baseline; starts/resumes may be re-enabled for a staged cohort. The
legacy lifecycle remains frozen if any permission, replay, cancellation, or evidence
gate fails.

## Phase 3 — reader interaction wins on the current engine

### RD-00: Self-host the pinned pdf.js worker — S

Expected files:

- `frontend-v2/src/components/shadcn/pdf-viewer.tsx`
- `frontend-v2/package.json` and chosen lockfile
- `frontend-v2/vite.config.ts` or the existing `copy-pdfjs` asset script
- pinned same-origin worker assets under `frontend-v2/public/pdfjs/` or emitted by Vite
- asset/PWA/browser tests

Acceptance: opening a private paper makes no runtime request to unpkg or another CDN;
the worker version matches `pdfjs-dist`; production/PWA builds contain the asset; a
clean browser run has no missing worker, CMap, or font request.

### RD-01: Extract canonical geometry and an engine-neutral viewer contract — M

Expected files:

- `frontend-v2/src/components/reader/annotation-geometry.ts`
- new `frontend-v2/src/components/reader/viewer-contract.ts`
- `frontend-v2/src/components/reader/ReaderShell.tsx`
- `frontend-v2/src/components/shadcn/pdf-viewer.tsx`
- new geometry unit tests
- new reader browser fixture/spec

Acceptance: normalized geometry validates and replays across zoom, mixed page sizes,
legacy rectangles, and all four rotations. The contract defines page numbering,
readiness, coordinate/area units, `pageWidth`/`pageHeight`, scale, rotation, overlay
semantics, current-page notification, scrolling, viewport access, zoom, and thumbnail
sidebar methods. `ReaderShell` imports these types from the neutral contract; both
engines must implement them without double-scaling.

### RD-02: Add explicit highlight lifecycle and recoverable drafts — M

Expected files:

- new `frontend-v2/src/components/reader/HighlightOverlay.tsx`
- new `frontend-v2/src/components/reader/ReaderHighlights.tsx` or a focused hook
- `frontend-v2/src/components/reader/ReaderShell.tsx`
- `frontend-v2/src/components/reader/SelectionPopover.tsx`
- `frontend-v2/src/lib/api/annotations.ts`
- component/browser tests

Acceptance: draft → committing → persisted and draft → failed → retry/discard are
visible, deterministic, and keyboard-operable.

### RD-03: Add at-mark editing and deferred delete — M

Expected files:

- `frontend-v2/src/components/reader/AnnotationCard.tsx`
- `frontend-v2/src/components/reader/AnnotationMarker.tsx`
- `frontend-v2/src/components/reader/HighlightOverlay.tsx`
- new `frontend-v2/src/hooks/use-deferred-delete.ts`
- new `frontend-v2/src/components/ui/UndoNotice.tsx`
- `frontend-v2/src/lib/api/annotations.ts`
- tests

Acceptance: note/recolor actions are reachable from the mark; delete waits five
seconds, undo cancels the request, and unmount commits safely.

### RD-04: Replace fixed margin placement with measured stacking — M

Expected files:

- new `frontend-v2/src/components/reader/MarginNotes.tsx`
- `frontend-v2/src/components/reader/ReaderShell.tsx`
- `frontend-v2/src/components/reader/AnnotationCard.tsx`
- `frontend-v2/src/components/reader/AnnotationMarker.tsx`
- responsive browser tests

Acceptance: visible notes measure real height, do not overlap, follow resize/content
changes, link hover/focus to their marks, and fall back to inline controls below the
approved width.

### RD-05: Restore reading position safely — S

Expected files:

- new `frontend-v2/src/hooks/use-reading-position.ts`
- new `frontend-v2/src/lib/reading-position.ts`
- `frontend-v2/src/pages/PaperDetail.tsx`
- `frontend-v2/src/components/reader/ReaderShell.tsx`
- unit/browser tests

Acceptance: explicit page/focus wins; stored position restores only after readiness;
initial page-one signals cannot overwrite a valid stored position.

**Checkpoint D:** current pdf.js reader passes the full selection/annotation flow on
keyboard, pointer, narrow desktop, and 200% zoom.

## Phase 4 — reader engine and grounded explanation gates

### RD-06: Build a lazy parallel EmbedPDF adapter spike — L

Expected files:

- new `frontend-v2/src/components/embedpdf/pdf-viewer.tsx`
- new `frontend-v2/src/components/embedpdf/document-viewer-sidebar.tsx`
- new `frontend-v2/src/lib/pdfium-engine.ts`
- `frontend-v2/src/router.tsx`
- `frontend-v2/src/pages/PaperDetail.tsx`
- `frontend-v2/src/pages/GroupsFinder.tsx`
- `frontend-v2/src/components/shadcn/file-system.tsx`
- `frontend-v2/package.json` and chosen lockfile
- `frontend-v2/vite.config.ts`
- `frontend-v2/src/index.css`
- spike-only comparison fixture/tests

The adapter must retain `scrollToPage`, `scrollToPageArea`, viewport access,
zoom getters/setters, thumbnail-sidebar getters/setters, outline, toolbar slots,
overlays, current-page notifications, authenticated Blob input initially, dark mode,
and zen behavior. The spike must either rewrite controls against Lumen's existing
HeroUI/shadcn facades or vendor the exact compatible primitives inside the isolated
`components/embedpdf/` namespace. It must not overwrite existing shadcn APIs or add an
unbounded third primitive layer.

Deliverable: comparison table for selection correctness, first render, scroll FPS,
memory, JS/worker/WASM bytes, PWA behavior, old-annotation replay, keyboard/focus,
outline, rotation, dark mode, and mobile/narrow behavior.

#### RD-06 implementation checkpoint — 2026-08-29

The isolated EmbedPDF adapter was evaluated behind a temporary development-only
route. It exercised the neutral reader handle, overlays, page navigation, zoom,
rotation, selection, search, outline, thumbnails, and same-origin PDFium loading
without changing the production reader. Its temporary fixture and generated
assets were removed after the RD-07A decision; the comparison record below is the
retained evidence.

#### RD-06 comparison record — 2026-08-29

The comparison used the same generated multi-page PDF in local headless Chromium.
The first visible page arrived in about 1.54 s through pdf.js and 1.44 s through
the isolated EmbedPDF path. A short scroll sample recorded 56 animation frames at
about 14.6 ms per frame for pdf.js and 97 at about 8.3 ms for EmbedPDF. These are
directional development measurements, not release benchmarks; the two isolated
layouts expose different viewport heights and the browser's memory API was not
available.

| Gate | pdf.js control | EmbedPDF spike | Result |
| --- | --- | --- | --- |
| Selection | Checkpoint D passes pointer and keyboard flow | Basic pointer selection and copy smoke test pass | Both prove the narrow fixture only |
| First render / scroll | 1.54 s / 14.6 ms sample | 1.44 s / 8.3 ms sample | Candidate is promising, not decisive |
| JS, worker, and WASM | Existing self-hosted worker and CMaps | About 434 KB viewer JS, 709 KB worker JS, and 4.63 MB PDFium WASM | Candidate adds material payload |
| PWA / offline | Existing worker policy is in production | WASM is same-origin and precached once | Both pass their asset checks |
| Old annotations / full reader flow | Existing replay, rotation, dark, zen, narrow, and 200% coverage | Not integrated with `ReaderShell` | Control wins coverage |
| Memory, multilingual fallback, mixed rotation, mobile parity | Existing behavior is the reference | Not measured to parity | Evidence gate remains open |

The memory row is intentionally marked unavailable: a headless browser cannot
provide a reliable cross-engine memory comparison here. The candidate's font
fallback is also disabled for the spike, so a multilingual result would not be a
fair production comparison.

### RD-07A: Keep pdf.js or RD-07B: cut over to EmbedPDF — decision ticket

**Decision: RD-07A — keep pdf.js for production.** The candidate's basic render and
scroll sample are useful, but it does not clear the parity gate for annotation
replay, authenticated `ReaderShell` behavior, multilingual fallback, memory, or
narrow layouts. The existing engine already passes Checkpoint D and carries the
reader's complete behavior. The spike is therefore disposable; the portable
geometry contract remains the replacement seam if a later benchmark justifies a
new engine. No production cutover is made, and two production engines are not
maintained.

### RD-08A: Design semantic anchors and cached explanations — M, separate gate

This ticket settles the domain, ownership, retention, and API contract only. Frontend
integration waits for AIUI-02.

Expected backend files:

- `backend/app/models/annotation.py`
- `backend/app/schemas/annotation.py`
- `backend/app/api/annotations.py`
- `backend/app/api/ai_features.py`
- `backend/app/api/crud/annotation.py`
- new annotation-grounding/explanation service modules
- new Alembic migration after the then-current head
- domain/API/stream tests

Do not add a nullable passage foreign key until Lumen has a durable passage/chunk
model and a privacy rule for shared papers. Cached answers need explicit ownership,
retention, regeneration, and collaborator visibility semantics.

#### RD-08A implementation checkpoint — 2026-08-29

The backend contract now has an `annotation_explanations` table with a required
owner, annotation cascade, versioned generations, bounded status/action/visibility
values, a 30-day retention deadline, and owner-scoped idempotency. An explanation is
private by default; `paper` visibility is an explicit opt-in for readers who can
already see the paper. Expired cache rows can be purged without deleting the user's
annotation.

`SemanticAnchor` v1 stores the page, quoted text, normalized rectangles, optional
prefix/suffix, and a document revision token. The cache key includes the paper,
anchor, action, visibility, and prompt version. The existing selection action now
records the requesting user, accepts `Idempotency-Key`, reuses an unexpired exact
answer, preserves one visible mark across regeneration, and rejects key reuse for a
different selection. Authenticated readers can fetch visible records through the
paper-level or annotation-level explanation endpoints. The Phase 5 reader
integration uses the existing annotation rail, keeps the answer attached to its
quote, and exposes explicit regeneration without introducing a competing floating
answer panel.

#### Phase 4 completion verification — 2026-08-29

The local Postgres migration is applied through `annotation_explanations_001`. The
backend suite passes with 177 tests and 3 skips, and Ruff passes on the changed
backend surface. The frontend suite passes with 52 tests, TypeScript build checking,
the standards audit, and the production build all green. Repeated Checkpoint D is
9/9 in Chromium. An 800×900 accessibility-tree scan found and fixed unlabeled tag
and PDF zoom controls; the rerun reports no unnamed interactive controls. The local
API, workers, Postgres, Redis, and Vite stack remain healthy for the next phase.

## Phase 5 — shared AI presentation

### Phase 5 planning checkpoint — 2026-08-29

#### Current problem

The frontend has one SSE parser but separate stream state machines for paper chat,
threads, group chat, and deep research. They disagree on what completion, retry,
cancellation, and failure mean. The public event type is also open-ended, and the
client still carries a `thought` path even though the backend deliberately drops
raw reasoning deltas.

The goal of this phase is a single Lumen-owned presentation seam. Existing agent
and provider code stays in place; the phase adds a deterministic wire-event
normalizer, shared stream state, and shared response/activity/status primitives.
There is no new AI framework in scope.

#### Contract decisions

The migration uses an expand-migrate-contract sequence: accept the current wire
events while each consumer moves to a typed, app-owned event vocabulary. The
normalized contract covers:

| Event | User-facing meaning |
| --- | --- |
| `content_delta` | Append plain model text; Markdown remains sanitized at render time. |
| `activity` | Show a safe phase or bounded tool summary with a stable id and status. |
| `source` | Show a validated library reference or research citation, resolved through the existing reference surfaces. |
| `warning` | Show a non-terminal, safe notice without provider internals. |
| `retrying` | Show an explicit attempt/backoff or reconnect state. |
| `complete` | Commit the authoritative ids, content, and reference manifest. |
| `error` | Expose a stable error code, safe message, recoverability, and action. |
| `keepalive` | Maintain the connection without changing visible content. |

`thought` is not part of the normalized contract. Legacy reasoning payloads,
raw tool arguments/results, provider exception text, unknown event types, and
malformed payloads must not reach the UI. They are dropped, bounded, or mapped to
a safe warning with diagnostic telemetry as appropriate.

The state boundary is also explicit:

- Server state owns persisted messages, reports, sources, and reference manifests.
- The stream reducer owns connection state, deltas, safe activity, cancellation,
  retry, terminal status, and late-event handling.
- Components own presentation preferences such as expanded activity and scroll
  position; they do not invent stream lifecycle state.

A stream is successful only after an explicit `complete` event or an authoritative
server snapshot. An ended response body is not inferred to be successful. Cancel
is a distinct user action. Automatic replay of a chat `POST` is not allowed until
the request has a turn identity or idempotency contract; otherwise retry remains
explicit so a network failure cannot silently duplicate a user message or model
call.

Markdown stays HTML-free and sanitized, references continue through the existing
manifest/API resolver, and every event field gets an explicit size bound. The
existing 1,200-character tool-detail cap is the baseline for the new contract;
activity count, source count, and buffered content ceilings will be fixed in the
AIUI-01 fixtures. Text remains the primary status signal, with reduced motion and
keyboard access required for every visual enhancement.

#### Implementation order and gates

| Order | Work | Depends on | Size | Exit evidence |
| --- | --- | --- | --- | --- |
| 1 | AIUI-01 contract, normalizer, fixtures, and reducer transition rules | None | M | Current chat/thread/group/research events normalize safely; malformed, unknown, legacy `thought`, cancellation, retry, and terminal cases have contract tests. |
| 2 | AIUI-02A/02B shared message, activity, source, status, and error primitives | AIUI-01 | M | One accessible composition renders the fixture states with bounded content, sanitized Markdown, keyboard behavior, and reduced-motion behavior. |
| 3 | Phase 5A contract checkpoint | 1–2 | — | The same fixture is readable in the dev surface and the right rail without raw reasoning or provider detail. |
| 4 | RD-08B grounded explanation integration | RD-08A and AIUI-02 | M | Cached explanation, evidence, interruption, retry, and regeneration use the shared primitives in the existing right rail. |
| 5 | AIUI-03 paper side/full chat tracer bullet | AIUI-01/02 | M | One reducer drives both paper chat layouts, with explicit completion, cancel, retry, references, and no duplicate optimistic messages. |
| 6 | AIUI-04 thread/group migration and legacy renderer removal | AIUI-03 | M | Thread and group flows use the same contract and reducer; duplicate typewriter/error paths and raw-reasoning renderers are gone. |
| 7 | AIUI-05 Thinking Orb wrapper | AIUI-02 and the migrated chat surfaces | S | The visual status layer is optional, labeled, reduced-motion safe, hidden-tab safe, and never the only status signal. |
| 8 | Checkpoint E | 4, 6, 7 | — | All chat modes pass the shared fixtures and disconnect/provider/rate-limit/cancel recovery checks. |

RD-08B can run in parallel with AIUI-03 after the Phase 5A checkpoint. AIUI-03
remains the tracer bullet for the stream controller; AIUI-04 follows it so the
duplicate thread/group logic is removed against a proven path.

#### Verification plan

- Contract: frontend fixture tests plus backend stream-adapter coverage for safe
  event mapping, including a regression that raw reasoning never appears.
- State: reducer tests for connect, delta, activity, retry, cancel, complete,
  error, reconnect, late events, and duplicate terminal events.
- UI: component and accessibility-tree checks for live status, focus, labels,
  source navigation, 200% zoom, narrow layout, and reduced motion.
- Integration: deterministic SSE fixtures through paper, thread, group, and deep
  research surfaces, including disconnect, rate-limit, provider fallback, and
  cancellation.
- Safety/performance: no raw HTML path, bounded activity/detail retention, no
  per-token unbounded DOM growth, and no automatic side-effecting POST replay.

### AIUI-01: Define the presentation/event contract — M

Expected files:

- new types under `frontend-v2/src/lib/ai/`
- `frontend-v2/src/lib/ai/events.ts` and `frontend-v2/src/lib/ai/normalize.ts`
- `frontend-v2/src/lib/ai/reasoning.ts`
- `frontend-v2/src/lib/ai/chatStream.ts`
- `frontend-v2/src/lib/ai/parseSSE.ts`
- `frontend-v2/src/components/MarkdownMessage.tsx`
- fixture and contract tests

Acceptance: safe typed blocks/events cover content, phase, bounded tool summary,
source/evidence, warning, retry, completion, and error; unknown events degrade
safely; raw reasoning and provider/internal detail cannot reach a renderer.

#### AIUI-01 implementation checkpoint — 2026-08-29

The first contract slice adds `events.ts`, `normalize.ts`, and `streamState.ts`.
Current chat, thread, group, and research wire events can now be normalized into
bounded content, activity, source, warning, retry, completion, error, pause,
cancellation, and reconciliation events. Raw `thought` events are discarded;
provider switches and error payloads become safe user-facing messages; manifest
targets reject unsafe schemes; and the reducer ignores late events after an
explicit terminal state.

The contract and reducer initially landed with 12 focused tests. The full
frontend suite passed with 64 tests, TypeScript checking, the changed-surface
lint, and the production build. The remaining thread, group, and research
consumers were then moved onto the shared reducer.

### AIUI-02: Build Lumen-owned rich AI primitives — L

Expected files:

- `frontend-v2/src/components/ai/MessageAuthor.tsx`
- `frontend-v2/src/components/ai/ReasoningTrace.tsx` (evolve into curated activity)
- `frontend-v2/src/components/ai/StreamingMessage.tsx`
- `frontend-v2/src/components/ai/ErrorBanner.tsx`
- new response/source/status/block primitives under `components/ai/`
- `frontend-v2/src/components/MarkdownMessage.tsx`
- `frontend-v2/src/components/ReferenceChip.tsx`
- `frontend-v2/src/index.css`
- component, accessibility, and visual tests

Beautiful UI patterns are copied only after inspecting the exact source and license.
Remove `iconoir-react` and local atom dependencies. No `rehype-raw` output bypasses
sanitization; model output remains untrusted.

#### AIUI-02 implementation checkpoint — 2026-08-29

The shared AI response composition now owns status text, normalized activity,
sanitized Markdown, validated sources, warnings, and recoverable errors. The
activity trace no longer renders raw thoughts, tool names, arguments, or provider
results. Its keyboard disclosures expose their state, and detail text is bounded
before rendering. `AgentStatus` is the primary status signal; `ThinkingOrb` is an
optional visual companion with reduced-motion and hidden-tab guards.

### RD-08B: Integrate cached grounded explanations into the right rail — M

**Depends on:** RD-08A and AIUI-02.

Expected frontend files:

- `frontend-v2/src/lib/api/annotations.ts`
- `frontend-v2/src/lib/api/aiFeatures.ts`
- `frontend-v2/src/components/reader/HighlightOverlay.tsx`
- `frontend-v2/src/components/layout/ChatPanel.tsx`
- shared AI response/source primitives and tests

Acceptance: explanation and answer-note requests show durable evidence, cached state,
interruption/retry, and explicit regeneration in the existing right rail; no competing
floating answer panel is introduced.

#### RD-08B implementation checkpoint — 2026-08-29

The reader sends private-by-default grounded actions with an idempotency key and
safe retry copy. The returned AI answer remains a durable annotation with its
quoted passage and page geometry, so the existing highlight, margin-note, and
annotation-rail surfaces provide the evidence. The rail reads the paper-scoped
explanation cache and offers explicit regeneration; regeneration keeps one visible
annotation while the backend retains versioned generations.

### AIUI-03: Migrate paper side/full chat — M

Expected files:

- `frontend-v2/src/components/chat/ChatMessageList.tsx`
- `frontend-v2/src/components/chat/ChatComposer.tsx`
- `frontend-v2/src/components/chat/SessionPills.tsx`
- `frontend-v2/src/components/ChatTab.tsx`
- `frontend-v2/src/pages/PaperChat.tsx`
- `frontend-v2/src/hooks/use-chat-controller.ts`
- `frontend-v2/src/hooks/use-chat-stream.ts`
- tests

Acceptance: side and full-page chat share the normalized reducer and response
primitives; completion, cancellation, retry, and reference manifests remain
explicit and do not duplicate persisted messages.

#### AIUI-03 implementation checkpoint — 2026-08-29

Paper side chat and full-page `PaperChat` now share the normalized stream hook
through `ChatMessageList`. The hook reduces bounded content and activity events,
requires an explicit `complete` event, keeps reference manifests validated, and
renders safe inline errors for cancellation, provider failures, and incomplete
connections. Manual retry remains explicit; a closed chat `POST` is never replayed
automatically.

The legacy thought/tool arrays remain as empty compatibility fields for callers,
but no renderer reads them. The existing optimistic cache handoff still
adds the persisted user/assistant turn only after completion, while the pending
user row is cleared through React state so fast or failed streams cannot leave a
duplicate-looking turn behind. The focused frontend coverage now passes 68 tests
and exercises normalized activities, explicit completion, incomplete-stream
recovery, manual retry, and sensitive-field rejection.

### AIUI-04: Migrate threads and group chat; delete legacy renderers — M

Expected files:

- `frontend-v2/src/components/MessageThread.tsx`
- `frontend-v2/src/components/GroupChatPanel.tsx`
- relevant group/thread stream hooks and clients
- delete `frontend-v2/src/components/ai/AgentThoughtPanel.tsx`
- delete `frontend-v2/src/components/ai/ToolCallIndicator.tsx`
- tests

Acceptance: thread/group paths use the shared reducer and response/activity
components; duplicate typewriter and error logic is removed.

#### AIUI-04 implementation checkpoint — 2026-08-29

Thread and group chat now consume `normalizedStream` and `reduceAIStream`, require
an explicit terminal event, keep manual retry explicit, and render the same
`StreamingMessage` composition as paper chat. Deep research uses the same
normalizer and reducer internally while preserving authoritative snapshot
reconciliation across reconnects. The unused raw `AgentThoughtPanel` and
`ToolCallIndicator` renderers were removed; the remaining compatibility fields
contain no wire payloads.

### AIUI-05: Add the Thinking Orb wrapper — S

Expected files:

- new `frontend-v2/src/components/ai/ThinkingOrb.tsx`
- `frontend-v2/src/components/ai/AgentStatus.tsx`
- `frontend-v2/package.json` and chosen lockfile
- dev fixtures and tests

The wrapper owns status-to-visual mapping, labels, sizing, theme, reduced motion,
hidden-tab behavior, and fallback. Text remains the primary status signal.

#### AIUI-05 implementation checkpoint — 2026-08-29

`AgentStatus` and `ThinkingOrb` are available to all AI surfaces and are covered
by the dev fixture and component tests. The orb is decorative when paired with
text, stops its animation when the tab is hidden, and never replaces the live
status announcement.

**Checkpoint E:** all chat modes render the same fixtures and recover from disconnect,
provider, rate-limit, and cancellation scenarios; orb-free reduced-motion mode passes.

#### Phase 5 engineering checkpoint — 2026-08-29

The non-visual Phase 5 gates pass: 75 frontend tests, TypeScript checking, the
standards audit, targeted ESLint, backend tests (177 passed, 3 skipped), and
changed-surface Ruff. Browser and visual verification were deferred to the manual
review pass documented below.

#### Phase 5 visual verification checkpoint — 2026-08-29

Manual visual verification is complete. The paper reader loads and restores its
reading position, and the previously reported app-owned console warnings are no
longer present. The remaining avatar/network, browser scroll, font, and PDF.js
notices are non-blocking environment or renderer messages.

Phase 5 is complete. Phase 6 starts at ICON-01; no duotone asset migration begins
until its source and redistribution terms are recorded.

## Phase 6 — duotone icon system

### ICON-01: Resolve ReUI license or approve project-owned geometry — decision ticket

**Decision — 2026-08-29: project-owned geometry.** No ReUI license record or
approved registry configuration is present in the repository. This phase therefore
uses new Lumen-owned secondary geometry and introduces no ReUI asset payload or
registry credential. Revisit this decision only with an explicit license, seat
owner, redistribution terms, retrieval method, update policy, and offboarding plan.

Record asset source, license owner/seats, retrieval method, allowed redistribution,
update policy, and offboarding. Do not run an authenticated remote registry CLI until
its payload and secret handling are reviewed.

#### Phase 6 planning checkpoint — 2026-08-29

The decision above keeps the implementation source-independent: no registry fetch is
needed, and all secondary geometry remains owned by this project.

#### ICON-02 implementation checkpoint — 2026-08-29

The Lumen factory now accepts optional secondary geometry. It renders that layer
behind the outline with a factory-owned opacity token, preserves the existing size,
stroke, filled, title, class, `currentColor`, `data-icon`, and `aria-hidden`
contracts, and allows an optional secondary color. The icon sheet exposes the
duotone toggle, and the standards audit requires `secondaryPath` and duotone
metadata to agree.

All 106 glyphs with a useful secondary layer now provide project-owned geometry.
`grip-vertical`, `more-horizontal`, and `spinner` remain deliberate single-layer
exceptions because their dots or motion arc are already the legible form.

### ICON-02: Extend the factory without breaking callers — M

Expected files:

- `frontend-v2/src/components/icons/create-icon.tsx`
- `frontend-v2/src/components/icons/index.ts` only if metadata exports change
- `frontend-v2/src/index.css`
- `frontend-v2/src/pages/dev/IconSheet.tsx`
- `frontend-v2/scripts/audit-standards.mjs`
- icon factory tests

Keep `size`, numeric sizing, `strokeWidth`, `filled`, `title`, `className`,
`currentColor`, `data-icon`, and default `aria-hidden`. Add factory-owned secondary
geometry/opacity; a second consumer color must remain optional.

### ICON-03: Convert glyphs in reviewed families — wide mechanical migration

All current glyph files under `frontend-v2/src/components/icons/` except the factory
and barrel are in scope. Work in build-green batches:

1. navigation and panels;
2. arrows, chevrons, actions, and editing;
3. files, folders, blocks, and views;
4. people, status, discovery, research, and reader concepts;
5. spinner and filled-state exceptions.

The source set is the current 109 glyph definitions documented in
[/frontend/icon-system.md](/frontend/icon-system.md). Each batch is blocked by
ICON-02 and gets light/dark screenshots at 12, 14, 16, 20, 24, 32, and 48 px.

### ICON-04: Increase scale by context and visually audit all consumers — L

Expected shared files:

- `frontend-v2/src/components/ui/Button.tsx`
- `frontend-v2/src/components/ui/EmptyState.tsx`
- `frontend-v2/src/components/ui/Spinner.tsx`
- `frontend-v2/src/index.css`
- `frontend-v2/src/pages/dev/IconSheet.tsx`
- `frontend-v2/src/pages/dev/KitchenSink.tsx`

At ticket start, regenerate the barrel-import inventory because earlier AI UI work may
add/delete consumers. Visual QA uses that fresh manifest (the current baseline is 103
files catalogued below), with special attention to reader/shadcn toolbars, status intent,
disabled opacity, citation graphs, AI activity, dark mode, and 48 px empty-state art.
Do not enlarge dense controls beyond their available hit target or let an icon crowd
its label.

### ICON-05: Contract old geometry and enforcement — S

Remove unused outline-only paths/assets, strengthen ESLint/audit rules, update the
icon sheet and icon-system documentation, and prove no ReUI registry secret or
unlicensed payload is committed.

**Checkpoint F:** regenerated icon-consumer manifest reviewed in light/dark and all
sizes; the phase surface's lint, build, audit, and tests are green; no licensed asset
or secret violation. Repository-wide lint still reports the pre-existing 60-error,
8-warning baseline outside this phase.

#### Phase 6 implementation checkpoint — 2026-08-29

The full 109-glyph set now uses the Lumen factory and barrel. Secondary geometry is
present on 106 glyphs, with explicit metadata for all 109; the three exceptions stay
outline-first. Compact AI, archive, citation, and author consumers now use the shared
`xs`–`xl` presets, while numeric icon sizing remains reserved for hero art. The icon
sheet covers preset and hero review sizes with duotone and secondary-tone toggles.

The final readability pass increased the shared presets to `14 / 16 / 20 / 24 / 28px`,
raised the semantic and default compact text tokens with them, and updated the
reader, file-viewer, menu, select, empty-state, and error-state consumers that had
hard-coded smaller sizes. Frontend tests, the standards audit, and the production
build are green; the repository-wide lint baseline remains unchanged.

**Checkpoint F implementation status:** complete. The human visual review of the
larger scale can continue from the running local stack while Phase 7 begins.

### Phase 7 planning checkpoint — 2026-08-29

Phase 7 starts with EMPTY-01: define the illustration contract and approve a small
art-direction sheet before migrating the standard page and panel empty states. The
existing `EmptyState` primitive remains the layout and accessibility seam; the new
illustration layer will provide static, theme-aware semantic artwork without adding
motion or changing empty-state copy until the concepts are approved.

## Phase 7 — illustrated empty states

### EMPTY-01: Create the illustration contract and art-direction sheet — M

Expected files:

- new `frontend-v2/src/components/illustrations/` factory and 4–6 representative
  concepts
- `frontend-v2/src/components/ui/EmptyState.tsx`
- `frontend-v2/src/index.css`
- `frontend-v2/src/pages/dev/KitchenSink.tsx` or a dedicated dev route
- tests/screenshots

The primitive accepts a semantic illustration component, not arbitrary HTML. SVGs
inherit theme tokens, remain decorative unless they convey unique content, support a
static frame, and use optional transform/opacity motion only. No flashing, autoplay
story, or layout-shifting animation.

### EMPTY-02: Migrate standard page and panel empties — M

The 21 current standard consumers are:

`BookmarksTab.tsx`, `GroupTreeSelector.tsx`, `NotesPanel.tsx`,
`PaperAnnotationsPanel.tsx`, `PaperCitationsList.tsx`, `RelatedPapers.tsx`,
`ShareDialog.tsx`, `citation-map/CitedByTab.tsx`,
`citation-map/FocalPaperPicker.tsx`, `discovery/SavedDiscoveriesPanel.tsx`,
`finder/PaperInfoPanel.tsx`, `pages/Annotations.tsx`, `pages/AuthorSearch.tsx`,
`pages/Dashboard.tsx`, `pages/HuggingFacePapers.tsx`, `pages/PapersList.tsx`,
`pages/Recommendations.tsx`, `pages/Search.tsx`, `pages/UserManagement.tsx`,
`pages/settings/AiProvidersSection.tsx`, and `pages/dev/KitchenSink.tsx` under
`frontend-v2/src/`.

Group them by meaning rather than drawing one illustration per screen: empty library,
no results, no annotations/notes, no citations/relationships, no activity, and setup
required.

### EMPTY-03: Consolidate ad hoc states — M

Review and migrate the product-level states in:

- `components/AISummary.tsx`, `GroupChatPanel.tsx`, `KeyFindings.tsx`,
  `ReadingGuide.tsx`;
- `components/chat/ChatMessageList.tsx`, `SessionPills.tsx`;
- `components/discovery/CitationExplorer.tsx`;
- `components/layout/ChatPanel.tsx`, `Sidebar.tsx`;
- `components/reader/AnnotationsPanel.tsx`, `OutlinePanel.tsx`;
- `pages/AuthorDetail.tsx`, `DeepResearchArchive.tsx`, `Discovery.tsx`,
  `DiscoveryArchive.tsx`, `Home.tsx`, `PaperChat.tsx`, `PaperDetail.tsx`.

Keep control-local no-option messages local in `ui/Select`, `shadcn/command`,
`shadcn/file-system`, `shadcn/layout-blocks`, `shadcn/xlsx-viewer`, and `TagInput` unless the standard primitive genuinely fits.

**Checkpoint G:** every product-level empty state has useful next-step copy, a static
reduced-motion rendering, correct heading structure, and responsive screenshots.

## Phase 8 — conversational deep research, UI, release, and contraction

### DR-15: Add conversational follow-up modes — L

**Depends on:** DR-10–DR-14.

Expected files:

- backend deep-research generation/message/schema/API/orchestrator modules
- `frontend-v2/src/lib/api/deepResearch.ts`
- `frontend-v2/src/hooks/use-deep-research-stream.ts`
- API and reducer tests

Acceptance: **Ask this research** stays within existing evidence and does not silently
search; **Research further** creates one guarded generation; the pinned-provider
contract is preserved; conversation/evidence/verification survive reload/reconnect.

### DR-16: Replace the current deep-research UI — L

**Depends on:** DR-15 and AIUI-02/AIUI-05.

Expected files:

- `frontend-v2/src/pages/DeepResearch.tsx`
- `frontend-v2/src/pages/DeepResearchArchive.tsx`
- `frontend-v2/src/components/deep-research/CitationsPanel.tsx`
- `frontend-v2/src/components/deep-research/ResearchComposer.tsx`
- shared AI primitives and Thinking Orb wrapper
- query/reducer/browser/a11y tests

Add pending guards, provider/scope/effort disclosure, phase/progress/elapsed time,
source and verifier state, reconnect/offline state, cancel, settings recovery,
pagination/search for archive, awaited clipboard, and ingest outcome feedback.

### DR-17: Establish observability and eval release operations — L

**Depends on:** DR-14–DR-16.

Expected files:

- versioned eval assets from DR-13A plus final release runner/CI gate
- telemetry dashboards/alerts or their project-owned configuration
- backend API/worker/orchestrator/tool instrumentation verification
- operations docs/runbook and CI wiring

Run the predeclared eval across repeated trials and compare to the frozen baseline.
Verify RED endpoint/provider metrics, queue USE metrics, queue age, phase latency,
budget/usage, source/citation support, retry/stop reason, SSE lag, cancellation, and
abandonment. Never log raw questions, reports, evidence payloads, checkpoints, keys, or
direct user identifiers by default.

### DR-18: Migrate and contract legacy implementation — M

**Depends on:** DR-14 and staged production verification; DR-16/17 before full release.

- old completed reports become read-only compatible sessions;
- orphaned sessions follow the approved delete/quarantine policy;
- active old runs are paused/failed with an explicit migration message rather than
  pretending resumability;
- remove raw SDK `run_state` and Redis `deepresearch:{id}:events` relay after cutover;
- remove obsolete event/reasoning presentation and stale docs;
- supersede the resumability and queue ADRs with decisions matching proven behavior.

**Checkpoint H:** permission safety hard-zero; lifecycle chaos tests pass; cursor SSE
survives reconnect and worker death; eval gate beats baseline; UI completes start →
research → reconnect → verify → follow-up → cancel/archive flows.

# Complete expected file-change ledger

This ledger names the likely source surface. Tickets refine it before implementation;
newly discovered files are added here before they are edited.

## Backend application and infrastructure

- `backend/app/api/deep_research.py`
- `backend/app/api/annotations.py`
- `backend/app/api/ai_features.py`
- `backend/app/api/ingest.py`
- `backend/app/api/papers.py` (verify/range hardening only if required)
- `backend/app/api/crud/annotation.py`
- `backend/app/models/deep_research.py`
- `backend/app/models/__init__.py`
- `backend/app/models/user.py` if relationships/deletion semantics change
- new generation/event/message/source/claim/outbox model modules as selected
- `backend/app/models/annotation.py`
- `backend/app/schemas/deep_research.py`
- `backend/app/schemas/annotation.py`
- `backend/app/services/deep_research_service.py`
- new `backend/app/services/deep_research/` package
- `backend/app/services/access.py`
- `backend/app/services/ingestion.py`
- `backend/app/services/ai/agent/agents.py`
- `backend/app/services/ai/agent/error.py`
- `backend/app/services/ai/agent/stream_adapter.py`
- `backend/app/services/ai/agent/tools/paper_tools.py`
- `backend/app/services/ai/agent/tools/rag_tool.py`
- `backend/app/services/ai/agent/tools/discovery_tools.py`
- `backend/app/tasks/deep_research_tasks.py`
- `backend/app/tasks/__init__.py` if a dispatcher task is added
- `backend/app/celery_app.py`
- `backend/app/main.py` or a dedicated worker-health surface
- `backend/app/core/config.py` if operator configuration is justified
- new Alembic revisions after the current head
- `backend/pyproject.toml`
- new and repaired modules under `backend/tests/`
- new deep-research eval assets under `backend/`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`

## Reader and frontend foundation

- `frontend-v2/package.json` and the chosen lockfile
- `frontend-v2/vite.config.ts`
- `frontend-v2/eslint.config.js`
- `frontend-v2/scripts/audit-standards.mjs`
- `frontend-v2/src/router.tsx`
- `frontend-v2/src/index.css`
- `frontend-v2/src/pages/PaperDetail.tsx`
- `frontend-v2/src/components/shadcn/pdf-viewer.tsx`
- `frontend-v2/src/components/shadcn/document-viewer-sidebar.tsx`
- `frontend-v2/src/components/shadcn/file-system.tsx`
- `frontend-v2/src/pages/GroupsFinder.tsx`
- reader primitives used by that viewer as required
- all files under `frontend-v2/src/components/reader/`
- new `frontend-v2/src/components/reader/viewer-contract.ts`
- new `frontend-v2/src/components/ui/UndoNotice.tsx`
- new `frontend-v2/src/components/embedpdf/` only during/after a winning spike
- new `frontend-v2/src/lib/pdfium-engine.ts` for a retained EmbedPDF path
- `frontend-v2/public/pdfjs/` generated assets and their cutover cleanup
- emitted/self-hosted EmbedPDF worker/WASM assets if EmbedPDF wins
- `frontend-v2/src/contexts/ReaderContext.tsx`
- `frontend-v2/src/hooks/use-reading-session.ts`
- `frontend-v2/src/hooks/use-pdf-dark-mode.ts` — integrate deliberately or delete as dead code
- new `use-reading-position.ts` and `use-deferred-delete.ts`
- `frontend-v2/src/lib/reading-position.ts`
- `frontend-v2/src/lib/api/annotations.ts`
- `frontend-v2/src/lib/api/aiFeatures.ts`
- `frontend-v2/src/lib/api/papers.ts`
- new frontend test and browser-test files/configuration

## AI/chat/deep-research frontend

- `frontend-v2/src/components/MarkdownMessage.tsx`
- `frontend-v2/src/components/ReferenceChip.tsx`
- `frontend-v2/src/components/ReferenceManifestProvider.tsx`
- `frontend-v2/src/components/MessageThread.tsx`
- `frontend-v2/src/components/ExpandedInput.tsx`
- `frontend-v2/src/components/ChatTab.tsx`
- `frontend-v2/src/components/GroupChatPanel.tsx`
- active and new primitives under `frontend-v2/src/components/ai/`
- all files under `frontend-v2/src/components/chat/`
- all files under `frontend-v2/src/components/deep-research/`
- `frontend-v2/src/components/layout/ChatPanel.tsx`
- `frontend-v2/src/pages/PaperChat.tsx`
- `frontend-v2/src/pages/DeepResearch.tsx`
- `frontend-v2/src/pages/DeepResearchArchive.tsx`
- `frontend-v2/src/hooks/use-chat-controller.ts`
- `frontend-v2/src/hooks/use-chat-sessions.ts`
- `frontend-v2/src/hooks/use-chat-stream.ts`
- `frontend-v2/src/hooks/use-typewriter.ts`
- `frontend-v2/src/hooks/use-deep-research-stream.ts`
- `frontend-v2/src/contexts/ChatControllerContext.tsx`
- `frontend-v2/src/lib/ai/chatStream.ts`
- `frontend-v2/src/lib/ai/parseSSE.ts`
- `frontend-v2/src/lib/ai/reasoning.ts`
- `frontend-v2/src/lib/api/chat.ts`
- `frontend-v2/src/lib/api/references.ts`
- `frontend-v2/src/lib/api/deepResearch.ts`
- `frontend-v2/src/pages/dev/IconSheet.tsx`
- `frontend-v2/src/pages/dev/KitchenSink.tsx`

## Icons and empty states

- `frontend-v2/src/components/icons/create-icon.tsx`
- `frontend-v2/src/components/icons/index.ts`
- all 109 current glyph files under `frontend-v2/src/components/icons/`
- `frontend-v2/src/components/ui/Button.tsx`
- `frontend-v2/src/components/ui/EmptyState.tsx`
- `frontend-v2/src/components/ui/Spinner.tsx`
- new `frontend-v2/src/components/illustrations/`
- the 21 standard consumers plus 19 product-level ad hoc files listed in Phase 7
- 103 icon call sites require visual QA even when their source stays unchanged

## Exact icon-definition migration manifest

The following current glyph definition files are source-change candidates for
ICON-03. Check off migration in family-sized tickets; do not infer completion from
the directory alone.

- `frontend-v2/src/components/icons/annotation.tsx`
- `frontend-v2/src/components/icons/archive.tsx`
- `frontend-v2/src/components/icons/arrow-down-left.tsx`
- `frontend-v2/src/components/icons/arrow-down.tsx`
- `frontend-v2/src/components/icons/arrow-left.tsx`
- `frontend-v2/src/components/icons/arrow-right.tsx`
- `frontend-v2/src/components/icons/arrow-up-right.tsx`
- `frontend-v2/src/components/icons/arrow-up.tsx`
- `frontend-v2/src/components/icons/award.tsx`
- `frontend-v2/src/components/icons/block-caption.tsx`
- `frontend-v2/src/components/icons/block-figure.tsx`
- `frontend-v2/src/components/icons/block-heading.tsx`
- `frontend-v2/src/components/icons/block-list.tsx`
- `frontend-v2/src/components/icons/block-number.tsx`
- `frontend-v2/src/components/icons/block-paragraph.tsx`
- `frontend-v2/src/components/icons/block-table.tsx`
- `frontend-v2/src/components/icons/block-title.tsx`
- `frontend-v2/src/components/icons/book-open.tsx`
- `frontend-v2/src/components/icons/bookmark-plus.tsx`
- `frontend-v2/src/components/icons/bookmark.tsx`
- `frontend-v2/src/components/icons/building.tsx`
- `frontend-v2/src/components/icons/calendar.tsx`
- `frontend-v2/src/components/icons/chart-bars.tsx`
- `frontend-v2/src/components/icons/chat.tsx`
- `frontend-v2/src/components/icons/check-circle.tsx`
- `frontend-v2/src/components/icons/check-square.tsx`
- `frontend-v2/src/components/icons/check.tsx`
- `frontend-v2/src/components/icons/chevron-down.tsx`
- `frontend-v2/src/components/icons/chevron-left.tsx`
- `frontend-v2/src/components/icons/chevron-right.tsx`
- `frontend-v2/src/components/icons/chevron-up.tsx`
- `frontend-v2/src/components/icons/chip.tsx`
- `frontend-v2/src/components/icons/citation-graph.tsx`
- `frontend-v2/src/components/icons/clock.tsx`
- `frontend-v2/src/components/icons/close.tsx`
- `frontend-v2/src/components/icons/copy.tsx`
- `frontend-v2/src/components/icons/discover.tsx`
- `frontend-v2/src/components/icons/download.tsx`
- `frontend-v2/src/components/icons/edit.tsx`
- `frontend-v2/src/components/icons/external-link.tsx`
- `frontend-v2/src/components/icons/eye.tsx`
- `frontend-v2/src/components/icons/feed.tsx`
- `frontend-v2/src/components/icons/file-code.tsx`
- `frontend-v2/src/components/icons/file-spreadsheet.tsx`
- `frontend-v2/src/components/icons/file-text.tsx`
- `frontend-v2/src/components/icons/file.tsx`
- `frontend-v2/src/components/icons/filter.tsx`
- `frontend-v2/src/components/icons/fingerprint.tsx`
- `frontend-v2/src/components/icons/folder-open.tsx`
- `frontend-v2/src/components/icons/folder-plus.tsx`
- `frontend-v2/src/components/icons/folder.tsx`
- `frontend-v2/src/components/icons/globe.tsx`
- `frontend-v2/src/components/icons/grip-vertical.tsx`
- `frontend-v2/src/components/icons/hashtag.tsx`
- `frontend-v2/src/components/icons/help.tsx`
- `frontend-v2/src/components/icons/highlighter.tsx`
- `frontend-v2/src/components/icons/home.tsx`
- `frontend-v2/src/components/icons/info-circle.tsx`
- `frontend-v2/src/components/icons/insight.tsx`
- `frontend-v2/src/components/icons/layers.tsx`
- `frontend-v2/src/components/icons/library.tsx`
- `frontend-v2/src/components/icons/link.tsx`
- `frontend-v2/src/components/icons/logout.tsx`
- `frontend-v2/src/components/icons/maximize.tsx`
- `frontend-v2/src/components/icons/menu.tsx`
- `frontend-v2/src/components/icons/microscope.tsx`
- `frontend-v2/src/components/icons/minimize.tsx`
- `frontend-v2/src/components/icons/minus-circle.tsx`
- `frontend-v2/src/components/icons/monitor.tsx`
- `frontend-v2/src/components/icons/moon.tsx`
- `frontend-v2/src/components/icons/more-horizontal.tsx`
- `frontend-v2/src/components/icons/note.tsx`
- `frontend-v2/src/components/icons/palette.tsx`
- `frontend-v2/src/components/icons/panel-left-close.tsx`
- `frontend-v2/src/components/icons/panel-left-open.tsx`
- `frontend-v2/src/components/icons/panel-right-close.tsx`
- `frontend-v2/src/components/icons/panel-right-open.tsx`
- `frontend-v2/src/components/icons/plus.tsx`
- `frontend-v2/src/components/icons/quote.tsx`
- `frontend-v2/src/components/icons/refresh.tsx`
- `frontend-v2/src/components/icons/rotate.tsx`
- `frontend-v2/src/components/icons/save.tsx`
- `frontend-v2/src/components/icons/search.tsx`
- `frontend-v2/src/components/icons/send.tsx`
- `frontend-v2/src/components/icons/settings.tsx`
- `frontend-v2/src/components/icons/share.tsx`
- `frontend-v2/src/components/icons/shield-off.tsx`
- `frontend-v2/src/components/icons/shield.tsx`
- `frontend-v2/src/components/icons/sliders.tsx`
- `frontend-v2/src/components/icons/sort.tsx`
- `frontend-v2/src/components/icons/sparkles.tsx`
- `frontend-v2/src/components/icons/spinner.tsx`
- `frontend-v2/src/components/icons/sun.tsx`
- `frontend-v2/src/components/icons/tag.tsx`
- `frontend-v2/src/components/icons/thumbs-up.tsx`
- `frontend-v2/src/components/icons/trash.tsx`
- `frontend-v2/src/components/icons/trending-up.tsx`
- `frontend-v2/src/components/icons/upload.tsx`
- `frontend-v2/src/components/icons/user-plus.tsx`
- `frontend-v2/src/components/icons/user.tsx`
- `frontend-v2/src/components/icons/users.tsx`
- `frontend-v2/src/components/icons/view-columns.tsx`
- `frontend-v2/src/components/icons/view-gallery.tsx`
- `frontend-v2/src/components/icons/view-grid.tsx`
- `frontend-v2/src/components/icons/view-list.tsx`
- `frontend-v2/src/components/icons/warning.tsx`
- `frontend-v2/src/components/icons/x-circle.tsx`
- `frontend-v2/src/components/icons/zoom-in.tsx`
- `frontend-v2/src/components/icons/zoom-out.tsx`

## Exact icon-consumer visual-QA manifest

These current consumers must be reviewed under ICON-04. They need source edits only
when the larger duotone glyph no longer fits its context or the semantic icon choice
is wrong.

- `frontend-v2/src/components/AISummary.tsx`
- `frontend-v2/src/components/AnalysisSidebar.tsx`
- `frontend-v2/src/components/author/AuthorBits.tsx`
- `frontend-v2/src/components/BookmarksTab.tsx`
- `frontend-v2/src/components/Breadcrumb.tsx`
- `frontend-v2/src/components/ExpandedInput.tsx`
- `frontend-v2/src/components/FilterChip.tsx`
- `frontend-v2/src/components/GroupChatPanel.tsx`
- `frontend-v2/src/components/GroupTreeSelector.tsx`
- `frontend-v2/src/components/KeyFindings.tsx`
- `frontend-v2/src/components/MessageThread.tsx`
- `frontend-v2/src/components/NotesPanel.tsx`
- `frontend-v2/src/components/PaperAnnotationsPanel.tsx`
- `frontend-v2/src/components/PaperCard.tsx`
- `frontend-v2/src/components/PaperCitationsList.tsx`
- `frontend-v2/src/components/PaperDetails.tsx`
- `frontend-v2/src/components/PaperTable.tsx`
- `frontend-v2/src/components/ProcessingProgressPanel.tsx`
- `frontend-v2/src/components/ReadingGuide.tsx`
- `frontend-v2/src/components/ReferenceChip.tsx`
- `frontend-v2/src/components/RelatedPapers.tsx`
- `frontend-v2/src/components/ShareDialog.tsx`
- `frontend-v2/src/components/SortFilterBar.tsx`
- `frontend-v2/src/components/TagInput.tsx`
- `frontend-v2/src/components/TagList.tsx`
- `frontend-v2/src/components/UserMenu.tsx`
- `frontend-v2/src/components/ai/ErrorBanner.tsx`
- `frontend-v2/src/components/ai/MessageAuthor.tsx`
- `frontend-v2/src/components/ai/ReasoningTrace.tsx`
- `frontend-v2/src/components/chat/ChatComposer.tsx`
- `frontend-v2/src/components/chat/ChatMessageList.tsx`
- `frontend-v2/src/components/chat/SessionPills.tsx`
- `frontend-v2/src/components/citation-map/CitationMap.tsx`
- `frontend-v2/src/components/citation-map/CitedByTab.tsx`
- `frontend-v2/src/components/citation-map/FocalPaperPicker.tsx`
- `frontend-v2/src/components/citation-map/NodeDetailPanel.tsx`
- `frontend-v2/src/components/deep-research/CitationsPanel.tsx`
- `frontend-v2/src/components/deep-research/ResearchComposer.tsx`
- `frontend-v2/src/components/discovery/AddToLibraryDialog.tsx`
- `frontend-v2/src/components/discovery/CitationExplorer.tsx`
- `frontend-v2/src/components/discovery/ClusteredResults.tsx`
- `frontend-v2/src/components/discovery/DiscoveredPaperCard.tsx`
- `frontend-v2/src/components/discovery/DiscoveryStatus.tsx`
- `frontend-v2/src/components/discovery/ResearchOverview.tsx`
- `frontend-v2/src/components/discovery/SavedDiscoveriesPanel.tsx`
- `frontend-v2/src/components/finder/PaperInfoPanel.tsx`
- `frontend-v2/src/components/ingest/UploadHero.tsx`
- `frontend-v2/src/components/ingest/UrlChipsInput.tsx`
- `frontend-v2/src/components/layout/ChatPanel.tsx`
- `frontend-v2/src/components/layout/Navbar.tsx`
- `frontend-v2/src/components/layout/Sidebar.tsx`
- `frontend-v2/src/components/layout/TabBar.tsx`
- `frontend-v2/src/components/reader/AnnotationCard.tsx`
- `frontend-v2/src/components/reader/AnnotationMarker.tsx`
- `frontend-v2/src/components/reader/HighlighterControl.tsx`
- `frontend-v2/src/components/reader/ReaderShell.tsx`
- `frontend-v2/src/components/reader/ReaderToolbarActions.tsx`
- `frontend-v2/src/components/shadcn/command.tsx`
- `frontend-v2/src/components/shadcn/dialog.tsx`
- `frontend-v2/src/components/shadcn/docx-viewer.tsx`
- `frontend-v2/src/components/shadcn/dropdown-menu.tsx`
- `frontend-v2/src/components/shadcn/file-system.tsx`
- `frontend-v2/src/components/shadcn/layout-blocks.tsx`
- `frontend-v2/src/components/shadcn/pdf-viewer.tsx`
- `frontend-v2/src/components/shadcn/resizable.tsx`
- `frontend-v2/src/components/shadcn/select.tsx`
- `frontend-v2/src/components/shadcn/spinner.tsx`
- `frontend-v2/src/components/shadcn/xlsx-viewer.tsx`
- `frontend-v2/src/components/ui/Accordion.tsx`
- `frontend-v2/src/components/ui/Dialog.tsx`
- `frontend-v2/src/components/ui/EmptyState.tsx`
- `frontend-v2/src/components/ui/ErrorState.tsx`
- `frontend-v2/src/components/ui/Pagination.tsx`
- `frontend-v2/src/components/ui/SearchInput.tsx`
- `frontend-v2/src/components/ui/Spinner.tsx`
- `frontend-v2/src/lib/constants/defaultPrompts.ts`
- `frontend-v2/src/pages/Annotations.tsx`
- `frontend-v2/src/pages/AuthorDetail.tsx`
- `frontend-v2/src/pages/AuthorSearch.tsx`
- `frontend-v2/src/pages/Citations.tsx`
- `frontend-v2/src/pages/Dashboard.tsx`
- `frontend-v2/src/pages/DeepResearch.tsx`
- `frontend-v2/src/pages/DeepResearchArchive.tsx`
- `frontend-v2/src/pages/Discovery.tsx`
- `frontend-v2/src/pages/DiscoveryArchive.tsx`
- `frontend-v2/src/pages/ErrorPage.tsx`
- `frontend-v2/src/pages/Export.tsx`
- `frontend-v2/src/pages/GroupsFinder.tsx`
- `frontend-v2/src/pages/Home.tsx`
- `frontend-v2/src/pages/HuggingFacePapers.tsx`
- `frontend-v2/src/pages/Ingest.tsx`
- `frontend-v2/src/pages/PaperChat.tsx`
- `frontend-v2/src/pages/PaperDetail.tsx`
- `frontend-v2/src/pages/PapersList.tsx`
- `frontend-v2/src/pages/Recommendations.tsx`
- `frontend-v2/src/pages/Search.tsx`
- `frontend-v2/src/pages/UserManagement.tsx`
- `frontend-v2/src/pages/dev/IconSheet.tsx`
- `frontend-v2/src/pages/dev/KitchenSink.tsx`
- `frontend-v2/src/pages/settings/AiProvidersSection.tsx`
- `frontend-v2/src/pages/settings/AppearanceSection.tsx`
- `frontend-v2/src/pages/settings/SecuritySection.tsx`
- `frontend-v2/src/pages/settings/SettingsNav.tsx`

## Documentation

- this plan
- `docs/features/index.md`
- `docs/features/deep-research.md`
- `docs/frontend/pdf-reader.md`
- `docs/frontend/chat-system.md`
- `docs/frontend/components.md`
- `docs/frontend/icon-system.md`
- `docs/frontend/styling.md`
- `docs/frontend/hooks.md`
- `docs/frontend/api-layer.md`
- `docs/backend/api/deep-research.md`
- `docs/backend/services/ai-agent.md`
- `docs/backend/models.md`
- `docs/backend/tasks.md`
- `docs/backend/tests.md`
- `docs/infra/docker.md`
- `docs/architecture.md`
- superseding ADRs under `docs/decisions/` and `docs/decisions/index.md`
- `docs/log.md`

# Verification commands and gates

Exact package commands may change in QA-01/QA-02; record changes here first.

Backend target:

```bash
cd backend
uv run pytest -q
uv run ruff check app tests
uv run pyright app
```

Frontend target:

```bash
cd frontend-v2
npm run build
npm run lint
npm run audit:standards
npm run test
npm run test:e2e
```

If Bun is selected as the sole documented package manager, replace the npm commands
consistently rather than mixing lockfile truth.

Release gates:

- zero cross-tenant tool results;
- no TypeScript, Ruff, or Pyright errors in changed files;
- deterministic reader geometry and legacy replay suite green;
- keyboard, screen-reader, 200% zoom/reflow, contrast, and reduced-motion passes;
- clean browser console and no failed runtime asset/network requests;
- bundle comparison recorded for reader/orb/icon changes;
- deep-research recovery/chaos and SSE cursor suites green;
- eval quality above baseline and hard-zero permission/security failures;
- no paid-registry secret, provider key, raw chain-of-thought, or private evidence in
  source, logs, events, screenshots, or test fixtures.

# Rollout and rollback

- Ship deep-research containment independently and first.
- Use expand–migrate–contract for shared AI primitives and icon factory changes.
- Keep the old reader engine until the new adapter passes the gate; cut over behind a
  short-lived internal switch only for comparison, then delete the loser.
- Migrate old completed deep-research reports to read-only compatibility. Do not let
  old active checkpoints write into the new generation/event tables.
- Roll back visual work by component-family batches, not by reverting the whole
  reformation.
- Roll back deep research by stopping the dedicated research worker and hiding new
  starts while preserving readable completed reports; do not route new runs back to
  the known-unsafe legacy state machine.

# Out of scope

- redesigning the separate `landing/` app;
- exposing raw model reasoning or full unbounded tool results;
- a multi-agent manager/worker fiction without eval proof;
- arbitrary open-web browsing before fetch isolation and prompt-injection controls;
- replacing annotations with a parallel highlights API;
- a second floating reader answer panel competing with the right rail;
- a permanent dual PDF-engine architecture;
- using ReUI assets without confirmed license rights;
- animating frequent controls or making motion necessary for comprehension.

# Known documentation drift to correct during delivery

Current documents still describe segmented deep-research runs that the source no
longer implements, safe replay that is currently broken, queue isolation that shared
workers do not provide, optional agent SDK behavior partly reversed by a later ADR,
a removed `ReasoningTree`, and a test command that currently fails collection. These
claims must not be copied into new implementation work. Superseding ADRs should be
written only when tests prove the replacement behavior.

# Research notes and citations

[1] [Beautiful UI catalog](https://www.beautifului.dev/) and
[license](https://www.beautifului.dev/license), accessed 2026-08-16. The site provides
copyable AI-interface examples under MIT but no verified package/support matrix or
library-wide accessibility audit.

[2] [Thinking Orbs repository](https://github.com/Jakubantalik/thinking-orbs),
[README](https://github.com/Jakubantalik/thinking-orbs#readme), and
[npm package `thinking-orbs@0.3.1`](https://www.npmjs.com/package/thinking-orbs/v/0.3.1),
accessed 2026-08-16. The package declares React `>=18`, zero runtime dependencies,
static reduced-motion rendering, offscreen pause, MIT license, and npm provenance;
it remains pre-1.0 and single-maintainer.

[3] [ReUI introduction](https://reui.io/docs),
[registry guide](https://reui.io/docs/registry), and
[commercial license](https://reui.io/legal/license), accessed 2026-08-16. The requested
duotone icon registry is paid/authenticated and must not be confused with the public
repository's MIT-covered component examples.

[4] Learning-app decision
`/Users/blackprince001/Documents/dev/learning-app/docs/decisions/0025-embedpdf-reader-and-highlight-anchoring.md`
and reader plan
`/Users/blackprince001/Documents/dev/learning-app/docs/planning/issue-19-reader.md`,
reviewed 2026-08-16.

[5] [/frontend/pdf-reader.md](/frontend/pdf-reader.md),
[/frontend/chat-system.md](/frontend/chat-system.md),
[/frontend/icon-system.md](/frontend/icon-system.md), and
[/features/deep-research.md](/features/deep-research.md) describe Lumen's current
implementation, subject to the drift noted above.
