---
type: Reference
title: Frontend Testing
description: Headless component tests with Vitest and a browser smoke test with Playwright.
resource: frontend-v2/src/test
tags: [frontend, tests, vitest, playwright]
timestamp: 2026-08-16T00:00:00Z
---

# Test layers

- Component and transport tests live under `frontend-v2/src/**/*.test.{ts,tsx}`
  and run with Vitest in jsdom. `parseSSE.test.ts` covers chunk boundaries,
  CRLF/LF framing, event IDs, event-type precedence, comments, and malformed
  payload recovery.
- Browser smoke tests live under `frontend-v2/e2e/` and run with Playwright
  Chromium against the Vite dev server. They cover login, authenticated
  reader/chat, and the deterministic dev review surfaces.
- Bun is the canonical frontend package manager and `frontend-v2/bun.lock` is
  the lockfile updated by these commands. The existing npm lockfile is not
  updated by Bun.

# Commands

From `frontend-v2/`:

```sh
bun run test
bun run test:e2e
bun run build
bun run audit:standards
```

Playwright requires its browser once per machine:

```sh
bunx playwright install chromium
```

The smoke suite includes an unauthenticated login shell and an authenticated
reader fixture. The authenticated path seeds a short-lived test session,
serves a deterministic one-page PDF and API responses, opens the reader,
activates the Chat panel, and asserts the empty conversation/composer shell.
It also guards the tab-registration behavior that must remain idempotent under
React Strict Mode.

# Review URLs

When the Vite dev server is running:

- `/dev/ui?theme=dark&motion=reduced&density=compact&width=narrow` exercises the
  dark, reduced-motion, compact, narrow, offline, long-copy, loading, error,
  and AI-activity fixtures.
- `/dev/icons?theme=light` reviews the barrel-backed icon set and filled/outline
  states.

The standards audit rejects direct icon-file imports and missing explicit
duotone metadata in the icon manifest.
