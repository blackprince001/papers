---
type: Reference
title: Backend Tests
description: Test layout and coverage — focused AI-agent and safety-gate tests; no HTTP/DB integration tests currently present.
resource: backend/tests
tags: [backend, tests, pytest]
timestamp: 2026-06-28T00:00:00Z
---

`backend/tests/` is flat (no subdirectories beyond `__pycache__`).

```
backend/tests/
├── conftest.py
├── test_agents.py
├── test_citation_map.py
├── test_context.py
├── test_multi_provider.py
├── test_provider_flow.py
├── test_references.py
├── test_run_config.py
├── test_stream_adapter.py
├── test_tools.py
├── test_agent_tool_authorization.py
├── test_deep_research_event_store.py
├── test_deep_research_limits.py
├── test_deep_research_state.py
├── test_deep_research_freeze.py
└── test_ingestion_url_policy.py
```

# Coverage gap (as of scan)

Most tests target the **AI agent layer** (agents, providers, multi-provider
routing, streaming, run config, BYO context, function tools, reference
resolution, citation map). `test_agent_tool_authorization.py` exercises the
owner, direct-share, group-share, unrelated, orphan, and administrator paper
scopes, including the fail-closed no-identity path. `test_deep_research_limits.py` and `test_deep_research_state.py` cover
research bounds, payloads, active runs, and checked lifecycle transitions.
`test_ingestion_url_policy.py` covers
input, payload, active-run, SSRF, redirect, download-size, and PDF validation
boundaries. `test_deep_research_freeze.py` covers the temporary mutation safety
gate. There are no HTTP/route-level tests
in this directory.

# Tooling

- `pytest` + `pytest-asyncio` (dev group in `pyproject.toml`).
- `pyright` (typecheck) and `ruff` (lint) are the dev toolchain.
- Run backend tests: `uv run pytest` from `backend/`.