"""CRUD utility functions for API endpoints.

This package provides reusable CRUD functions for all entities.
"""

# Utilities
from app.api.crud.utils import ensure_loaded, sanitize_metadata

# Paper
from app.api.crud.paper import (
  delete_paper,
  delete_papers_bulk,
  get_paper_or_404,
  increment_view_count,
  list_papers,
  update_paper,
  update_priority,
  update_reading_status,
)

# Tag
from app.api.crud.tag import (
  create_tag,
  delete_tag,
  get_tag_or_404,
  list_tags,
  update_tag,
)

# Annotation
from app.api.crud.annotation import (
  create_annotation,
  delete_annotation,
  get_annotation_or_404,
  list_annotations_for_paper,
  update_annotation,
)

# Group
from app.api.crud.group import (
  create_group,
  delete_group,
  get_group_or_404,
  list_groups,
  update_group,
)

# ChatSession
from app.api.crud.chat_session import (
  delete_chat_session,
  get_chat_session_or_404,
  list_chat_sessions_for_paper,
)

# SavedSearch
from app.api.crud.saved_search import (
  create_saved_search,
  delete_saved_search,
  get_saved_search_or_404,
  list_saved_searches,
)

# Bookmark
from app.api.crud.bookmark import (
  create_bookmark,
  delete_bookmark,
  get_bookmark_or_404,
  list_bookmarks_for_paper,
)

__all__ = [
  # Utilities
  "ensure_loaded",
  "sanitize_metadata",
  # Paper
  "get_paper_or_404",
  "list_papers",
  "update_paper",
  "delete_paper",
  "delete_papers_bulk",
  "increment_view_count",
  "update_reading_status",
  "update_priority",
  # Tag
  "get_tag_or_404",
  "list_tags",
  "create_tag",
  "update_tag",
  "delete_tag",
  # Annotation
  "get_annotation_or_404",
  "list_annotations_for_paper",
  "create_annotation",
  "update_annotation",
  "delete_annotation",
  # Group
  "get_group_or_404",
  "list_groups",
  "create_group",
  "update_group",
  "delete_group",
  # ChatSession
  "get_chat_session_or_404",
  "list_chat_sessions_for_paper",
  "delete_chat_session",
  # SavedSearch
  "get_saved_search_or_404",
  "list_saved_searches",
  "create_saved_search",
  "delete_saved_search",
  # Bookmark
  "get_bookmark_or_404",
  "list_bookmarks_for_paper",
  "create_bookmark",
  "delete_bookmark",
]
