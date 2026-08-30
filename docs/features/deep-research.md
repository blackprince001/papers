---
type: Feature Plan
title: Deep Research
description: Source-backed research sessions on the dedicated Celery research queue, with durable generation state, cursor-based SSE replay, evidence verification, and follow-up conversations.
tags: [feature-plan, deep-research, agent, celery, sse, implemented]
timestamp: 2026-08-29T00:00:00Z
---

Deep Research runs a bounded, multi-step investigation and saves the report with
its source ledger. The API creates a generation on the dedicated `research`
queue. The browser receives progress over SSE and can reconnect from a signed
generation/sequence cursor.

# Status

Implemented and enabled. Starts, resumes, cancellation, archive search, Ask this
research, and Research further use the durable lifecycle. The emergency setting
`DEEP_RESEARCH_MUTATIONS_ENABLED=false` remains available for an incident or
planned maintenance; it is not the normal product state.

# Configuration

Deep Research uses the user's configured AI provider. `DEEP_RESEARCH_MAX_TURNS`,
`DEEP_RESEARCH_MAX_QUESTION_LENGTH`, `DEEP_RESEARCH_MAX_REPORT_BYTES`, and
`DEEP_RESEARCH_MAX_EVIDENCE_ITEMS` bound work and stored payloads. The research
worker must consume the `research` queue.

The frontend has the matching build-time setting
`VITE_DEEP_RESEARCH_MUTATIONS_ENABLED`. Both defaults are enabled. Set either
gate to `false` only while stopping new starts and resumes.

# Architecture

- **Generation state:** `DeepResearchGeneration.checkpoint` stores the bounded
  SDK input list. Session ownership and the user-facing report stay on
  `DeepResearchSession`; execution state does not.
- **Event replay:** `DeepResearchEvent` is the only SSE replay source. Events are
  ordered per generation and bounded before they are stored. Redis remains the
  Celery broker and result backend; it is not a research event relay.
- **Dispatch:** an outbox row is committed with the session and generation, then
  the dispatcher publishes `research.run_deep_research`. Leases fence duplicate
  delivery and recover abandoned workers.
- **Evidence:** authorized tool results populate the evidence ledger. A report
  link alone never becomes evidence. The verifier checks report links against
  that ledger before completion.
- **Conversation:** Ask this research reads the stored report and verified
  evidence with an agent that has no tools. Research further creates a new
  generation with the pinned provider and a fresh bounded investigation.
- **Failure handling:** transient provider, network, timeout, and retryable tool
  errors return to the queue. Auth and missing-provider errors pause the run.
  Cancellation is cooperative and ends with one durable terminal event.
- **Frontend:** `DeepResearch.tsx` renders progress, source verification,
  reconnect/offline state, cancellation, follow-ups, and recovery actions.
  `DeepResearchArchive.tsx` uses bounded search and pagination.

# API surface

The authenticated router is mounted at `/api/v1/deep-research`:

- `POST /` starts an idempotent research session.
- `GET /` keeps the compact list response for existing callers.
- `GET /archive` returns a searchable, paginated archive page.
- `GET /{id}` returns the report and safe current-generation metadata. It never
  returns checkpoints or provider credentials.
- `GET /{id}/stream` replays and tails Postgres events from a signed cursor.
- `GET /{id}/messages` returns safe conversation projections.
- `POST /{id}/messages` handles Ask this research and Research further.
- `POST /{id}/cancel`, `POST /{id}/resume`, and `DELETE /{id}` provide lifecycle
  controls.

# Data and migrations

`deep_research_001` created the original session table. `deep_research_002`
added generation-scoped lifecycle tables and quarantined sessions without an
owner. `deep_research_003` added provider pins and conversation modes.
`deep_research_004` copied legacy checkpoints to generations, paused active old
runs with a migration message, fenced their workers, and removed the session
`run_state` column.

# Release checks

The deterministic contract in
`backend/evals/deep_research/v1/` checks permission violations, unsupported
claims, citation recall, and latency. Run it with:

```sh
cd backend
.venv/bin/python evals/deep_research/v1/run_eval.py --check-release
```

Operational fields are emitted through the redacted deep-research metric event.
The [operations runbook](/ops/deep-research.md) defines the dashboards, alert
thresholds, rollback steps, and fields that must never be logged.

# Implementation checklist

- [x] Durable generation state, event replay, leases, outbox dispatch, and cancellation.
- [x] Provider pinning, evidence ledger, report verification, and safe message projections.
- [x] Ask this research without tools and Research further as a new generation.
- [x] Progress, reconnect/offline, cancel, settings recovery, archive search/pagination, and feedback states.
- [x] Redacted lifecycle metrics, versioned eval assets, release gate, CI workflow, and runbook.
- [x] Legacy checkpoint migration and removal of the Redis event relay/session checkpoint projection.
