"""Deep research: a long-running, resumable research agent run.

Runs ``create_deep_research_agent`` inside a Celery worker. Two persistence
layers keep the run durable:

* **UI relay** — every stream event is ``RPUSH``ed to the Redis list
  ``deepresearch:{id}:events`` so the SSE endpoint can replay progress to a
  reconnecting browser (mirrors the paper-progress pattern in ``tasks/base.py``).
* **Agent checkpoint** — after each bounded segment the agent's accumulated
  input-item list (``to_input_list()``) is written to
  ``DeepResearchSession.run_state`` so an interrupted run resumes without
  repeating the searches it already did.

Failures are routed by the shared error taxonomy (``agent/error.py``):
recoverable errors raise :class:`DeepResearchRetryable` so the Celery task
resumes from the checkpoint; user-actionable errors (auth / no provider) pause
for a manual ``resume``; anything else fails.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.logger import get_logger
from app.models.deep_research import DeepResearchSession
from app.services.ai.agent import (
  ERROR_CODE_AUTH,
  ERROR_CODE_INTERNAL,
  ERROR_CODE_MAX_TURNS,
  ERROR_CODE_NO_PROVIDER,
  ERROR_CODE_TIMEOUT,
  adapt_stream,
  build_run_config,
  classify_exception,
  get_byo_context,
  reset_byo_context,
  set_byo_context,
)
from app.services.ai.agent.agents import create_deep_research_agent
from app.services.ai.agent.context import BYOContext
from app.services.ai.agent.provider_resolver import resolve_providers

logger = get_logger(__name__)

# Deep research runs as a single agent loop with a generous turn budget. The
# SDK requires *some* max_turns (there is no unbounded mode), so this is set
# high enough that a thorough investigation finishes in one pass. If the agent
# still hasn't converged, the run pauses with its ``to_input_list()`` checkpoint
# saved so the user can resume for another budget — it never restarts from zero.
DEEP_RESEARCH_MAX_TURNS = 50
EVENTS_TTL_SECONDS = 1800

# Provider types that support the agent (function-calling) framework.
AGENT_PROVIDER_TYPES = {
  "openai-compatible",
  "openai",
  "anthropic",
  "deepseek",
  "ollama",
  "vllm",
}

# Errors the user must act on before a resume can succeed (vs. transient ones
# that resume automatically).
USER_ACTIONABLE = {ERROR_CODE_AUTH, ERROR_CODE_NO_PROVIDER}


class DeepResearchRetryable(Exception):
  """Signals the run should resume on a later Celery attempt (from checkpoint)."""

  def __init__(self, error_code: str):
    self.error_code = error_code
    super().__init__(error_code)


def _get_runner():
  """Lazy import of the OpenAI Agents SDK Runner; ``None`` if not installed."""
  if adapt_stream is None:
    return None
  try:
    from agents import Runner as R

    return R
  except ImportError:
    return None


def _events_key(session_id: int) -> str:
  return f"deepresearch:{session_id}:events"


def _get_redis():
  import redis

  return redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    password=settings.REDIS_PASSWORD or None,
    decode_responses=True,
  )


def _relay(r, session_id: int, event: dict[str, Any]) -> None:
  """Append one stream event to the replayable Redis progress list."""
  if event.get("type") == "keepalive":
    return  # live-only noise; not useful on replay
  key = _events_key(session_id)
  r.rpush(key, json.dumps(event))
  r.expire(key, EVENTS_TTL_SECONDS)


_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
_BARE_URL_RE = re.compile(r"(?<![\(\]=\"])\bhttps?://[^\s)\]]+")


def _infer_source(url: str) -> str:
  if "arxiv.org" in url:
    return "arxiv"
  if "semanticscholar.org" in url or "semanticscholar" in url:
    return "semantic_scholar"
  if "openalex.org" in url:
    return "openalex"
  return "web"


def _extract_sources(report: str) -> list[dict[str, Any]]:
  """Best-effort extraction of external sources cited in the report markdown.

  The discovery/web tools return free-text, so structured sources are recovered
  from the links the agent wrote into its report. ``ref:`` links (library
  papers) are internal and deliberately skipped.
  """
  if not report:
    return []
  seen: set[str] = set()
  out: list[dict[str, Any]] = []

  def _add(title: str, url: str) -> None:
    u = url.rstrip(".,);")
    if u in seen:
      return
    seen.add(u)
    out.append(
      {
        "title": title.strip() or u,
        "url": u,
        "source": _infer_source(u),
        "external_id": None,
      }
    )

  for label, url in _LINK_RE.findall(report):
    _add(label, url)
  for m in _BARE_URL_RE.finditer(report):
    _add(m.group(0), m.group(0))
  return out[:100]


def _safe_to_input_list(result: Any, fallback: Any) -> Any:
  """Return the run's accumulated input items, or ``fallback`` if unavailable.

  ``to_input_list()`` is well-defined after a clean run; on a partially-failed
  stream it may not be, so this degrades to the last known input (resume then
  re-does at most the current segment rather than restarting from scratch).
  """
  try:
    items = result.to_input_list()
    if items:
      return items
  except Exception as e:  # noqa: BLE001 — SDK internals vary; degrade gracefully
    logger.warning(
      "to_input_list unavailable; resuming from prior input", error=str(e)[:160]
    )
  return fallback


def _final_output(result: Any) -> str | None:
  try:
    fo = getattr(result, "final_output", None)
    return fo if isinstance(fo, str) and fo.strip() else None
  except Exception:  # noqa: BLE001
    return None


async def _persist(db, session_id: int, **values: Any) -> None:
  """Fetch the row fresh and update it, clearing any aborted tool transaction.

  Runs only between segments (no tool is using the shared session then), so a
  defensive rollback + fresh ``get`` avoids ``MissingGreenlet`` / aborted-tx
  errors a tool may have left behind.
  """
  try:
    await db.rollback()
  except Exception:  # noqa: BLE001
    pass
  row = await db.get(DeepResearchSession, session_id)
  if row is None:
    return
  for k, v in values.items():
    setattr(row, k, v)
  await db.commit()


async def run_research(session_id: int, user_id: int | None) -> str:
  """Execute or resume a deep-research run; return the terminal status string.

  Raises :class:`DeepResearchRetryable` when the caller (the Celery task) should
  resume the run on a later attempt.

  A fresh async engine is created per run, bound to the current event loop.
  Celery executes each task in its own ``asyncio.run()`` loop; reusing the
  module-level pooled engine across those loops raises "attached to a different
  loop" on the second task. ``NullPool`` + ``dispose()`` keeps each run's
  connections loop-local.
  """
  engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
  session_maker = async_sessionmaker(
    engine, expire_on_commit=False, autoflush=False, autocommit=False
  )
  try:
    async with session_maker() as db:
      return await _run_research(db, session_id, user_id)
  finally:
    await engine.dispose()


async def _run_research(db, session_id: int, user_id: int | None) -> str:
  r = _get_redis()
  Runner = _get_runner()

  session = await db.get(DeepResearchSession, session_id)
  if session is None:
    return "failed"

  question = session.question
  resume_state = session.run_state
  await _persist(
    db,
    session_id,
    status="running",
    last_error_code=None,
    attempt_count=(session.attempt_count or 0) + 1,
  )

  if Runner is None:
    await _pause(
      db, r, session_id, ERROR_CODE_NO_PROVIDER, "OpenAI Agents SDK not installed."
    )
    return "paused"

  resolved = await resolve_providers(db, user_id)
  if not resolved:
    await _pause(
      db,
      r,
      session_id,
      ERROR_CODE_NO_PROVIDER,
      "No AI provider configured. Add one in your settings to run deep research.",
    )
    return "paused"
  if resolved[0].route.provider_type.lower() not in AGENT_PROVIDER_TYPES:
    await _pause(
      db,
      r,
      session_id,
      ERROR_CODE_NO_PROVIDER,
      f"Provider '{resolved[0].route.provider_type}' is not supported. "
      "Configure an OpenAI-compatible provider.",
    )
    return "paused"

  provider = resolved[0]
  run_config = build_run_config(
    provider_configs=[provider.route],
    model_hint=provider.route.default_model or None,
  )
  agent = create_deep_research_agent()
  agent_input: Any = resume_state or [{"role": "user", "content": question}]

  set_byo_context(
    BYOContext(
      user_id=user_id,
      provider_configs=[provider.route],
      extra={"db_session": db, "session_id": session_id, "dr_sources": []},
    )
  )
  try:
    result = Runner.run_streamed(
      agent, input=agent_input, run_config=run_config, max_turns=DEEP_RESEARCH_MAX_TURNS
    )
    content: list[str] = []
    run_error: dict[str, Any] | None = None
    try:
      async for adapted in adapt_stream(result, session_id=session_id):
        _relay(r, session_id, adapted)
        t = adapted.get("type")
        if t == "chunk":
          content.append(adapted.get("content", ""))
        elif t == "error":
          run_error = adapted
    except SoftTimeLimitExceeded as e:
      # Time budget hit mid-run — checkpoint what the agent has and resume.
      await _persist(
        db,
        session_id,
        run_state=_safe_to_input_list(result, fallback=agent_input),
        status="running",
        last_error_code=ERROR_CODE_TIMEOUT,
      )
      raise DeepResearchRetryable(ERROR_CODE_TIMEOUT) from e

    checkpoint = _safe_to_input_list(result, fallback=agent_input)

    if run_error is None:
      # Agent finished on its own → the report is its final output.
      report = _final_output(result) or "".join(content)
      await _complete(db, r, session_id, report)
      return "completed"

    code = run_error.get("error_code") or ERROR_CODE_INTERNAL
    await _persist(db, session_id, run_state=checkpoint)

    if code == ERROR_CODE_MAX_TURNS:
      # Investigation didn't converge within the budget — pause with the
      # checkpoint saved so a resume continues rather than restarting.
      await _pause(
        db,
        r,
        session_id,
        code,
        "This is taking a while. Resume to let the research keep going.",
      )
      return "paused"
    if run_error.get("recoverable"):
      await _persist(db, session_id, status="running", last_error_code=code)
      raise DeepResearchRetryable(code)
    if code in USER_ACTIONABLE:
      await _pause(db, r, session_id, code, run_error.get("error", "Run paused"))
      return "paused"
    await _mark_failed(db, r, session_id, code, run_error.get("error", "Run failed"))
    return "failed"

  except DeepResearchRetryable:
    raise
  except SoftTimeLimitExceeded as e:
    # Bounded execution hit its time limit; the last segment checkpoint is
    # already saved, so resume picks up from there.
    logger.info(
      "Deep research soft time limit reached; will resume", session_id=session_id
    )
    await _persist(
      db, session_id, status="running", last_error_code=ERROR_CODE_TIMEOUT
    )
    raise DeepResearchRetryable(ERROR_CODE_TIMEOUT) from e
  except asyncio.CancelledError:
    raise
  except Exception as e:  # noqa: BLE001 — surface via the error taxonomy
    code, recoverable = classify_exception(e)
    logger.error("Deep research run error", error=str(e)[:200], error_code=code)
    if recoverable:
      await _persist(db, session_id, status="running", last_error_code=code)
      raise DeepResearchRetryable(code) from e
    if code in USER_ACTIONABLE:
      await _pause(db, r, session_id, code, str(e)[:300])
      return "paused"
    await _mark_failed(db, r, session_id, code, str(e)[:300])
    return "failed"
  finally:
    reset_byo_context()


def _run_sources(report: str) -> list[dict[str, Any]]:
  """The run's cited sources: the structured papers the tools collected this run
  (rich metadata for the Citations panel), deduped; falls back to links parsed
  from the report when nothing was collected."""
  try:
    collected = get_byo_context().extra.get("dr_sources") or []
  except Exception:  # noqa: BLE001
    collected = []
  if not collected:
    return _extract_sources(report)

  seen: set[Any] = set()
  out: list[dict[str, Any]] = []
  for it in collected:
    key = (
      (it.get("source"), it.get("external_id"))
      if it.get("external_id")
      else (it.get("url") or it.get("title"))
    )
    if not key or key in seen:
      continue
    seen.add(key)
    out.append(it)
  return out[:120]


async def _complete(db, r, session_id: int, report: str) -> None:
  await _persist(
    db,
    session_id,
    report=report,
    cited_sources=_run_sources(report),
    status="completed",
    run_state=None,
    last_error_code=None,
  )
  _relay(r, session_id, {"type": "done", "content": report, "session_id": session_id})


async def _pause(db, r, session_id: int, code: str, message: str) -> None:
  await _persist(db, session_id, status="paused", last_error_code=code)
  _relay(
    r,
    session_id,
    {"type": "paused", "error": message, "error_code": code, "recoverable": True},
  )


async def _mark_failed(db, r, session_id: int, code: str, message: str) -> None:
  await _persist(db, session_id, status="failed", last_error_code=code)
  _relay(
    r,
    session_id,
    {"type": "error", "error": message, "error_code": code, "recoverable": False},
  )


def run_deep_research(session_id: int, user_id: int | None) -> str:
  """Synchronous entry point for the Celery task."""
  return asyncio.run(run_research(session_id, user_id))
