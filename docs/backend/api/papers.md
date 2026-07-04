---
type: API Collection
title: Papers & Library API
description: Paper ingestion (URL/upload/batch), the papers CRUD surface, annotations, groups, tags, citations/relationships, citation-map canvas, duplicates, and export.
resource: backend/app/api
tags: [backend, api, papers, library, annotations, groups]
timestamp: 2026-06-28T00:00:00Z
---

Library-domain routers under prefix `/api/v1`. Path-param `paper_id` is looked
up via the `get_paper_or_404` dependency (eager-loads `tags`) — see
[dependencies.md](/backend/dependencies.md).

# `ingest.py` (tag `ingest`)

| Method | Path | Line | Notes |
|---|---|---|---|
| POST | `/ingest` | `:63` | metadata-only ingest |
| POST | `/ingest/upload` | `:142` | PDF upload |
| POST | `/ingest/batch` | `:329` | batch ingest |
| POST | `/ingest/urls` | `:386` | URL-based ingest (arXiv/DOI/etc.) |

# `papers.py` (tag `papers`) — the largest router

| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/papers` | `:178` | `PaperListResponse` |
| GET | `/papers/recent` | | server-side recents: papers ordered by `UserPaperState.last_opened_at` (touched on every paper open); registered before `{paper_id}` |
| GET | `/papers/{paper_id}` | `:338` | increments `viewed_count` and touches `last_opened_at` |
| GET | `/papers/{paper_id}/file` | `:348` | PDF blob |
| GET | `/papers/{paper_id}/layout` | `:367` | per-page text/figure layout |
| GET | `/papers/{paper_id}/figures/{index}/thumbnail` | `:395` | figure PNG for vision analysis |
| PATCH | `/papers/{paper_id}` | `:431` | |
| DELETE | `/papers/{paper_id}` | `:453` | |
| DELETE | `/papers` | `:462` | bulk delete |
| GET | `/papers/{paper_id}/reference` | `:473` | reference manifest |
| GET | `/papers/{paper_id}/related` | `:497` | |
| POST | `/papers/{paper_id}/regenerate-metadata` | `:600` | |
| POST | `/papers/regenerate-metadata-bulk` | `:651` | |
| POST | `/papers/{paper_id}/extract-citations` | `:709` | |
| PATCH | `/papers/{paper_id}/reading-status` | `:752` | |
| PATCH | `/papers/{paper_id}/priority` | `:767` | |
| GET | `/papers/{paper_id}/reading-progress` | `:782` | |
| POST | `/papers/{paper_id}/reading-session/start` | `:803` | |
| POST | `/papers/{paper_id}/reading-session/end` | `:833` | |
| GET / POST | `/papers/{paper_id}/bookmarks` | `:891 / :902` | list / create |
| DELETE | `/papers/{paper_id}/bookmarks/{bookmark_id}` | `:922` | |
| GET | `/shared-with-me` | `:934` | |
| POST | `/papers/{paper_id}/share` | `:979` | |
| GET | `/papers/{paper_id}/shares` | `:1078` | |
| PATCH | `/papers/{paper_id}/share/{target_user_id}` | `:1095` | |
| DELETE | `/papers/{paper_id}/share/me` | `:1125` | leave share |
| DELETE | `/papers/{paper_id}/share/{target_user_id}` | `:1144` | revoke |
| POST | `/papers/backfill-layouts` | `:1177` | |

# `annotations.py` (tag `annotations`)

POST `/papers/{paper_id}/annotations` (`:27`); GET `/papers/{paper_id}/annotations`
(`:51`); GET/ PATCH/ DELETE `/annotations/{annotation_id}` (`:68 / :79 / :101`).

# `groups.py` (tag `groups`)

CRUD: GET/ POST `/groups` (`:83/:98`), GET/ PATCH/ DELETE `/groups/{group_id}`
(`:113/:128/:150`); sharing: POST `/groups/{group_id}/share` (`:172`), GET
`/groups/{group_id}/shares` (`:264`), PATCH/ DELETE
`/groups/{group_id}/share/{target_user_id}` (`:279/:322`), DELETE
`/groups/{group_id}/share/me` (`:305`).

# `tags.py` (tag `tags`)

GET/ POST `/tags` (`:14/:28`); GET/ PATCH/ DELETE `/tags/{tag_id}`
(`:36/:44/:60`).

# `relationships.py` (tag `relationships`)

GET `/papers/{paper_id}/citation-graph` (`:21`); `/citations-list` (`:36`);
`/citations` (`:77`); `/cited-by` (`:104`); `/papers/timeline` (`:131`);
`/papers/{paper_id}/semantic-graph` (`:137`).

# `citation_map.py` (tag `citation-map`) — canvas viz backing

GET `/citation-map` (`:34`); POST `/citation-map/focal` (`:40`); DELETE
`/citation-map/focal/{paper_id}` (`:64`); POST `/citation-map/positions`
(`:86`); DELETE `/citation-map` (`:125`); GET `/citation-map/cited-by/{paper_id}`
(`:140`). Backed by `CitationMapItem`/`CitationMapPosition`/`CitationMapCache`
(see [models.md](/backend/models.md)).

# `duplicates.py` (tag `duplicates`)

POST `/papers/{paper_id}/find-duplicates` (`:18`); POST `/papers/merge`
(`:42`); GET `/papers/{paper_id}/merge-preview` (`:66`).

# `export.py` (tag `export`)

POST `/papers/export` (`:27`); POST `/papers/export/citations` (`:100`); POST
`/papers/export/bibliography` (`:133`). Formats incl. CSV/JSON/BibTeX/apa/mla
— see services [`export_service`](/backend/services/services-catalog.md).