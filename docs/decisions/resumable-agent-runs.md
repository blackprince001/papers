---
type: ADR
title: Durable deep-research generations and event replay
description: Deep-research checkpoints and ordered SSE events live in generation-scoped Postgres records; Redis is used for Celery transport, not research replay.
tags: [adr, deep-research, agent, celery, postgres, sse, resumability]
timestamp: 2026-08-29T00:00:00Z
---

# Decision

Each deep-research execution is a generation. The generation owns its bounded
agent checkpoint, lease, provider pin, event sequence, evidence, and messages.
The session owns the question, report, lifecycle status, and current-generation
pointer.

The worker appends bounded events to `deep_research_events` in Postgres. The SSE
endpoint reads that same store, signs the generation/sequence cursor, and tails
new events. A reconnect can replay missed work without depending on a
broker-side list or a connection-local buffer.

Retries load `DeepResearchGeneration.checkpoint`. A paused run keeps its
checkpoint for the normal resume path; completed, failed, and cancelled runs
clear it. A legacy active run found during the cutover is fenced and paused with
an explicit migration message. It is not presented as resumable from an old
worker.

# Why

Postgres already provides the transaction boundary needed for the lifecycle,
event order, and evidence ledger. One durable source avoids drift between an
ephemeral relay and a database checkpoint. Generation scoping also prevents a
follow-up or stale worker from crossing an execution boundary.

# Tradeoffs

- Durable events consume database storage and need retention management.
- A reconnect may replay many rows, so event payloads are bounded and the client
  uses a signed cursor.
- Checkpoints contain provider SDK input items and remain internal; metrics and
  API projections exclude them.

# Alternatives considered

- A Redis event relay was removed after the Postgres event store became the
  authoritative stream source.
- Restarting from the original question was rejected because it repeats paid
  searches and loses progress.
- Connection-local streaming was rejected because browser sleep and network
  changes are normal during a long run.

# References

- `backend/app/services/deep_research/event_store.py`
- `backend/app/services/deep_research_service.py`
- `backend/migrations/versions/deep_research_004_contract_legacy_state.py`
- [Deep Research API](/backend/api/deep-research.md)
