---
okf_version: "0.1"
---

# Papers / Lumen — Knowledge Bundle

A conformance OKF v0.1 bundle documenting the `papers` codebase: a FastAPI
backend, a React SPA (`frontend-v2`, product name "Lumen"), a standalone
marketing site (`landing/`), and Docker/Traefik infrastructure.

Start here, then drill into a subdirectory's own `index.md` for progressive
disclosure. Individual concept files use YAML frontmatter with a required
`type` field; see the [architecture overview](/architecture.md) for the
system map.

# Top-level concepts

* [Architecture](architecture.md) - top-level system map: project type, directory tree, module overview, data flow, external dependencies.
* [Reformation](reformation.md) - whole-project assessment: usage-side pitfalls, backend improvements, feature considerations, and additional things to track (references the [deep-research plan](/features/deep-research.md)).
* [Backend](backend/) - FastAPI + Celery application server (Python 3.13).
* [Frontend](frontend/) - React 19 SPA "Lumen" (TypeScript, Vite 7, Tailwind v4).
* [Landing](landing/) - separate React/Vite marketing site (no router).
* [Infrastructure](infra/) - Docker Compose, Traefik, environment configuration.
* [Decisions](decisions/) - architectural decision records (the "why").
* [Features](features/) - feature design/plan concepts (currently: [deep-research](/features/deep-research.md), now implemented).
* [Operations](ops/) - release and recovery runbooks.

# How to use this bundle

1. Open [architecture.md](/architecture.md) first for the system map.
2. For a given subsystem, open its directory `index.md` to see what concepts
   exist before opening individual documents.
3. Every cross-link is a markdown link: absolute (bundle-relative, `/path.md`)
   or relative (`./other.md`). Broken links are tolerated — they may be
   not-yet-written knowledge.
4. See [log.md](/log.md) for the update history of this bundle.
