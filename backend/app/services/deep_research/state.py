"""Checked deep-research lifecycle transitions and bounded payload helpers."""

from __future__ import annotations

import json
from enum import StrEnum
from uuid import uuid4

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deep_research import DeepResearchSession


class ResearchStatus(StrEnum):
  QUEUED = "queued"
  PLANNING = "planning"
  SEARCHING = "searching"
  READING = "reading"
  SYNTHESIZING = "synthesizing"
  VERIFYING = "verifying"
  RUNNING = "running"  # legacy compatibility while old workers drain
  PAUSED = "paused"
  COMPLETED = "completed"
  FAILED = "failed"
  CANCEL_REQUESTED = "cancel_requested"
  CANCELLED = "cancelled"


TERMINAL_STATUSES = frozenset(
  {ResearchStatus.COMPLETED, ResearchStatus.FAILED, ResearchStatus.CANCELLED}
)

_ALLOWED_TRANSITIONS: dict[ResearchStatus, frozenset[ResearchStatus]] = {
  ResearchStatus.QUEUED: frozenset(
    {ResearchStatus.PLANNING, ResearchStatus.RUNNING, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.PLANNING: frozenset(
    {ResearchStatus.SEARCHING, ResearchStatus.QUEUED, ResearchStatus.PAUSED, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.SEARCHING: frozenset(
    {ResearchStatus.READING, ResearchStatus.QUEUED, ResearchStatus.PAUSED, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.READING: frozenset(
    {ResearchStatus.SYNTHESIZING, ResearchStatus.QUEUED, ResearchStatus.PAUSED, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.SYNTHESIZING: frozenset(
    {ResearchStatus.VERIFYING, ResearchStatus.QUEUED, ResearchStatus.PAUSED, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.VERIFYING: frozenset(
    {ResearchStatus.COMPLETED, ResearchStatus.QUEUED, ResearchStatus.PAUSED, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.RUNNING: frozenset(
    {ResearchStatus.PLANNING, ResearchStatus.QUEUED, ResearchStatus.PAUSED, ResearchStatus.COMPLETED, ResearchStatus.CANCEL_REQUESTED, ResearchStatus.FAILED}
  ),
  ResearchStatus.PAUSED: frozenset({ResearchStatus.QUEUED, ResearchStatus.RUNNING, ResearchStatus.CANCEL_REQUESTED}),
  ResearchStatus.CANCEL_REQUESTED: frozenset(
    {ResearchStatus.CANCELLED, ResearchStatus.FAILED}
  ),
  ResearchStatus.COMPLETED: frozenset(),
  ResearchStatus.FAILED: frozenset(),
  ResearchStatus.CANCELLED: frozenset(),
}

class InvalidTransition(ValueError):
  """Raised when a lifecycle transition is not allowed."""


class StaleTransition(RuntimeError):
  """Raised when optimistic concurrency found a newer session version."""


class PayloadLimitExceeded(ValueError):
  """Raised before a durable payload exceeds its configured byte budget."""


def check_follow_up_transition(current: str, target: str) -> None:
  """Validate the explicit transition used by ``Research further``.

  A completed or failed run is terminal for ordinary lifecycle mutations. A
  follow-up is the one deliberate exception: it creates a new generation and
  makes that generation the active queued run. Keeping this check separate
  prevents a generic caller from accidentally requeueing terminal history.
  """
  if target == ResearchStatus.QUEUED and current in {
    ResearchStatus.COMPLETED,
    ResearchStatus.FAILED,
  }:
    return
  check_transition(current, target)


def check_transition(current: str, target: str) -> None:
  try:
    source = ResearchStatus(current)
    destination = ResearchStatus(target)
  except ValueError as exc:
    raise InvalidTransition(f"Unknown research status: {current} -> {target}") from exc
  if destination not in _ALLOWED_TRANSITIONS[source]:
    raise InvalidTransition(f"Invalid research transition: {source} -> {destination}")


def payload_bytes(payload: object) -> int:
  return len(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def require_bounded_payload(payload: object, max_bytes: int) -> int:
  size = payload_bytes(payload)
  if size > max_bytes:
    raise PayloadLimitExceeded(f"Payload exceeds the {max_bytes}-byte limit")
  return size


def new_correlation_id() -> str:
  return str(uuid4())


async def compare_and_set_status(
  db: AsyncSession,
  session_id: int,
  *,
  expected_version: int,
  current_status: str,
  target_status: str,
) -> None:
  """Atomically transition a session and increment its lifecycle version."""
  check_transition(current_status, target_status)
  result = await db.execute(
    update(DeepResearchSession)
    .where(
      DeepResearchSession.id == session_id,
      DeepResearchSession.lifecycle_version == expected_version,
      DeepResearchSession.status == current_status,
    )
    .values(
      status=target_status,
      lifecycle_version=DeepResearchSession.lifecycle_version + 1,
    )
  )
  if result.rowcount != 1:
    raise StaleTransition(f"Research session {session_id} changed before transition")
