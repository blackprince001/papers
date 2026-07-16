---
type: Reference
title: Frontend Routing
description: createBrowserRouter (React Router v7) route table — protected vs public, lazy GroupsFinder, admin route protection.
resource: frontend-v2/src/router.tsx
tags: [frontend, routing, react-router, auth]
timestamp: 2026-06-28T00:00:00Z
---

`frontend-v2/src/router.tsx:32-81` — `createBrowserRouter`.

# Public routes

| Path | Component | Line |
|---|---|---|
| `/login` | `pages/Login.tsx` (Google sign-in) | `:33` |
| `/admin/login` | `pages/AdminLogin.tsx` (username/password) | `:34` |

# Protected routes (wrapped in `<ProtectedRoute><Layout/></ProtectedRoute>`, rendered into `Layout`'s `<Outlet>`)

| Path | Component | Notes |
|---|---|---|
| `/` (index) | `pages/Home.tsx` | hero + recent papers |
| `/papers` | `pages/PapersList.tsx` | full library list/table |
| `/papers/:id` | `pages/PaperDetail.tsx` | gets tab bar + chat panel; deep-links via `?page=`/`?focus=` |
| `/papers/:id/chat` | `pages/PaperChat.tsx` | standalone full-page chat |
| `/groups` | `pages/GroupsFinder.tsx` | **lazy-loaded** (Suspense) — keeps pdfjs/heavy icons out of the main chunk |
| `/groups/:id` | `pages/GroupRedirect.tsx` | redirects to finder path |
| `/search` | `pages/Search.tsx` | fulltext/semantic |
| `/dashboard` | `pages/Dashboard.tsx` | reading stats |
| `/annotations` | `pages/Annotations.tsx` | cross-paper annotations |
| `/citations` | `pages/Citations.tsx` | citation graph/list |
| `/ingest` | `pages/Ingest.tsx` | upload + URLs; accepts `preselectedGroupIds` via router state |
| `/export` | `pages/Export.tsx` | exports selected papers (receives `paperIds` from Finder nav state) |
| `/discovery` | `pages/Discovery.tsx` | AI discovery |
| `/recommendations` | `pages/Recommendations.tsx` | "For You" |
| `/discovery-archive` | `pages/DiscoveryArchive.tsx` | saved sessions |
| `/deep-research` | `pages/DeepResearch.tsx` | composer + live deep-research run (streamed report, cited sources, resume) — see [/features/deep-research.md](/features/deep-research.md) |
| `/deep-research-archive` | `pages/DeepResearchArchive.tsx` | past deep-research runs (open/delete, resume on paused) |
| `/huggingface-papers` | `pages/HuggingFacePapers.tsx` | HF Daily Papers |
| `/settings` | `pages/Settings.tsx` | profile + AI provider config |
| `/author`, `/author/search` | `pages/AuthorSearch.tsx` | author search |
| `/author/:id` | `pages/AuthorDetail.tsx` | author profile |
| `/admin/users` | `pages/UserManagement.tsx` | **double-protected** with `<ProtectedRoute requireAdmin>` |

`errorElement: <ErrorPage />` on the root layout route (`router.tsx:42`).

# Route protection logic

`src/components/ProtectedRoute.tsx:10-24`: spinner while `isLoading`;
`<Navigate to="/login" replace/>` if unauthenticated (`:21`); `<Navigate to="/"
replace/>` if `requireAdmin` and not admin (`:22`). See
[auth-flow.md](auth-flow.md).