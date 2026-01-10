# Nexus Research Engine - Feature Roadmap

This document outlines the planned features for the Nexus Research Engine. Features are organized by category and include detailed requirements for implementation planning.

## Table of Contents

1. [Paper Reading Progress & Statistics](#1-paper-reading-progress--statistics)
2. [Export & Bibliography Management](#2-export--bibliography-management)
3. [Advanced Search & Filtering](#3-advanced-search--filtering)
4. [Paper Relationships & Graph Visualization](#4-paper-relationships--graph-visualization)
5. [Automated Summaries & Highlights](#5-automated-summaries--highlights)
6. [Duplicate Detection](#6-duplicate-detection)
7. [Tabbed Views](#7-tabbed-views)

---

## 1. Paper Reading Progress & Statistics

### Overview

Track reading progress, statistics, and provide insights to help users manage their research reading workflow.

### Features

#### 1.1 Reading Status Tracking

- **Reading Status States:**
  - Not Started (default)
  - In Progress
  - Read
  - Archived
- **Implementation Notes:**
  - Add `reading_status` field to Paper model
  - Update status through UI (dropdown or quick actions)
  - Status change timestamps for analytics

#### 1.2 Reading Time Tracking

- **Features:**
  - Track time spent reading each paper
  - Automatic tracking when PDF viewer is active
  - Manual time entry/adjustment option
  - Pause/resume tracking
- **Implementation Notes:**
  - Add `reading_time_minutes` field to Paper model
  - Track active reading sessions
  - Store session data (start time, end time, duration)
  - Aggregate total reading time per paper

#### 1.3 Last Read Position/Bookmark

- **Features:**
  - Save last read page number automatically
  - Manual bookmark creation at specific pages
  - Quick jump to last read position when opening paper
  - Multiple bookmarks per paper
- **Implementation Notes:**
  - Add `last_read_page` field to Paper model
  - Add `bookmarks` JSON field or separate Bookmark model
  - Update on page navigation in PDF viewer
  - Display bookmark indicators in PDF viewer

#### 1.4 Reading Statistics Dashboard

- **Metrics to Display:**
  - Papers read this week/month/year
  - Reading streaks (consecutive days with reading activity)
  - Total reading time (all-time, monthly, weekly)
  - Average reading time per paper
  - Reading status distribution (pie/bar chart)
  - Progress towards reading goals
- **Implementation Notes:**
  - New dashboard page/component
  - Aggregate queries for statistics
  - Charts/visualizations (using charting library)
  - Time-based filtering (week, month, year, all-time)

#### 1.5 Priority/Urgency Levels

- **Priority Levels:**
  - Low (default)
  - Medium
  - High
  - Critical
- **Features:**
  - Set priority when adding/editing paper
  - Filter papers by priority
  - Visual indicators (badges, colors) in paper lists
  - Sort papers by priority
- **Implementation Notes:**
  - Add `priority` enum field to Paper model
  - UI controls for setting/updating priority
  - Color coding in UI (red=critical, orange=high, yellow=medium, gray=low)

### Database Changes Required

- Add fields to `papers` table:
  - `reading_status` (enum: 'not_started', 'in_progress', 'read', 'archived')
  - `reading_time_minutes` (integer, default 0)
  - `last_read_page` (integer, nullable)
  - `priority` (enum: 'low', 'medium', 'high', 'critical')
  - `status_updated_at` (datetime, nullable)
  - `last_read_at` (datetime, nullable)
- Optional: Create `reading_sessions` table for detailed time tracking
- Optional: Create `bookmarks` table for multiple bookmarks per paper

---

## 2. Export & Bibliography Management

### Overview

Provide comprehensive export capabilities for papers, citations, and bibliographies in multiple formats.

### Features

#### 2.1 Export Paper Collections

- **Export Formats:**
  - CSV (metadata: title, authors, DOI, URL, tags, groups, reading status, etc.)
  - JSON (full paper data including annotations)
  - RIS (Research Information Systems format)
  - EndNote (compatible format)
- **Export Options:**
  - Export selected papers
  - Export papers from a group
  - Export all papers
  - Include/exclude annotations
  - Include/exclude full text content
- **Implementation Notes:**
  - API endpoints for each export format
  - Frontend export UI (select papers, choose format, download)
  - Batch processing for large exports
  - Progress indicator for large exports

#### 2.2 Batch Citation Export

- **Citation Formats:**
  - APA (American Psychological Association)
  - MLA (Modern Language Association)
  - BibTeX
  - Chicago Style
  - IEEE
- **Features:**
  - Select multiple papers for citation export
  - Export to clipboard or file
  - Generate citations for groups
  - Format preview before export
- **Implementation Notes:**
  - Extend existing `ReferenceFormatter` class
  - Add new format methods (Chicago, IEEE)
  - Batch endpoint: `/api/v1/papers/export/citations`
  - Frontend: multi-select interface with format dropdown

#### 2.3 Bibliography Generation

- **Features:**
  - Generate bibliography from selected papers
  - Generate bibliography from groups
  - Customize citation format
  - Export as formatted document (PDF, DOCX, Markdown)
  - Include/exclude abstracts
  - Sort options (alphabetical, date, custom order)
- **Implementation Notes:**
  - New endpoint: `/api/v1/papers/generate-bibliography`
  - Template engine for document formatting
  - PDF generation library (e.g., ReportLab, WeasyPrint)
  - DOCX generation (python-docx)

### Database Changes Required

- No schema changes needed (uses existing paper metadata)
- May need to cache generated exports for performance

---

## 3. Advanced Search & Filtering

### Overview

Enhance search capabilities with advanced filtering, saved queries, and comprehensive search options.

### Features

#### 3.1 Advanced Filters

- **Filter Criteria:**
  - Date range (created_at, publication date)
  - Authors (single or multiple)
  - Journal/Publisher
  - Tags (single or multiple, AND/OR logic)
  - Reading status (Not Started, In Progress, Read, Archived)
  - Priority level
  - Groups (single or multiple)
  - Has annotations / Has notes
  - Reading time ranges
- **Implementation Notes:**
  - Enhance `/api/v1/search` endpoint with filter parameters
  - Build filter UI component with dropdowns, date pickers, multi-selects
  - Combine filters with AND/OR logic
  - Clear filters button
  - URL parameter support for shareable filtered searches

#### 3.2 Saved Search Queries

- **Features:**
  - Save frequently used search queries with filters
  - Name and describe saved searches
  - Quick access to saved searches from UI
  - Edit/delete saved searches
  - Share saved search URLs
- **Implementation Notes:**
  - New `saved_searches` table (user_id, name, description, query_params JSON, created_at)
  - API endpoints: CRUD for saved searches
  - Frontend: Saved searches sidebar/dropdown
  - Store search parameters as JSON for flexibility

#### 3.3 Full-Text Search

- **Features:**
  - Search across all paper content (not just semantic)
  - Search within paper titles, abstracts, full text
  - Keyword matching with highlighting
  - Combine with semantic search (hybrid search)
  - Search operators (AND, OR, NOT, quotes for exact phrases)
- **Implementation Notes:**
  - PostgreSQL full-text search (tsvector/tsquery)
  - Add full-text search index on `content_text` and `title`
  - Search endpoint: `/api/v1/search/fulltext`
  - Hybrid search endpoint combining semantic + full-text with weighted results
  - Highlight matching text in results

#### 3.4 Hybrid Search (Semantic + Keyword)

- **Features:**
  - Combine semantic similarity with keyword matching
  - Weighted relevance scoring
  - Toggle between semantic-only, keyword-only, and hybrid modes
  - Boost results that match both semantic and keyword criteria
- **Implementation Notes:**
  - Modify search endpoint to accept `search_mode` parameter
  - Implement weighted scoring algorithm
  - UI toggle for search mode selection
  - Display relevance scores in results

#### 3.5 Search Within Annotations/Notes

- **Features:**
  - Search annotation content
  - Search note content
  - Filter search results by papers with matching annotations/notes
  - Highlight matching annotations in paper view
  - Show annotation context in search results
- **Implementation Notes:**
  - Extend search to include annotations table
  - Full-text index on `annotations.content`
  - Search endpoint: `/api/v1/search/annotations`
  - Include annotation previews in search results
  - Link to specific annotation in paper viewer

#### 3.6 Chat Mention Search

- **Features:**
  - When mentioning annotations in chat (`@annotation{id}`), search annotation text content
  - Autocomplete annotation mentions based on content search
  - Search annotations by content when building chat context
- **Implementation Notes:**
  - Enhance chat service to search annotations by content
  - Add annotation search to mention parsing/resolution
  - Autocomplete component in chat input for `@annotation` mentions
  - Search endpoint: `/api/v1/annotations/search` (for chat autocomplete)

### Database Changes Required

- Create `saved_searches` table:
  - `id` (primary key)
  - `user_id` (if multi-user in future, nullable for now)
  - `name` (string)
  - `description` (text, nullable)
  - `query_params` (JSON)
  - `created_at`, `updated_at` (datetime)
- Add full-text search indexes:
  - GIN index on `content_text` (tsvector)
  - GIN index on `title` (tsvector)
  - GIN index on `annotations.content` (tsvector)

---

## 4. Paper Relationships & Graph Visualization

### Overview

Visualize relationships between papers through citations, references, and semantic connections.

### Features

#### 4.1 Citation Graph Visualization

- **Features:**
  - Interactive graph showing which papers cite each other
  - Node = paper, edge = citation/reference relationship
  - Zoom, pan, and click interactions
  - Hover to see paper details
  - Click node to navigate to paper
  - Filter by date range, topic, or group
  - Different node colors for different categories (tags, groups)
- **Implementation Notes:**
  - Graph visualization library (D3.js, vis.js, or Cytoscape.js)
  - Use Semantic Scholar API data for citation relationships
  - Cache citation graph data
  - Endpoint: `/api/v1/papers/{id}/citation-graph`
  - Frontend: New graph visualization component/page

#### 4.2 Research Timeline Visualization

- **Features:**
  - Timeline view of papers by publication date
  - Show research evolution over time
  - Filter by topic, author, or group
  - Color-code by tags or reading status
  - Interactive timeline with zoom levels (year, month, week)
- **Implementation Notes:**
  - Timeline visualization library (Timeline.js, Vis.js Timeline)
  - Extract publication dates from paper metadata
  - Endpoint: `/api/v1/papers/timeline`
  - Frontend: Timeline component/page

#### 4.3 Concept Maps/Relationship Graphs

- **Features:**
  - Visualize semantic relationships between papers
  - Clustering by topic/similarity
  - Show papers that are semantically similar
  - Interactive exploration of paper clusters
  - Export graph as image
- **Implementation Notes:**
  - Use embedding similarity for relationship detection
  - Graph layout algorithm (force-directed, hierarchical)
  - Clustering algorithm (K-means, community detection)
  - Endpoint: `/api/v1/papers/semantic-graph`
  - Performance optimization for large paper collections

#### 4.4 Citation Views

- **Features:**
  - "Papers that cite this" view
  - "Papers cited by this" view
  - Inbound and outbound citation counts
  - Navigate citation chains
  - Show citation context (where in the paper it's cited)
- **Implementation Notes:**
  - Use Semantic Scholar API for citation data
  - Cache citation relationships in database (optional)
  - New table: `paper_citations` (paper_id, cited_paper_id, citation_context)
  - Endpoint: `/api/v1/papers/{id}/citations` and `/api/v1/papers/{id}/cited-by`
  - Frontend: Citation sidebar/panel in paper detail view

### Database Changes Required

- Optional: `paper_citations` table for caching citation relationships:
  - `id` (primary key)
  - `paper_id` (foreign key to papers)
  - `cited_paper_id` (foreign key to papers, nullable - external papers)
  - `citation_context` (text, nullable - excerpt from paper)
  - `external_paper_title` (string, nullable - for papers not in database)
  - `external_paper_doi` (string, nullable)
  - `created_at` (datetime)

---

## 5. Automated Summaries & Highlights

### Overview

Leverage AI to automatically generate summaries, extract key information, and create reading guides.

### Features

#### 5.1 Auto-Generate Paper Summaries

- **Features:**
  - Generate abstract/summary using AI (Gemini)
  - Executive summary (1-2 paragraphs)
  - Detailed summary (section-by-section)
  - Regenerate summary option
  - Manual override/edit of auto-generated summary
- **Implementation Notes:**
  - Add `ai_summary` field to Paper model
  - Add `summary_generated_at` timestamp
  - Background job or on-demand generation
  - Endpoint: `/api/v1/papers/{id}/generate-summary`
  - Cache summaries to avoid re-generation
  - Frontend: Display summary in paper detail view

#### 5.2 Extract Key Findings/Conclusions

- **Features:**
  - Auto-extract key findings from paper
  - Extract conclusions
  - Extract methodology highlights
  - Extract limitations/future work
  - Structured extraction (bullet points or structured data)
- **Implementation Notes:**
  - Add `key_findings` JSON field to Paper model
  - Use AI to parse and extract structured information
  - Endpoint: `/api/v1/papers/{id}/extract-findings`
  - Display in dedicated section of paper detail view
  - Editable after extraction

#### 5.3 Auto-Highlight Important Sections

- **Features:**
  - Automatically identify and highlight:
    - Methods section
    - Results section
    - Conclusions section
    - Key contributions
  - Different highlight colors for different section types
  - Toggle auto-highlights on/off
  - Manual override/editing of highlights
- **Implementation Notes:**
  - Store auto-highlights as special annotation type
  - Add `auto_highlighted` boolean flag to annotations
  - Background processing job
  - Endpoint: `/api/v1/papers/{id}/generate-highlights`
  - Display in PDF viewer with different styling
  - Frontend: Toggle visibility of auto-highlights

#### 5.4 Generate Reading Guides/Questions

- **Features:**
  - Auto-generate reading questions for each paper
  - Generate study guide based on paper content
  - Questions organized by section (before reading, during reading, after reading)
  - Export reading guide as document
- **Implementation Notes:**
  - Add `reading_guide` JSON field to Paper model
  - Structure: `{ "pre_reading": [...], "during_reading": [...], "post_reading": [...] }`
  - Endpoint: `/api/v1/papers/{id}/generate-reading-guide`
  - Frontend: Reading guide panel/section in paper detail view
  - Mark questions as completed (interactive checklist)

### Database Changes Required

- Add fields to `papers` table:
  - `ai_summary` (text, nullable)
  - `summary_generated_at` (datetime, nullable)
  - `key_findings` (JSON, nullable)
  - `findings_extracted_at` (datetime, nullable)
  - `reading_guide` (JSON, nullable)
  - `guide_generated_at` (datetime, nullable)
- Modify `annotations` table:
  - Add `auto_highlighted` (boolean, default false)
  - Add `highlight_type` (enum: 'method', 'result', 'conclusion', 'key_contribution', nullable)

---

## 6. Duplicate Detection

### Overview

Detect and manage duplicate papers to maintain a clean, organized paper collection.

### Features

#### 6.1 Duplicate Detection

- **Detection Methods:**
  - DOI matching (primary method)
  - Title similarity (fuzzy matching)
  - URL similarity
  - Content similarity (using embeddings)
  - Author + title combination matching
- **Features:**
  - Automatic detection on paper ingestion
  - Manual duplicate check endpoint
  - Batch duplicate detection for existing papers
  - Confidence score for duplicate matches
- **Implementation Notes:**
  - Similarity thresholds configurable
  - Use fuzzy string matching (Levenshtein distance, Jaccard similarity)
  - Embedding similarity for content-based detection
  - Endpoint: `/api/v1/papers/check-duplicates`
  - Endpoint: `/api/v1/papers/{id}/find-duplicates`
  - Background job for batch detection
  - UI: Duplicate detection results panel

#### 6.2 Duplicate Warning on Ingestion

- **Features:**
  - Check for duplicates before/after ingestion
  - Show warning if potential duplicate found
  - Display existing paper details
  - Options: Cancel, Add anyway, Merge
- **Implementation Notes:**
  - Pre-ingestion duplicate check
  - Return potential duplicates in ingestion response
  - Frontend: Modal/dialog showing duplicates with comparison
  - User choice: proceed with ingestion or merge

#### 6.3 Duplicate Merging

- **Merge Actions:**
  - Keep primary paper (user selects which one)
  - Merge annotations from duplicate into primary
  - Merge notes from duplicate into primary
  - Merge tags
  - Merge group associations
  - Merge reading progress (keep maximum values)
  - Merge metadata (prefer more complete metadata)
- **Features:**
  - Preview merge before executing
  - Undo merge option (with audit log)
  - Delete merged duplicate paper
- **Implementation Notes:**
  - Endpoint: `/api/v1/papers/merge`
  - Transaction-based merge to ensure data integrity
  - Create merge audit log entry
  - Update all references to merged paper
  - Frontend: Merge wizard/UI with preview
  - Handle edge cases (duplicate has annotations on same pages, etc.)

### Database Changes Required

- Add fields to `papers` table:
  - `merged_from_paper_id` (foreign key, nullable) - tracks if paper was created from merge
  - `is_duplicate_of` (foreign key, nullable) - marks as duplicate (soft delete alternative)
- Optional: `duplicate_detection_log` table for audit:
  - `id` (primary key)
  - `paper_id` (foreign key)
  - `duplicate_paper_id` (foreign key)
  - `confidence_score` (float)
  - `detection_method` (string)
  - `detected_at` (datetime)
  - `merged` (boolean, default false)
  - `merged_at` (datetime, nullable)

---

## 7. Tabbed Views

### Overview

Allow users to open multiple papers simultaneously in tabbed interface for easy navigation between papers.

### Features

#### 7.1 Tab Management

- **Features:**
  - Open paper in new tab
  - Close tab
  - Switch between tabs
  - Tab context persistence (current page, zoom level, sidebar state)
  - Pin tabs (keep important papers open)
  - Tab reordering (drag and drop)
- **Implementation Notes:**
  - Frontend state management for tabs (React Context or Zustand/Redux)
  - Tab component with paper title, close button, active indicator
  - Persist tab state in localStorage/sessionStorage
  - URL-based tab management (each tab has unique URL/route)
  - Handle browser back/forward navigation

#### 7.2 Tab Features

- **Features:**
  - Tab title shows paper title (truncated if long)
  - Tab icon/badge for unread annotations or reading status
  - Unsaved changes indicator (if editing annotations)
  - Tab context menu (close, close others, close all, pin/unpin)
  - Keyboard shortcuts (Ctrl+T for new tab, Ctrl+W to close, etc.)
- **Implementation Notes:**
  - Tab state includes: paper_id, current_page, zoom_level, sidebar_open, active_annotations
  - Restore tab state when switching between tabs
  - Debounce state saves to avoid performance issues
  - Tab limit (e.g., max 10 tabs) with warning

#### 7.3 Multi-Paper Viewing

- **Features:**
  - Side-by-side paper comparison (optional)
  - Split view for comparing papers
  - Tab groups (organize related papers)
- **Implementation Notes:**
  - Optional advanced feature
  - Requires layout management system
  - State management for multiple paper viewers

### Database Changes Required

- No database changes needed (handled in frontend state/session storage)
- Optional: Store recent tabs/session in database for cross-device sync (future enhancement)

---

## Implementation Priority Recommendations

### Phase 1 (High Priority - Core Features)

1. **Paper Reading Progress & Statistics** - Foundation for reading workflow
2. **Tabbed Views** - Essential UX improvement
3. **Advanced Search & Filtering** - Critical as library grows

### Phase 2 (Medium Priority - Enhanced Functionality)

4. **Duplicate Detection** - Maintains data quality
2. **Export & Bibliography Management** - High user value for writing/research
3. **Search Within Annotations/Notes** - Completes search functionality

### Phase 3 (Lower Priority - Advanced Features)

7. **Paper Relationships & Graph Visualization** - Nice-to-have visualization
2. **Automated Summaries & Highlights** - AI enhancement, depends on API costs

## Notes for Implementation

- **Backward Compatibility**: All new features should be optional and not break existing functionality
- **Performance**: Consider indexing, caching, and background jobs for heavy operations
- **User Experience**: Features should be discoverable and intuitive
- **Testing**: Comprehensive testing for data integrity (especially merge operations)
- **Migration**: Database migrations should handle existing data gracefully
- **Documentation**: API documentation updates for new endpoints
- **Error Handling**: Graceful degradation when AI services are unavailable

---

*Last Updated: [Current Date]*
*Document Version: 1.0*
