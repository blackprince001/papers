"""Deep-research input, payload, and active-run limit tests."""

from __future__ import annotations

import json

import pytest
from app.api.deep_research import _enforce_active_run_limit
from app.core.config import settings
from app.schemas.deep_research import DeepResearchSessionCreate
from app.services.deep_research_service import _bounded_event, _bounded_json_value
from fastapi import HTTPException


def test_question_length_is_bounded():
  with pytest.raises(ValueError):
    DeepResearchSessionCreate(question="x" * 4001)


def test_checkpoints_are_bounded_without_unbounded_string_payloads():
  value = [{"role": "user", "content": "question"}] + [
    {"role": "assistant", "content": "x" * 1000} for _ in range(20)
  ]
  bounded = _bounded_json_value(value, 512, fallback=[{"role": "user", "content": "question"}])
  assert bounded == [{"role": "user", "content": "question"}]


def test_event_projection_replaces_oversized_payloads():
  bounded = _bounded_event(
    {"type": "chunk", "content": "x" * settings.DEEP_RESEARCH_MAX_EVENT_BYTES * 2},
    settings.DEEP_RESEARCH_MAX_EVENT_BYTES,
  )
  assert len(json.dumps(bounded, ensure_ascii=False).encode()) <= settings.DEEP_RESEARCH_MAX_EVENT_BYTES
  assert bounded["type"] == "chunk"
  assert bounded["truncated"] is True


class _Result:
  def __init__(self, value):
    self.value = value

  def scalar_one(self):
    return self.value


class _DB:
  def __init__(self, active):
    self.active = active
    self.calls = 0

  async def execute(self, query):
    self.calls += 1
    return _Result(None if self.calls == 1 else self.active)


@pytest.mark.asyncio
async def test_active_run_limit_is_enforced_transactionally(monkeypatch):
  monkeypatch.setattr(settings, "DEEP_RESEARCH_MAX_ACTIVE_RUNS", 2)
  with pytest.raises(HTTPException) as error:
    await _enforce_active_run_limit(_DB(active=2), 7)
  assert error.value.status_code == 429


@pytest.mark.asyncio
async def test_active_run_limit_allows_capacity(monkeypatch):
  monkeypatch.setattr(settings, "DEEP_RESEARCH_MAX_ACTIVE_RUNS", 2)
  db = _DB(active=1)
  await _enforce_active_run_limit(db, 7)
  assert db.calls == 2


@pytest.mark.asyncio
async def test_admin_orphan_scope_uses_global_budget(monkeypatch):
  monkeypatch.setattr(settings, "DEEP_RESEARCH_MAX_ACTIVE_RUNS", 1)
  with pytest.raises(HTTPException) as error:
    await _enforce_active_run_limit(_DB(active=1), None)
  assert error.value.status_code == 429
