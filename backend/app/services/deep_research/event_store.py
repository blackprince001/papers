"""Durable generation-scoped event storage and opaque SSE cursors."""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.deep_research import (
  DeepResearchEvent,
  DeepResearchGeneration,
  DeepResearchSession,
)
from app.services.deep_research.state import payload_bytes, require_bounded_payload


class InvalidCursor(ValueError):
  """Raised for a malformed or tampered SSE cursor."""


class DuplicateTerminalEvent(RuntimeError):
  """Raised when a generation already has its terminal event."""


class StaleGeneration(ValueError):
  """Raised when a cursor belongs to an older research generation."""


@dataclass(frozen=True)
class StoredEvent:
  generation_number: int
  sequence: int
  event_type: str
  payload: dict[str, Any]
  correlation_id: str


_CURSOR_VERSION = "1"


def encode_cursor(generation_number: int, sequence: int) -> str:
  body = f"{_CURSOR_VERSION}:{generation_number}:{sequence}".encode()
  signature = hmac.new(
    settings.JWT_SECRET_KEY.encode(), body, hashlib.sha256
  ).digest()[:16]
  return base64.urlsafe_b64encode(body + b":" + signature).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[int, int]:
  try:
    padded = cursor + "=" * (-len(cursor) % 4)
    raw = base64.urlsafe_b64decode(padded.encode())
    version, generation, sequence, signature = raw.split(b":", 3)
    expected = hmac.new(
      settings.JWT_SECRET_KEY.encode(),
      b":".join((version, generation, sequence)),
      hashlib.sha256,
    ).digest()[:16]
    if version.decode() != _CURSOR_VERSION or not hmac.compare_digest(signature, expected):
      raise InvalidCursor("Invalid event cursor")
    generation_number = int(generation)
    sequence_number = int(sequence)
    if generation_number < 1 or sequence_number < 0:
      raise InvalidCursor("Invalid event cursor")
    return generation_number, sequence_number
  except (ValueError, TypeError, UnicodeDecodeError) as exc:
    if isinstance(exc, InvalidCursor):
      raise
    raise InvalidCursor("Invalid event cursor") from exc


class EventStore:
  """Append-only event store with per-generation monotonic sequences."""

  async def append(
    self,
    db: AsyncSession,
    *,
    session_id: int,
    generation_id: int,
    event: dict[str, Any],
    correlation_id: str,
    commit: bool = True,
  ) -> StoredEvent:
    event_type = str(event.get("type") or "data")
    require_bounded_payload(event, settings.DEEP_RESEARCH_MAX_EVENT_BYTES)
    generation = (
      await db.execute(
        select(DeepResearchGeneration)
        .where(DeepResearchGeneration.id == generation_id)
        .with_for_update()
      )
    ).scalar_one()
    if int(generation.session_id) != session_id:
      raise ValueError("Generation does not belong to session")
    if event_type in {"done", "error", "paused", "cancelled"}:
      terminal = (
        await db.execute(
          select(DeepResearchEvent.id).where(
            DeepResearchEvent.generation_id == generation_id,
            DeepResearchEvent.event_type.in_(["done", "error", "paused", "cancelled"]),
          ).limit(1)
        )
      ).scalar_one_or_none()
      if terminal is not None:
        raise DuplicateTerminalEvent("Generation already has a terminal event")
    sequence = int(generation.last_event_sequence or 0) + 1
    payload = dict(event)
    payload_bytes_count = payload_bytes(payload)
    row = DeepResearchEvent(
      session_id=session_id,
      generation_id=generation_id,
      sequence=sequence,
      event_type=event_type,
      payload=payload,
      payload_bytes=payload_bytes_count,
      correlation_id=correlation_id,
    )
    db.add(row)
    generation.last_event_sequence = sequence
    session = await db.get(DeepResearchSession, session_id, with_for_update=True)
    if session is not None:
      session.last_event_sequence = int(session.last_event_sequence or 0) + 1
    if commit:
      await db.commit()
    return StoredEvent(
      generation_number=int(generation.generation_number),
      sequence=sequence,
      event_type=event_type,
      payload=payload,
      correlation_id=correlation_id,
    )

  async def generation(
    self, db: AsyncSession, session_id: int, generation_number: int | None = None
  ) -> DeepResearchGeneration | None:
    query = select(DeepResearchGeneration).where(
      DeepResearchGeneration.session_id == session_id
    )
    if generation_number is not None:
      query = query.where(
        DeepResearchGeneration.generation_number == generation_number
      )
    else:
      query = query.order_by(DeepResearchGeneration.generation_number.desc())
    return (await db.execute(query.limit(1))).scalar_one_or_none()

  async def after(
    self,
    db: AsyncSession,
    *,
    generation_id: int,
    after_sequence: int = 0,
    limit: int = 100,
  ) -> list[StoredEvent]:
    generation = await db.get(DeepResearchGeneration, generation_id)
    if generation is None:
      return []
    rows = (
      await db.execute(
        select(DeepResearchEvent)
        .where(
          DeepResearchEvent.generation_id == generation_id,
          DeepResearchEvent.sequence > after_sequence,
        )
        .order_by(DeepResearchEvent.sequence)
        .limit(min(max(limit, 1), 500))
      )
    ).scalars().all()
    return [
      StoredEvent(
        generation_number=int(generation.generation_number),
        sequence=int(row.sequence),
        event_type=row.event_type,
        payload=row.payload,
        correlation_id=row.correlation_id,
      )
      for row in rows
    ]


async def store_event(
  db: AsyncSession,
  *,
  session_id: int,
  generation_id: int,
  event: dict[str, Any],
  correlation_id: str,
) -> StoredEvent:
  return await EventStore().append(
    db,
    session_id=session_id,
    generation_id=generation_id,
    event=event,
    correlation_id=correlation_id,
  )
