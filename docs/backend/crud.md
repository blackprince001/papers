---
type: Module
title: CRUD Layer
description: Consolidated reusable CRUD helpers in api/crud/, covering all domain entities including user AI configuration.
resource: backend/app/api/crud
tags: [backend, crud, data-access]
timestamp: 2026-07-01
---

All CRUD logic lives in a single package: `backend/app/api/crud/`.

# `api/crud/` — the one CRUD location

Reusable async functions consumed by route handlers and services:
`get_*_or_404`, `list_*`, `create_*`, etc. Centralizes **permission scoping**
via `app.services.access` (`apply_visible_papers_filter`,
`visible_groups_clause`).

| File | Entity |
|---|---|
| `paper.py` | Paper, UserPaperState |
| `annotation.py` | Annotation |
| `bookmark.py` | Bookmark |
| `group.py` | Group |
| `tag.py` | Tag |
| `chat_session.py` | ChatSession |
| `multi_chat_session.py` | MultiChatSession |
| `saved_search.py` | SavedSearch |
| `user_paper_state.py` | UserPaperState |
| `user_ai_provider.py` | UserAIProvider |
| `user_ai_settings.py` | UserAISettings |
| `enrichment.py` | Presentation helpers |
| `utils.py` | Generic utilities |

# History

The top-level `backend/app/crud/` package was introduced for the BYO AI config
feature and later consolidated into `api/crud/` during the 2026-07 reformation
to eliminate the split. See the
[consolidated CRUD ADR](/decisions/consolidated-crud.md).
