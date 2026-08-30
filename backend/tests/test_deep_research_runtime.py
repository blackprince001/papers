"""Regression tests for long-running deep-research runtime boundaries."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import app.services.deep_research_service as service
from app.services.ai.agent.context import get_byo_context, reset_byo_context


class _AsyncSessionContext:
  def __init__(self, session):
    self.session = session

  async def __aenter__(self):
    return self.session

  async def __aexit__(self, exc_type, exc, tb):
    return False


class _SessionMaker:
  def __init__(self, session):
    self.session = session
    self.calls = 0

  def __call__(self):
    self.calls += 1
    return _AsyncSessionContext(self.session)


class _LifecycleSession:
  async def get(self, _model, _session_id):
    return SimpleNamespace(
      id=1,
      question="test research",
      current_generation=1,
      cancel_requested=False,
      status="queued",
      attempt_count=0,
      correlation_id="test-correlation",
    )

  async def commit(self):
    return None


def test_research_agent_gets_a_separate_database_session(monkeypatch):
  lifecycle_db = _LifecycleSession()
  tool_db = object()
  tool_session_maker = _SessionMaker(tool_db)
  captured: dict[str, object] = {}

  generation = SimpleNamespace(
    id=11,
    session_id=1,
    generation_number=1,
    mode="research",
    checkpoint=None,
  )
  route = SimpleNamespace(provider_type="deepseek", default_model="deepseek-chat")
  provider = SimpleNamespace(route=route)

  class Runner:
    @staticmethod
    def run_streamed(*_args, **_kwargs):
      captured["db_session"] = get_byo_context().extra["db_session"]
      return object()

  async def fake_adapt_stream(*_args, **_kwargs):
    yield {
      "type": "error",
      "error_code": "internal",
      "recoverable": False,
    }

  async def no_op(*_args, **_kwargs):
    return None

  monkeypatch.setattr(service, "_get_runner", lambda: Runner)
  monkeypatch.setattr(service, "_ensure_generation", _async_value(generation))
  monkeypatch.setattr(service, "resolve_generation_provider", no_op_provider(provider))
  monkeypatch.setattr(service, "build_run_config", lambda **_kwargs: object())
  monkeypatch.setattr(service, "create_deep_research_agent", lambda: object())
  monkeypatch.setattr(service, "build_research_input", _async_value([]))
  monkeypatch.setattr(service, "_persist", no_op)
  monkeypatch.setattr(service, "_emit_event", no_op)
  monkeypatch.setattr(service, "_mark_failed", no_op)
  monkeypatch.setattr(service, "adapt_stream", fake_adapt_stream)
  monkeypatch.setattr(service, "_cancellation_requested", _async_value(False))

  reset_byo_context()
  try:
    result = asyncio.run(
      service._run_research(
        lifecycle_db,
        1,
        2,
        False,
        11,
        session_maker=tool_session_maker,
      )
    )
  finally:
    reset_byo_context()

  assert result == "failed"
  assert captured["db_session"] is tool_db
  assert captured["db_session"] is not lifecycle_db
  assert tool_session_maker.calls == 1


def _async_value(value):
  async def resolve(*_args, **_kwargs):
    return value

  return resolve


def no_op_provider(provider):
  async def resolve(*_args, **_kwargs):
    return provider

  return resolve
