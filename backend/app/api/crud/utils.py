"""Shared utility functions for CRUD operations."""

from typing import Any

from app.utils.text import sanitize_metadata as _sanitize_metadata

# Re-export for compatibility
sanitize_metadata = _sanitize_metadata


def ensure_loaded(entity: Any, *relationships: str) -> None:
  """Access relationships to trigger eager loading before serialization."""
  for rel in relationships:
    if hasattr(entity, rel):
      attr = getattr(entity, rel)
      if attr is not None:
        _ = list(attr) if hasattr(attr, "__iter__") else attr
