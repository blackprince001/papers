"""Transactional admission, outbox dispatch, leasing, and cancellation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deep_research import (
  DeepResearchGeneration,
  DeepResearchOutbox,
  DeepResearchSession,
)
from app.services.deep_research.state import (
  ResearchStatus,
  check_transition,
  payload_bytes,
)

OUTBOX_EVENT_DISPATCH = "dispatch_research"
OUTBOX_LEASE_SECONDS = 60
WORKER_LEASE_SECONDS = 20 * 60


class GenerationNotRunnable(RuntimeError):
  """The task is duplicate, stale, cancelled, or belongs to another generation."""


def now() -> datetime:
  return datetime.now(timezone.utc)


def dispatch_key(session_id: int, generation_id: int) -> str:
  return f"research-dispatch:{session_id}:{generation_id}"


async def enqueue_generation(
  db: AsyncSession,
  *,
  session: DeepResearchSession,
  generation: DeepResearchGeneration,
) -> DeepResearchOutbox:
  """Add a durable dispatch request in the caller's session transaction."""
  payload = {"session_id": int(session.id), "generation_id": int(generation.id)}
  item = DeepResearchOutbox(
    session_id=session.id,
    generation_id=generation.id,
    idempotency_key=dispatch_key(int(session.id), int(generation.id)),
    event_type=OUTBOX_EVENT_DISPATCH,
    payload=payload,
    payload_bytes=payload_bytes(payload),
    correlation_id=session.correlation_id,
  )
  db.add(item)
  return item


async def request_cancellation(
  db: AsyncSession, session: DeepResearchSession
) -> bool:
  """Request cooperative cancellation without deleting durable audit history."""
  locked = (
    await db.execute(
      select(DeepResearchSession)
      .where(DeepResearchSession.id == session.id)
      .with_for_update()
    )
  ).scalar_one_or_none()
  if locked is None:
    return False
  session = locked
  if session.status in {
    ResearchStatus.COMPLETED,
    ResearchStatus.FAILED,
    ResearchStatus.CANCELLED,
  }:
    return False
  if session.status != ResearchStatus.CANCEL_REQUESTED:
    check_transition(str(session.status), ResearchStatus.CANCEL_REQUESTED)
    session.status = ResearchStatus.CANCEL_REQUESTED
    session.lifecycle_version = (session.lifecycle_version or 0) + 1
  session.cancel_requested = True
  await db.commit()
  return True


def claim_generation_sync(session, session_id: int, generation_id: int) -> tuple[int, bool, str]:
  """Claim the current queued generation exactly once from a Celery worker."""
  generation = (
    session.query(DeepResearchGeneration)
    .filter(DeepResearchGeneration.id == generation_id)
    .with_for_update()
    .one_or_none()
  )
  if generation is None or generation.session_id != session_id:
    raise GenerationNotRunnable("Unknown generation")
  research = (
    session.query(DeepResearchSession)
    .filter(DeepResearchSession.id == session_id)
    .with_for_update()
    .one_or_none()
  )
  if research is None or research.current_generation != generation.generation_number:
    raise GenerationNotRunnable("Stale generation")
  if research.cancel_requested or research.status == ResearchStatus.CANCEL_REQUESTED:
    raise GenerationNotRunnable("Cancellation requested")
  if generation.status not in {ResearchStatus.QUEUED, ResearchStatus.RUNNING}:
    raise GenerationNotRunnable("Generation is not runnable")
  lease_expired = generation.lease_until is None or generation.lease_until <= now()
  if generation.status == ResearchStatus.RUNNING and not lease_expired:
    raise GenerationNotRunnable("Generation already leased")
  generation.status = ResearchStatus.RUNNING
  generation.state_version = (generation.state_version or 0) + 1
  generation.lease_until = now() + timedelta(seconds=WORKER_LEASE_SECONDS)
  generation.lease_token = str(uuid4())
  if research.status != ResearchStatus.RUNNING:
    check_transition(str(research.status), ResearchStatus.RUNNING)
    research.status = ResearchStatus.RUNNING
    research.lifecycle_version = (research.lifecycle_version or 0) + 1
  session.commit()
  return int(research.user_id), research.user.role == "admin", generation.lease_token


def claim_outbox_batch_sync(session, limit: int = 20) -> list[DeepResearchOutbox]:
  """Lease unpublished outbox rows; broker calls occur after this commit."""
  query = (
    session.query(DeepResearchOutbox)
    .filter(
      DeepResearchOutbox.event_type == OUTBOX_EVENT_DISPATCH,
      DeepResearchOutbox.published_at.is_(None),
      DeepResearchOutbox.available_at <= now(),
      (DeepResearchOutbox.lease_until.is_(None)) | (DeepResearchOutbox.lease_until <= now()),
    )
    .order_by(DeepResearchOutbox.id)
    .with_for_update(skip_locked=True)
    .limit(limit)
  )
  rows = query.all()
  until = now() + timedelta(seconds=OUTBOX_LEASE_SECONDS)
  for row in rows:
    row.attempts = (row.attempts or 0) + 1
    row.lease_until = until
  session.commit()
  return rows


def mark_outbox_published_sync(session, outbox_id: int) -> None:
  row = session.get(DeepResearchOutbox, outbox_id)
  if row is None or row.published_at is not None:
    return
  row.published_at = now()
  row.lease_until = None
  row.last_error = None
  session.commit()


def release_outbox_sync(session, outbox_id: int, error: str) -> None:
  row = session.get(DeepResearchOutbox, outbox_id)
  if row is None or row.published_at is not None:
    return
  row.lease_until = None
  row.last_error = error[:500]
  row.available_at = now() + timedelta(seconds=min(300, 2 ** min(row.attempts or 0, 8)))
  session.commit()


def recover_expired_generation_leases_sync(session, limit: int = 20) -> int:
  """Return abandoned current generations to the durable dispatch queue.

  This is safe to run repeatedly. The existing unique outbox row is reopened
  instead of inserting a second delivery request.
  """
  rows = (
    session.query(DeepResearchGeneration)
    .filter(
      DeepResearchGeneration.status == ResearchStatus.RUNNING,
      DeepResearchGeneration.lease_until.is_not(None),
      DeepResearchGeneration.lease_until <= now(),
    )
    .with_for_update(skip_locked=True)
    .limit(limit)
    .all()
  )
  recovered = 0
  for generation in rows:
    research = (
      session.query(DeepResearchSession)
      .filter(DeepResearchSession.id == generation.session_id)
      .with_for_update()
      .one_or_none()
    )
    if (
      research is None
      or research.current_generation != generation.generation_number
      or research.cancel_requested
      or research.status in {ResearchStatus.COMPLETED, ResearchStatus.FAILED, ResearchStatus.CANCELLED}
    ):
      continue
    check_transition(str(research.status), ResearchStatus.QUEUED)
    research.status = ResearchStatus.QUEUED
    research.lifecycle_version = (research.lifecycle_version or 0) + 1
    generation.status = ResearchStatus.QUEUED
    generation.lease_until = None
    generation.lease_token = None
    generation.state_version = (generation.state_version or 0) + 1
    outbox = (
      session.query(DeepResearchOutbox)
      .filter(
        DeepResearchOutbox.generation_id == generation.id,
        DeepResearchOutbox.event_type == OUTBOX_EVENT_DISPATCH,
      )
      .with_for_update()
      .one_or_none()
    )
    if outbox is None:
      payload = {"session_id": int(research.id), "generation_id": int(generation.id)}
      outbox = DeepResearchOutbox(
        session_id=research.id,
        generation_id=generation.id,
        idempotency_key=dispatch_key(int(research.id), int(generation.id)),
        event_type=OUTBOX_EVENT_DISPATCH,
        payload=payload,
        payload_bytes=payload_bytes(payload),
        correlation_id=research.correlation_id,
      )
      session.add(outbox)
    else:
      outbox.published_at = None
      outbox.available_at = now()
      outbox.lease_until = None
      outbox.last_error = "worker lease expired; dispatch recovered"
    recovered += 1
  session.commit()
  return recovered


@dataclass(frozen=True)
class VerificationResult:
  sufficient: bool
  unsupported_urls: tuple[str, ...]


_LINK_RE = re.compile(r"\[[^]]+\]\((https?://[^)\s]+|ref:[^)\s]+)\)")


def verify_report(report: str, evidence_urls: set[str]) -> VerificationResult:
  """Check that external report links are represented in the evidence ledger.

  A report with no evidence is a valid *insufficient evidence* completion. It
  is not silently upgraded into a supported answer.
  """
  links = {link.rstrip(".,); ") for link in _LINK_RE.findall(report)}
  external = {link for link in links if link.startswith(("http://", "https://"))}
  unsupported = tuple(sorted(external - evidence_urls))
  return VerificationResult(
    sufficient=bool(evidence_urls) and not unsupported,
    unsupported_urls=unsupported,
  )
