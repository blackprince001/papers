---
type: Runbook
title: Deep Research operations
description: Operate, verify, pause, and roll back the durable deep-research lifecycle.
resource: backend/app/services/deep_research/telemetry.py
tags: [ops, deep-research, release, celery, postgres]
timestamp: 2026-08-29T00:00:00Z
---

This runbook covers the `research` queue, the Postgres event stream, and the
release gate for Deep Research. Keep the research worker separate from the
interactive worker.

# Before release

Run the deterministic gate and the backend/frontend checks from the repository
root:

```sh
cd backend
.venv/bin/python evals/deep_research/v1/run_eval.py --check-release
.venv/bin/pytest -q
cd ../frontend-v2
bun run test -- --run
bun run build
```

The gate must report zero permission violations, an unsupported-claim rate at or
below `0.1`, p95 latency at or below `120` seconds, and mean citation recall at
or above the configured floor. A candidate must also beat the pinned empty
baseline.

# What to watch

The backend emits `deep_research_metric` structured events. Send these fields
to the existing log/metrics system and group by metric, status, phase, provider
type, and model:

| Signal | Useful fields | Starting alert |
|---|---|---|
| API/provider errors | `metric`, `status`, `error_code`, `provider_type` | page when the five-minute rate is above 5% |
| Queue health | `queue_age_ms`, `status`, `phase` | warn above 60 seconds; page above 300 seconds |
| Phase latency | `phase`, `duration_ms` | investigate p95 above the eval threshold |
| Usage/budget | `tokens_in`, `tokens_out`, `cost_usd`, `retry_count` | compare with the configured budget and baseline |
| Source support | `source_count`, `verification_status` | investigate completed runs marked `insufficient_evidence` |
| Stop reasons | `error_code`, `stop_reason`, `status` | watch retry, provider, cancellation, and worker failures |
| Stream health | client reconnect count and SSE lag | investigate repeated reconnects or lag above 5 seconds |
| Abandonment | terminal status and client abandonment event | watch growth after UI or provider releases |

The metric boundary drops unknown fields. Never add questions, reports, evidence
bodies, checkpoints, API keys, access tokens, emails, or direct user/session IDs
to these events.

# Common recovery

1. Check `/health`, the Postgres connection, Redis, and the dedicated `research`
   worker.
2. If the queue is growing, inspect worker capacity and provider errors before
   increasing concurrency. One research worker protects interactive work by
   default.
3. If a provider is unavailable, set
   `DEEP_RESEARCH_MUTATIONS_ENABLED=false` to stop new starts and resumes. This
   leaves existing reports readable and does not delete queued history.
4. Fix the provider or worker, run the eval gate, then restore the setting and
   dispatch the outbox sweep. Outbox rows are safe to retry; generation leases
   fence duplicate workers.
5. For a stuck run, use the cancel endpoint. The worker should write one
   `cancelled` terminal event. Do not delete active rows to force recovery.

# Rollback

Rollback is an application release rollback plus the emergency mutation switch.
Keep `deep_research_004` applied: it fences legacy workers and removes the old
session checkpoint column. If the new application cannot read the migrated
schema, stop mutations, restore the compatible application artifact, and use a
forward migration or a tested database backup. Do not run an ad-hoc destructive
column restore against a live database.

# Migration checks

After deployment verify:

```sh
cd backend
.venv/bin/alembic current
```

The current heads include `deep_research_004` and the independent annotation
head. Query `information_schema.columns` to confirm that
`deep_research_sessions.run_state` is absent. Query active research sessions to
confirm that no pre-cutover worker is still marked active.
