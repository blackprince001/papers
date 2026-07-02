"""CRUD utility functions for API endpoints.

This package provides reusable CRUD functions for all entities.
"""

# Utilities
# Annotation
from app.api.crud.annotation import (
  create_annotation,
  delete_annotation,
  get_annotation_or_404,
  list_annotations_for_paper,
  update_annotation,
)

# Bookmark
from app.api.crud.bookmark import (
  create_bookmark,
  delete_bookmark,
  get_bookmark_or_404,
  list_bookmarks_for_paper,
)

# ChatSession
from app.api.crud.chat_session import (
  delete_chat_session,
  get_chat_session_or_404,
  list_chat_sessions_for_paper,
)

# Group
from app.api.crud.group import (
  create_group,
  delete_group,
  get_group_or_404,
  get_visible_group_or_404,
  list_groups,
  update_group,
)

# MultiChatSession
from app.api.crud.multi_chat_session import (
  delete_multi_chat_session,
  get_multi_chat_session_or_404,
  list_multi_chat_sessions_for_group,
)

# Paper
from app.api.crud.paper import (
  delete_paper,
  delete_papers_bulk,
  get_paper_or_404,
  get_visible_paper_or_404,
  increment_view_count,
  list_papers,
  update_paper,
  update_priority,
  update_reading_status,
)

# SavedSearch
from app.api.crud.saved_search import (
  create_saved_search,
  delete_saved_search,
  get_saved_search_or_404,
  list_saved_searches,
)

# Tag
from app.api.crud.tag import (
  create_tag,
  delete_tag,
  get_tag_or_404,
  list_tags,
  update_tag,
)

# UserAIProvider
from app.api.crud.user_ai_provider import (
  create_user_ai_provider,
  delete_user_ai_provider,
  get_default_provider,
  get_user_ai_provider,
  list_user_ai_providers,
  set_default_provider,
  update_user_ai_provider,
)

# UserAISettings
from app.api.crud.user_ai_settings import (
  create_user_ai_settings,
  delete_user_ai_settings,
  get_user_ai_settings,
  update_user_ai_settings,
)

# UserPaperState
from app.api.crud.user_paper_state import (
  batch_get_states,
  get_or_create_state,
)
from app.api.crud.utils import ensure_loaded, sanitize_metadata

__all__ = [
  # Utilities
  "ensure_loaded",
  "sanitize_metadata",
  # Paper
  "get_paper_or_404",
  "get_visible_paper_or_404",
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
  "get_visible_group_or_404",
  "list_groups",
  "create_group",
  "update_group",
  "delete_group",
  # ChatSession
  "get_chat_session_or_404",
  "list_chat_sessions_for_paper",
  "delete_chat_session",
  # MultiChatSession
  "get_multi_chat_session_or_404",
  "list_multi_chat_sessions_for_group",
  "delete_multi_chat_session",
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
  # UserPaperState
  "get_or_create_state",
  "batch_get_states",
  # UserAIProvider
  "list_user_ai_providers",
  "get_user_ai_provider",
  "get_default_provider",
  "create_user_ai_provider",
  "update_user_ai_provider",
  "set_default_provider",
  "delete_user_ai_provider",
  # UserAISettings
  "get_user_ai_settings",
  "create_user_ai_settings",
  "update_user_ai_settings",
  "delete_user_ai_settings",
]
