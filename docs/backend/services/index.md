# Services

Business logic + all external integrations in `backend/app/services/`. The
two important subtrees have their own concept docs; the rest are catalogued
in a single file.

# Concepts

* [AI providers](ai-providers.md) - `AIProvider` ABC + implementations (Gemini/OpenAI/Anthropic/DeepSeek/OpenAI-compatible), provider factory.
* [AI agent orchestration](ai-agent.md) - openai-agents SDK: `MultiProviderBuilder`, function tools, stream adapter, BYO context, optional SDK fallback.
* [Discovery providers](discovery-providers.md) - academic source providers (arXiv, Semantic Scholar, OpenAlex, Google Scholar via SerpAPI) + multi-source search orchestration.
* [Services catalog](services-catalog.md) - every other service (ingestion, citations, search, storage, embeddings, email, export, figures, layout, etc.).
* [Access & permissions helpers](access.md) - ownership scoping queries used by CRUD.