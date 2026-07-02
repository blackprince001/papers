---
type: ADR
title: Sunset the legacy BaseAIService/AIProviderRegistry in favor of the agents-SDK path for interactive use
description: >
  The two parallel AI abstractions have been collapsed — BaseAIService and
  AIProviderRegistry are removed. Interactive chat now requires the
  openai-agents SDK; the legacy provider.generate() path is retained only
  for Celery tasks and non-streaming AI features.
tags: [adr, ai, providers, sdk, refactoring]
timestamp: 2026-07-01
---

# Context

The codebase had two parallel AI abstractions:

1. **Legacy path**: `BaseAIService` + `AIProvider` ABC + `AIProviderRegistry`
   singleton — used by `ChatService`, `MultiChatService`, and `AISearchService`
   via inheritance, and by Celery tasks via `get_provider_for_user_sync()`.
2. **Agents-SDK path**: `MultiProviderBuilder` + `Runner.run_streamed()` +
   function tools — used by chat streaming endpoints.

The legacy `BaseAIService` was a thin shim wrapping `get_provider_for_user()`
and `_build_config()`. The `AIProviderRegistry` was a singleton mapping
provider type strings to classes — the same mapping can live as a flat dict.

All five registered providers (`gemini`, `openai`, `openai-compatible`,
`deepseek`, `anthropic`) are OpenAI-compatible, so the agent path can handle
all chat interactions.

# Decision

1. **Remove `BaseAIService`** — inline its two helper methods (`_get_provider`
   and `_build_config`) directly into `ChatService` and `AISearchService`.
   `MultiChatService` inherited from `BaseAIService` but used nothing from it.
2. **Remove `BaseGoogleAIService`** — the deprecated shim that warned on
   construction. No production code imported it.
3. **Remove `AIProviderRegistry` singleton** — replace with a flat
   `_PROVIDER_CLASSES` dict inside `provider_factory.py`, with
   `create_provider()` and `list_provider_types()` as public functions.
4. **Retain the `AIProvider` ABC, `GenerateConfig`, `ProviderConfig`, and
   concrete provider classes** — they remain necessary for:
   - Celery tasks (`ai_tasks.py`, `paper_processing.py`, etc.) that call
     `provider.generate()` synchronously.
   - Non-chat AI features (`AISearchService`, discovery enhancements).
   - Embeddings (`services/embeddings.py` uses `GeminiProvider` directly).
5. **Retain `helpers.py`** — `get_provider_for_user` and
   `get_provider_for_user_sync` are still the resolution entry point for
   Celery tasks and non-chat features. Interactive chat uses
   `resolve_providers()` from the agent path instead.

# Consequences

- The openai-agents SDK is no longer "optional" for chat — chat requires it.
  The `adapt_stream is None` fallback in `chat.py` and `multi_chat.py` now
  returns an error instead of falling back to `provider.generate()`.
- One less singleton (`AIProviderRegistry`) in the codebase.
- `BaseAIService` and `BaseGoogleAIService` are gone — no ambiguous
  inheritance or deprecation warnings.
- Provider type → class registration is a flat, testable dict rather than a
  singleton with `register()` calls at module level.
- Celery tasks and non-chat AI continue to use the `AIProvider` ABC path
  unchanged.

# Related

- [BYO per-user AI providers](/decisions/byo-ai-providers.md)
- [Optional openai-agents SDK](/decisions/optional-agents-sdk.md) — partially
  reversed: the SDK is now required for chat, though the `provider.generate()`
  fallback still exists for batch/background use.
