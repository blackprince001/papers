# Architectural Decisions

ADRs explaining the **why** behind structural choices. Each is an OKF concept
of type `ADR`. Add entries here as you make or reverse architectural decisions;
most feature changes are not ADRs.

# Decisions

* [Alembic owns the schema](migrations-own-schema.md) - `init_db()` only ensures the vector extension; `create_all` is DEBUG-only.
* [Global HTTP error envelope](http-error-envelope.md) - all HTTP errors carry `{code, message, detail}`, mirroring the SSE taxonomy.
* [Separate at-rest encryption key](separate-encryption-key.md) - `AI_KEY_ENCRYPTION_KEY` decouples stored AI keys from JWT rotation (MultiFernet fallback).
* [BYO per-user AI providers](byo-ai-providers.md) - chat/feature generation uses each user's own encrypted provider key; the only server key is Google's, for embeddings.
* [Optional openai-agents SDK](optional-agents-sdk.md) - the agents SDK is loaded lazily with a legacy `provider.generate()` fallback so the app runs without it.
* [Sunset legacy AI provider path](sunset-legacy-ai-provider-path.md) - removed BaseAIService and AIProviderRegistry; the agents-SDK path is now required for chat.
* [Consolidated CRUD](consolidated-crud.md) - merged top-level `crud/` into `api/crud/` to eliminate the dual-location split.
* [Per-stream DB sessions](stream-db-session.md) - a fresh `stream_db_session()` exists for SSE generators to avoid asyncpg `MissingGreenlet`.
* [Structured AI error codes over SSE](structured-ai-errors.md) - a fixed error-code taxonomy surfaced over SSE for typed client handling.
* [Tailwind v4 CSS-based config](tailwind-v4-css-config.md) - no `tailwind.config.js`; tokens declared in `@theme`.

See the [architecture overview](/architecture.md) for how these fit together.