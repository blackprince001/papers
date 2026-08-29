"""Validation and fingerprinting for reader explanation anchors."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta, timezone
from typing import Any

from app.schemas.annotation import (
  ExplanationAction,
  ExplanationVisibility,
  GroundingRect,
  SemanticAnchor,
)

EXPLANATION_PROMPT_VERSION = "reader-explanation-v1"
DEFAULT_EXPLANATION_RETENTION_DAYS = 30
MAX_IDEMPOTENCY_KEY_LENGTH = 255


def build_semantic_anchor(
  *,
  page: int,
  quoted_text: str,
  rects: Iterable[GroundingRect | Mapping[str, Any]],
  document_revision: str | None = None,
) -> SemanticAnchor:
  """Build one normalized, immutable anchor snapshot from a selection."""

  return SemanticAnchor(
    page=page,
    quoted_text=quoted_text.strip(),
    rects=[
      item if isinstance(item, GroundingRect) else GroundingRect.model_validate(item)
      for item in rects
    ],
    document_revision=document_revision,
  )


def explanation_input_hash(
  *,
  paper_id: int,
  action: ExplanationAction,
  visibility: ExplanationVisibility,
  anchor: SemanticAnchor,
  prompt_version: str = EXPLANATION_PROMPT_VERSION,
) -> str:
  """Return a deterministic cache key for one grounded request."""

  payload = {
    "paper_id": paper_id,
    "action": action,
    "visibility": visibility,
    "prompt_version": prompt_version,
    "anchor": anchor.model_dump(mode="json", exclude_none=True),
  }
  encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
  return hashlib.sha256(encoded).hexdigest()


def explanation_retention_until(
  *,
  now: datetime | None = None,
  retention_days: int = DEFAULT_EXPLANATION_RETENTION_DAYS,
) -> datetime:
  """Return the hard expiry for a newly persisted explanation."""

  if retention_days < 1 or retention_days > 365:
    raise ValueError("retention_days must be between 1 and 365")
  current = now or datetime.now(timezone.utc)
  if current.tzinfo is None:
    current = current.replace(tzinfo=timezone.utc)
  return current + timedelta(days=retention_days)


def normalize_idempotency_key(value: str | None) -> str | None:
  """Normalize the optional request key and reject unbounded header values."""

  if value is None:
    return None
  normalized = value.strip()
  if not normalized:
    return None
  if len(normalized) > MAX_IDEMPOTENCY_KEY_LENGTH:
    raise ValueError("Idempotency-Key must be 255 characters or fewer")
  return normalized
