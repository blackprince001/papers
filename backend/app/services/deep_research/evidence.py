"""Normalize, deduplicate, and persist deep-research evidence."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.deep_research import DeepResearchEvidence
from app.services.deep_research.state import require_bounded_payload


@dataclass(frozen=True)
class EvidenceItem:
  provenance_id: str
  source_type: str
  title: str
  url: str | None
  external_id: str | None
  metadata: dict[str, Any]
  authorization_status: str = "verified"


def collect_context_evidence(extra: dict[str, Any], items: list[dict[str, Any]]) -> None:
  """Add bounded structured evidence to a deep-research tool context."""
  bucket = extra.get("dr_sources")
  if not isinstance(bucket, list):
    return
  remaining = max(0, settings.DEEP_RESEARCH_MAX_EVIDENCE_ITEMS - len(bucket))
  bucket.extend(items[:remaining])


def normalize_url(value: str | None) -> str | None:
  if not value:
    return None
  parsed = urlsplit(value.strip())
  if parsed.scheme not in {"http", "https"} or not parsed.netloc:
    return None
  return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path, parsed.query, ""))


def normalize_evidence(raw: dict[str, Any]) -> EvidenceItem | None:
  title = str(raw.get("title") or "").strip()
  source_type = str(raw.get("source") or raw.get("type") or "web").strip().lower()
  external_id = str(raw["external_id"]).strip() if raw.get("external_id") else None
  url = normalize_url(raw.get("url"))
  if not title or len(title) > 1024 or source_type not in {"academic", "web", "arxiv", "semantic_scholar", "google_scholar", "openalex", "library"}:
    return None
  stable = external_id or url or title.casefold()
  provenance_id = hashlib.sha256(f"{source_type}:{stable}".encode()).hexdigest()
  metadata = {
    key: raw[key]
    for key in ("authors", "year", "citation_count", "pdf_url")
    if raw.get(key) is not None
  }
  metadata["source_quality"] = (
    "user_library" if source_type == "library" else "external_metadata"
  )
  require_bounded_payload(metadata, settings.DEEP_RESEARCH_MAX_EVENT_BYTES)
  return EvidenceItem(
    provenance_id=provenance_id,
    source_type=source_type,
    title=title,
    url=url,
    external_id=external_id,
    metadata=metadata,
  )


async def persist_evidence(
  db: AsyncSession,
  *,
  session_id: int,
  generation_id: int,
  sources: list[dict[str, Any]],
) -> list[EvidenceItem]:
  """Write a generation-scoped, deduplicated evidence ledger."""
  items: dict[str, EvidenceItem] = {}
  for raw in sources[: settings.DEEP_RESEARCH_MAX_EVIDENCE_ITEMS]:
    item = normalize_evidence(raw)
    if item is not None:
      items[item.provenance_id] = item
  existing = {
    row.provenance_id
    for row in (
      await db.execute(
        select(DeepResearchEvidence.provenance_id).where(
          DeepResearchEvidence.generation_id == generation_id
        )
      )
    ).scalars()
  }
  for item in items.values():
    if item.provenance_id in existing:
      continue
    db.add(
      DeepResearchEvidence(
        session_id=session_id,
        generation_id=generation_id,
        provenance_id=item.provenance_id,
        source_type=item.source_type,
        external_id=item.external_id,
        title=item.title,
        url=item.url,
        metadata_json=item.metadata,
        content_hash=hashlib.sha256(
          json.dumps(item.metadata, sort_keys=True).encode()
        ).hexdigest(),
        authorization_status=item.authorization_status,
      )
    )
  await db.commit()
  return list(items.values())
