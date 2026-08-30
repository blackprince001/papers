---
type: Module
title: ORM Models & Pydantic Schemas
description: SQLAlchemy 2.x ORM catalog grouped by domain, and the Pydantic v2 schema-file mapping.
resource: backend/app/models
tags: [backend, models, orm, pydantic, schemas]
timestamp: 2026-06-28T00:00:00Z
---

All ORM models inherit from `Base` (re-exported from `core/database` via
`models/base.py:1`). Centralized exports in `models/__init__.py`. Schemas live
in `backend/app/schemas/` — one Pydantic v2 file per domain.

# Identity & Auth

| Model | Table | Key relationships | Concept links |
|---|---|---|---|
| `User` | `users` (`user.py:9-10`) | Hub: `papers`, `groups`, `tags`, `annotations`, `bookmarks`, `paper_states`, `paper_shares`, `shared_papers`, `group_shares`, `shared_groups`, `reading_sessions`, `chat_sessions`, `multi_chat_sessions`, `saved_searches`, `discovery_sessions`, `deep_research_sessions`, `refresh_tokens` | [security.md](/backend/security.md) |
| `RefreshToken` | `refresh_tokens` (`refresh_token.py:9-10`) | → `User` | token rotation |

# Papers (core library)

| Model | Table | Notes |
|---|---|---|
| `Paper` | `papers` (`paper.py:28-29`) | `uploaded_by` (User), `annotations`, `groups`, `tags` (M2M via `paper_tags`), `reading_sessions`, `user_states`, `shares`, `bookmarks` |
| `PaperCitation` | `paper_citations` (`paper_citation.py:9-10`) | self-referential `paper` + `cited_paper` |
| `DuplicateDetectionLog` | `duplicate_detection_log` (`duplicate_log.py:9-10`) | two `Paper` FKs |

# Reading & Annotation

| Model | Table | Notes |
|---|---|---|
| `Annotation` | `annotations` (`annotation.py:19-20`) | `paper` + `user`; types `annotation` (highlight/comment) vs `note` (freeform) |
| `Bookmark` | `bookmarks` (`bookmark.py:9-10`) | `paper` + `user` |
| `ReadingSession` | `reading_sessions` (`reading_session.py:7-8`) | `paper` + `user` |

# Sharing & Per-User State

| Model | Table | Notes |
|---|---|---|
| `UserPaperState` | `user_paper_state` (`sharing.py:15-16`) | `user` + `paper` |
| `PaperShare` | `paper_shares` (`sharing.py:54-55`) | `paper`, `recipient`, `shared_by` |
| `GroupShare` | `group_shares` (`sharing.py:91-92`) | `group`, `recipient`, `shared_by` |

# Organization

| Model | Table | Notes |
|---|---|---|
| `Group` | `groups` (`group.py:9-10`) | self-referential `parent`/`children`; `user`, `papers` (M2M via `paper_groups`), `shares` |
| `Tag` | `tags` (`tag.py:29-30`) | `papers` (M2M via `paper_tag_association`), `user` |

# Chat

| Model | Table | Notes |
|---|---|---|
| `ChatSession` | `chat_sessions` (`chat.py:9-10`) | `paper`, `user`, `messages` |
| `ChatMessage` | `chat_messages` (`chat.py:48-49`) | `session`, self-ref `parent_message` (thread support) |
| `MultiChatSession` | `multi_chat_sessions` (`multi_chat.py:38-39`) | `user`, `group`, `papers` (M2M), `messages` |
| `MultiChatMessage` | `multi_chat_messages` (`multi_chat.py:81-82`) | `session`, self-ref `parent_message` |

# Citation Map (canvas visualization)

| Model | Table | Notes |
|---|---|---|
| `CitationMapItem` | `citation_map_items` (`citation_map.py:18-19`) | → `paper` |
| `CitationMapPosition` | `citation_map_positions` (`citation_map.py:38-39`) | node positions |
| `CitationMapCache` | `citation_map_cache` (`citation_map.py:61-62`) | graph cache |

# Discovery, Search, AI Config

| Model | Table | Notes |
|---|---|---|
| `DiscoveredPaper` | `discovered_papers` (`discovery.py:48-51`) | `sessions` (M2M) |
| `DiscoverySession` | `discovery_sessions` (`discovery.py:90-93`) | `user`, `papers` (M2M) |
| `DeepResearchSession` | `deep_research_sessions` | Owner, user-facing question/report projection, checked lifecycle/version, current generation, correlation ID, and cancellation flag. Raw checkpoint data is never serialized. |
| `DeepResearchGeneration` | `deep_research_generations` | One versioned run with lease, checkpoint, sequence, and terminal time. |
| `DeepResearchEvent` | `deep_research_events` | Ordered, bounded generation event payloads; Postgres is the SSE replay source. |
| `DeepResearchEvidence` | `deep_research_evidence` | Generation-scoped normalized evidence with stable provenance and authorization metadata. |
| `DeepResearchMessage` | `deep_research_messages` | Bounded durable messages by generation and sequence. |
| `DeepResearchOutbox` | `deep_research_outbox` | Transactional dispatch record with retry availability, publish time, and broker lease. |
| `SavedSearch` | `saved_searches` (`saved_search.py:10-11`) | `user` |
| `UserAIProvider` | `user_ai_providers` (`user_ai_provider.py:17-25`) | `user` backref `ai_providers` |
| `UserAISettings` | `user_ai_settings` (`user_ai_settings.py:12-19`) | `user` backref `ai_settings` |

# Schemas — one Pydantic v2 file per domain

| File | Entities covered |
|---|---|
| `auth.py` | `GoogleAuthRequest`, `AdminLoginRequest`, `TokenResponse`, `RefreshResponse` |
| `user.py` | `UserResponse`, `UserProfileUpdate`, `AdminUserUpdate`, `UserAnalytics` |
| `paper.py` | `PaperMetadata`, `PaperBase/Create/Update/BatchCreate`, `Paper`, `SharedByInfo`, `PaperListResponse`, `PaperUploadResponse`, `BulkRegenerateRequest/Response` |
| `reading_progress.py` | `ReadingStatusUpdate`, `PriorityUpdate`, `PaperReadingProgress`, `ReadingSession*`, `Bookmark*`, `ReadingStatistics`, `ReadingStreak` |
| `annotation.py` | `AnnotationBase/Create/Update/Annotation` |
| `tag.py` | `TagBase/Create/Update/Tag`, `TagListResponse` |
| `group.py` | `GroupBase/Create/Update/Group` |
| `sharing.py` | `ShareRequest`, `ShareUpdate`, `ShareRecipient`, `ShareListResponse` |
| `search.py` | `SearchRequest`, `SearchResult`, `SearchResponse`, `SavedSearch*` |
| `chat.py` | `ChatMessage*`, `ChatSession*`, `ChatRequest/Response`, `ThreadRequest/Response` |
| `multi_chat.py` | `PaperSummary`, `MultiChatMessage*`, `MultiChatSession*`, `MultiChatRequest/Response` |
| `ai_features.py` | `SummaryRequest/Response`, `FindingsResponse`, `ReadingGuideResponse`, `HighlightRequest`, `SelectionRect`, `AIActionRequest` |
| `citation_map.py` | `NodePosition`, `MapNode`, `MapEdge`, `UnresolvedPaper`, `CitationMapResponse`, `FocalCreate`, `PositionUpdate`, `BulkPositions`, `CitedByPaper/Response` |
| `reference.py` | `ReferenceManifestEntry`, `ReferenceManifest`, `BatchResolveRequest/Response` |
| `related.py` | `RelatedPaperExternal`, `RelatedPapersResponse` |
| `discovery.py` | `DiscoverySearchFilters/Request/Response`, `DiscoveredPaper/Preview`, `SourceSearchResult`, `AddToLibrary*`, `BatchAddToLibrary*`, `DiscoverySession*/Detail`, `Recommendation*`, `CitationExplorer*`, `DiscoverySourceInfo/SourcesResponse` |
| `deep_research.py` | `DeepResearchSessionCreate`, `CitedSource`, `DeepResearchSession`, `DeepResearchGenerationSummary`, `DeepResearchArchiveResponse`, `DeepResearchSessionDetail`, and safe conversation/follow-up projections. Execution checkpoints are intentionally absent from schemas. |
| `duplicate.py` | `DuplicateMatch`, `MergeRequest`, `MergePreview` |
| `export.py` | `ExportRequest`, `CitationExportRequest` |
| `huggingface.py` | `HF*` types for HuggingFace Daily Papers |
| `user_ai_provider.py` | `UserAIProviderCreate/Update/Response` |
| `user_ai_settings.py` | `UserAISettingsCreate/Update/Response`, `ProviderTypeInfo`, `ModelInfo`, `ProviderTestRequest/Response` |
