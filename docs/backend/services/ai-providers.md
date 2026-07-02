---
type: Module
title: AI Provider Implementations
description: The concrete AIProvider ABC and implementations (Gemini, OpenAI, Anthropic, DeepSeek, OpenAI-compatible), with registration in provider_factory.py.
resource: backend/app/services/ai/providers
tags: [backend, ai, providers, byo, gemini, openai, anthropic, deepseek]
timestamp: 2026-07-01
---

`backend/app/services/ai/providers/` contains the concrete `AIProvider`
implementations. Provider type → class mapping lives in a flat dict inside
`provider_factory.py`.

# `providers/base.py`

`AIProvider` ABC + `ProviderConfig`/`GenerateConfig` dataclasses + error
hierarchy (`AIProviderError`, `RateLimitError`, `AuthError`).

# Provider classes

| Type | Class | File | Client |
|---|---|---|---|
| `gemini` | `GeminiProvider` | `providers/gemini.py` | `google.genai` |
| `openai` | `OpenAIProvider` | `providers/openai_compatible.py` | `openai.AsyncOpenAI` |
| `openai-compatible` | `OpenAICompatibleProvider` | `providers/openai_compatible.py` | `openai.AsyncOpenAI` |
| `deepseek` | `DeepSeekProvider` | `providers/openai_compatible.py` | `openai.AsyncOpenAI` |
| `anthropic` | `AnthropicProvider` | `providers/openai_compatible.py` | `openai.AsyncOpenAI` |

# `provider_factory.py`

The registry (`AIProviderRegistry` singleton) was removed in the 2026-07
reformation. Provider type → class lookup is now a flat dict
`_PROVIDER_CLASSES` inside `provider_factory.py`, with two public functions:

- `create_provider(provider_type, config)` — instantiate a provider from type
  string + `ProviderConfig`.
- `list_provider_types()` — list registered types with metadata (for the
  `/ai/providers` endpoint).

The legacy `BaseAIService` class was also removed; its `_get_provider` and
`_build_config` helper methods were inlined into the two services that used
them (`ChatService` and `AISearchService`).

# `helpers.py`

`get_provider_for_user(db_session, user_id)` / `get_provider_for_user_sync(user_id)`
— resolution order for async (FastAPI) and sync (Celery) contexts:
1. A pinned `user_ai_providers` row (if `preferred_provider_id` given).
2. The default/active `user_ai_providers` row.
3. The legacy `user_ai_settings` row (last resort).
4. `None` (caller handles the "no provider" case).

These helpers remain for Celery tasks and non-chat AI features. Interactive
chat uses `resolve_providers()` from the agents-SDK path instead — see
[ai-agent.md](/backend/services/ai-agent.md).

# Embeddings

**Google-only** embedding service (`services/embeddings.py`) uses
`GOOGLE_API_KEY` directly (`gemini-embedding-001`, 768-dim). Embeddings are
**not** part of the BYO system — only chat/feature generation is.

# Resource-listing & testing

`/ai/models` (OpenRouter catalog) and `/ai/providers/test` (connection smoke
test) are exposed on the `ai-settings` router — see
[ai.md](/backend/api/ai.md).
