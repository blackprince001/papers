---
type: ADR
title: Consolidate CRUD into a single api/crud/ package
description: >
  The top-level crud/ package (user AI config) has been merged into api/crud/,
  eliminating the dual-location split that was confusing to navigate.
tags: [adr, crud, refactoring]
timestamp: 2026-07-01
---

# Context

CRUD logic was split across two locations:

1. `backend/app/api/crud/` — reusable async CRUD helpers for core domain
   entities (papers, annotations, groups, tags, chat sessions, bookmarks,
   saved searches, user paper state).
2. `backend/app/crud/` — user AI provider and settings CRUD, added later for
   the BYO AI feature.

This split was an accident of timing: the AI config feature was added after
the initial CRUD layer, and the new files were placed in a top-level `crud/`
package without an `__init__.py`, making it an incomplete package.

# Decision

Move `user_ai_provider.py` and `user_ai_settings.py` from `backend/app/crud/`
into `backend/app/api/crud/`, add their exports to the existing barrel
`__init__.py`, update all import paths, and remove the old `backend/app/crud/`
directory.

# Consequences

- All CRUD logic is discoverable in one place.
- Consistent import pattern: `from app.api.crud.<domain> import ...`.
- Simpler onboarding — no need to reason about which location a new entity
  belongs in.
