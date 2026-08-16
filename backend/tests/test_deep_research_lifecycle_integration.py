"""Opt-in Postgres integration gates for the durable research lifecycle.

Run locally with::

  set -a; source ../.env; set +a
  RUN_DEEP_RESEARCH_INTEGRATION=1 uv run pytest -m integration -q
"""

from __future__ import annotations

import asyncio
import os
from datetime import timedelta
from uuid import uuid4

import pytest
from app.core.database import AsyncSessionLocal
from app.models.deep_research import (
  DeepResearchEvent,
  DeepResearchGeneration,
  DeepResearchOutbox,
  DeepResearchSession,
)
from app.models.user import User
from app.services.deep_research.orchestrator import (
  claim_generation_sync,
  dispatch_key,
  now,
  recover_expired_generation_leases_sync,
  request_cancellation,
)
from app.services.deep_research.state import payload_bytes
from app.services.deep_research_service import run_research
from app.tasks import deep_research_tasks
from app.tasks.base import get_sync_session

pytestmark = pytest.mark.integration
if os.getenv("RUN_DEEP_RESEARCH_INTEGRATION") != "1":
  pytest.skip("set RUN_DEEP_RESEARCH_INTEGRATION=1", allow_module_level=True)


def _seed() -> tuple[int, int, int, int]:
  db = get_sync_session()
  suffix = uuid4().hex
  try:
    user = User(email=f"dr-{suffix}@local.test", display_name="DR integration", auth_provider="local")
    db.add(user)
    db.flush()
    research = DeepResearchSession(
      user_id=user.id, question="Test research", title="Test", status="queued", correlation_id=suffix
    )
    db.add(research)
    db.flush()
    generation = DeepResearchGeneration(
      session_id=research.id, generation_number=1, status="queued", correlation_id=suffix
    )
    db.add(generation)
    db.flush()
    payload = {"session_id": research.id, "generation_id": generation.id}
    outbox = DeepResearchOutbox(
      session_id=research.id, generation_id=generation.id,
      idempotency_key=dispatch_key(research.id, generation.id), event_type="dispatch_research",
      payload=payload, payload_bytes=payload_bytes(payload), correlation_id=suffix,
    )
    db.add(outbox)
    db.commit()
    return user.id, research.id, generation.id, outbox.id
  finally:
    db.close()


def _cleanup(session_id: int, user_id: int) -> None:
  db = get_sync_session()
  try:
    db.query(DeepResearchSession).filter_by(id=session_id).delete()
    db.query(User).filter_by(id=user_id).delete()
    db.commit()
  finally:
    db.close()


def test_broker_outage_releases_outbox_for_retry(monkeypatch):
  user_id, session_id, generation_id, outbox_id = _seed()
  try:
    monkeypatch.setattr(
      deep_research_tasks.run_deep_research_task,
      "apply_async",
      lambda **_: (_ for _ in ()).throw(ConnectionError("broker down")),
    )
    result = deep_research_tasks.dispatch_research_outbox.run()
    db = get_sync_session()
    try:
      row = db.get(DeepResearchOutbox, outbox_id)
      assert result["failed"] == 1
      assert row.published_at is None and row.lease_until is None
      assert row.attempts == 1 and row.last_error == "broker down"
    finally:
      db.close()
  finally:
    _cleanup(session_id, user_id)


def test_duplicate_delivery_runs_only_once(monkeypatch):
  user_id, session_id, generation_id, _ = _seed()
  try:
    calls: list[tuple[int, int]] = []
    monkeypatch.setattr(
      deep_research_tasks,
      "run_deep_research",
      lambda sid, uid, admin, gid, token: calls.append((sid, gid)) or "running",
    )
    first = deep_research_tasks.run_deep_research_task.run(session_id, generation_id)
    second = deep_research_tasks.run_deep_research_task.run(session_id, generation_id)
    assert first["status"] == "running"
    assert second["status"] == "ignored"
    assert calls == [(session_id, generation_id)]
  finally:
    _cleanup(session_id, user_id)


def test_queued_cancellation_has_one_terminal_event(monkeypatch):
  user_id, session_id, generation_id, _ = _seed()
  try:
    async def cancel() -> None:
      async with AsyncSessionLocal() as db:
        row = await db.get(DeepResearchSession, session_id)
        await request_cancellation(db, row)
    asyncio.run(cancel())
    monkeypatch.setattr(deep_research_tasks, "run_deep_research", pytest.fail)
    deep_research_tasks.run_deep_research_task.run(session_id, generation_id)
    deep_research_tasks.run_deep_research_task.run(session_id, generation_id)
    db = get_sync_session()
    try:
      assert db.get(DeepResearchSession, session_id).status == "cancelled"
      assert db.get(DeepResearchGeneration, generation_id).status == "cancelled"
      assert db.query(DeepResearchEvent).filter_by(generation_id=generation_id, event_type="cancelled").count() == 1
    finally:
      db.close()
  finally:
    _cleanup(session_id, user_id)


def test_expired_lease_recovery_fences_old_worker():
  user_id, session_id, generation_id, _ = _seed()
  try:
    db = get_sync_session()
    try:
      _, _, old_token = claim_generation_sync(db, session_id, generation_id)
      generation = db.get(DeepResearchGeneration, generation_id)
      generation.lease_until = now() - timedelta(seconds=1)
      db.commit()
      assert recover_expired_generation_leases_sync(db) == 1
      _, _, new_token = claim_generation_sync(db, session_id, generation_id)
      assert old_token != new_token
    finally:
      db.close()
    assert asyncio.run(run_research(session_id, user_id, False, generation_id, old_token)) == "ignored"
  finally:
    _cleanup(session_id, user_id)
