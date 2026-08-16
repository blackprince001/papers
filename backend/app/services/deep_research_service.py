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
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Any

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.logger import get_logger
from app.models.deep_research import (
  DeepResearchEvent,
  DeepResearchGeneration,
  DeepResearchSession,
)
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
from app.services.deep_research.event_store import DuplicateTerminalEvent, EventStore
from app.services.deep_research.evidence import persist_evidence
from app.services.deep_research.orchestrator import verify_report
from app.services.deep_research.state import check_transition, payload_bytes

logger = get_logger(__name__)

# Runner requires a finite turn budget. A bound keeps one generation from
# consuming unbounded provider capacity; exhausted work pauses for review.
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
_LEASE_TOKEN: ContextVar[str | None] = ContextVar("deep_research_lease_token", default=None)


class StaleLease(Exception):
  """A recovered generation is now owned by another worker."""


class CancellationRequested(Exception):
  """A concurrent cancellation won the lifecycle row lock."""


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


def _bounded_json_value(value: Any, max_bytes: int, fallback: Any = None) -> Any:
  """Keep checkpoints within the database payload budget without corrupting history."""
  try:
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) <= max_bytes:
      return value
    if fallback is not None and len(json.dumps(fallback, ensure_ascii=False).encode("utf-8")) <= max_bytes:
      return fallback
  except (TypeError, ValueError):
    return None
  return None


def _bounded_text(value: str, max_bytes: int) -> str:
  raw = value.encode("utf-8")
  if len(raw) <= max_bytes:
    return value
  return raw[:max_bytes].decode("utf-8", errors="ignore")


def _bounded_event(event: dict[str, Any], max_bytes: int) -> dict[str, Any]:
  bounded = dict(event)
  for field in ("content", "error"):
    value = bounded.get(field)
    if isinstance(value, str):
      bounded[field] = _bounded_text(value, max_bytes)
  raw = json.dumps(bounded, ensure_ascii=False)
  if len(raw.encode("utf-8")) <= max_bytes:
    return bounded
  event_type = event.get("type")
  if event_type == "done":
    return {"type": "done", "content": "[report truncated]"}
  if event_type == "error":
    return {"type": "error", "error": "Research event exceeded the size limit"}
  return {"type": event_type or "chunk", "content": "[event truncated]", "truncated": True}


def _relay(r, session_id: int, event: dict[str, Any]) -> None:
  """Mirror a bounded event to Redis for legacy observability consumers."""
  if event.get("type") == "keepalive":
    return
  bounded = _bounded_event(event, settings.DEEP_RESEARCH_MAX_EVENT_BYTES)
  key = _events_key(session_id)
  r.rpush(key, json.dumps(bounded, ensure_ascii=False))
  r.expire(key, EVENTS_TTL_SECONDS)


async def _ensure_generation(db, session: DeepResearchSession) -> DeepResearchGeneration:
  generation = (
    await db.execute(
      select(DeepResearchGeneration).where(
        DeepResearchGeneration.session_id == session.id,
        DeepResearchGeneration.generation_number == session.current_generation,
      )
    )
  ).scalar_one_or_none()
  if generation is None:
    generation = DeepResearchGeneration(
      session_id=session.id,
      generation_number=session.current_generation,
      status=str(session.status),
      correlation_id=session.correlation_id,
    )
    db.add(generation)
    await db.commit()
  return generation


async def _emit_event(
  db,
  r,
  session: DeepResearchSession,
  event: dict[str, Any],
  generation: DeepResearchGeneration | None = None,
) -> None:
  if event.get("type") == "keepalive":
    return
  generation = generation or await _ensure_generation(db, session)
  fresh_generation = (
    await db.execute(
      select(DeepResearchGeneration)
      .where(DeepResearchGeneration.id == generation.id)
      .with_for_update()
    )
  ).scalar_one()
  _assert_lease(fresh_generation)
  generation = fresh_generation
  bounded = _bounded_event(event, settings.DEEP_RESEARCH_MAX_EVENT_BYTES)
  generation.lease_until = datetime.now(timezone.utc) + timedelta(minutes=20)
  try:
    await EventStore().append(
      db,
      session_id=int(session.id),
      generation_id=int(generation.id),
      event=bounded,
      correlation_id=session.correlation_id,
    )
  except DuplicateTerminalEvent:
    return
  _relay(r, int(session.id), bounded)


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


def _assert_lease(generation: DeepResearchGeneration) -> None:
  token = _LEASE_TOKEN.get()
  if token is not None and generation.lease_token != token:
    raise StaleLease()


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
  row = (
    await db.execute(
      select(DeepResearchSession)
      .where(DeepResearchSession.id == session_id)
      .with_for_update()
    )
  ).scalar_one_or_none()
  if row is None:
    return
  target_status = values.get("status")
  if row.cancel_requested and target_status not in {"cancelled", "failed"}:
    raise CancellationRequested()
  if target_status is not None and target_status != row.status:
    check_transition(str(row.status), str(target_status))
    row.lifecycle_version = (row.lifecycle_version or 0) + 1
  for k, v in values.items():
    setattr(row, k, v)
  generation = (
    await db.execute(
      select(DeepResearchGeneration).where(
        DeepResearchGeneration.session_id == session_id,
        DeepResearchGeneration.generation_number == row.current_generation,
      )
    )
  ).scalar_one_or_none()
  if generation is None:
    generation = DeepResearchGeneration(
      session_id=session_id,
      generation_number=row.current_generation,
      status=str(row.status),
      correlation_id=row.correlation_id,
    )
    db.add(generation)
  _assert_lease(generation)
  generation.status = str(row.status)
  if "run_state" in values:
    generation.checkpoint = values["run_state"]
    generation.checkpoint_bytes = (
      payload_bytes(values["run_state"]) if values["run_state"] is not None else 0
    )
  if str(row.status) in {"completed", "failed", "cancelled", "paused"}:
    generation.lease_until = None
    generation.finished_at = datetime.now(timezone.utc)
  generation.state_version = (generation.state_version or 0) + 1
  await db.commit()


async def run_research(
  session_id: int,
  user_id: int | None,
  is_admin: bool = False,
  generation_id: int | None = None,
  lease_token: str | None = None,
) -> str:
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
  token = _LEASE_TOKEN.set(lease_token)
  try:
    async with session_maker() as db:
      return await _run_research(db, session_id, user_id, is_admin, generation_id)
  finally:
    _LEASE_TOKEN.reset(token)
    await engine.dispose()


async def _run_research(
  db, session_id: int, user_id: int | None, is_admin: bool = False, generation_id: int | None = None
) -> str:
  r = _get_redis()
  Runner = _get_runner()

  session = await db.get(DeepResearchSession, session_id)
  if session is None:
    return "failed"
  generation = await _ensure_generation(db, session)
  if generation_id is not None and int(generation.id) != generation_id:
    return "ignored"
  try:
    _assert_lease(generation)
  except StaleLease:
    return "ignored"
  if session.cancel_requested:
    await _cancel(db, r, session_id)
    return "cancelled"

  question = (session.question or "").strip()
  if not question or len(question) > settings.DEEP_RESEARCH_MAX_QUESTION_LENGTH:
    await _mark_failed(
      db,
      r,
      session_id,
      "input_too_large",
      "Research question exceeds the configured size limit",
    )
    return "failed"
  resume_state = session.run_state
  try:
    await _persist(
      db,
      session_id,
      status="planning",
      last_error_code=None,
      attempt_count=(session.attempt_count or 0) + 1,
    )
  except StaleLease:
    logger.info("Stopping stale deep-research worker", session_id=session_id)
    return "ignored"
  except CancellationRequested:
    await _cancel(db, r, session_id)
    return "cancelled"

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
  try:
    await _persist(db, session_id, status="searching")
  except CancellationRequested:
    await _cancel(db, r, session_id)
    return "cancelled"
  session = await db.get(DeepResearchSession, session_id)
  if session is None:
    return "failed"

  set_byo_context(
    BYOContext(
      user_id=user_id,
      provider_configs=[provider.route],
      is_admin=is_admin,
      extra={"db_session": db, "session_id": session_id, "dr_sources": []},
    )
  )
  try:
    result = Runner.run_streamed(
      agent, input=agent_input, run_config=run_config, max_turns=settings.DEEP_RESEARCH_MAX_TURNS
    )
    content: list[str] = []
    content_bytes = 0
    run_error: dict[str, Any] | None = None
    try:
      async for adapted in adapt_stream(result, session_id=session_id):
        if await _cancellation_requested(db, session_id):
          await _cancel(db, r, session_id)
          return "cancelled"
        await _emit_event(db, r, session, adapted, generation)
        t = adapted.get("type")
        if t == "chunk":
          chunk = adapted.get("content", "")
          if isinstance(chunk, str) and content_bytes < settings.DEEP_RESEARCH_MAX_REPORT_BYTES:
            bounded_chunk = _bounded_text(
              chunk, settings.DEEP_RESEARCH_MAX_REPORT_BYTES - content_bytes
            )
            content.append(bounded_chunk)
            content_bytes += len(bounded_chunk.encode("utf-8"))
        elif t == "error":
          run_error = adapted
    except SoftTimeLimitExceeded as e:
      # Time budget hit mid-run — checkpoint what the agent has and resume.
      await _persist(
        db,
        session_id,
        run_state=_bounded_json_value(
          _safe_to_input_list(result, fallback=agent_input),
          settings.DEEP_RESEARCH_MAX_EVENT_BYTES,
          fallback=agent_input,
        ),
        status="queued",
        last_error_code=ERROR_CODE_TIMEOUT,
      )
      raise DeepResearchRetryable(ERROR_CODE_TIMEOUT) from e

    checkpoint = _bounded_json_value(
          _safe_to_input_list(result, fallback=agent_input),
          settings.DEEP_RESEARCH_MAX_EVENT_BYTES,
          fallback=agent_input,
        )

    if run_error is None:
      # The model work is complete; advance through the checked synthesis and
      # verification stages before exposing a durable terminal result.
      report = _bounded_text(
        _final_output(result) or "".join(content), settings.DEEP_RESEARCH_MAX_REPORT_BYTES
      )
      await _persist(db, session_id, status="reading")
      await _persist(db, session_id, status="synthesizing")
      sources = _run_sources(report)
      session = await db.get(DeepResearchSession, session_id)
      if session is None:
        return "failed"
      generation = await _ensure_generation(db, session)
      evidence = await persist_evidence(
        db,
        session_id=session_id,
        generation_id=int(generation.id),
        sources=sources,
      )
      await _persist(db, session_id, status="verifying")
      verification = verify_report(report, {item.url for item in evidence if item.url})
      if verification.unsupported_urls:
        await _pause(
          db,
          r,
          session_id,
          "unsupported_citation",
          "Research report contains citations that are not present in its evidence ledger.",
        )
        return "paused"
      await _complete(db, r, session_id, report, sources=sources)
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
      await _persist(db, session_id, status="queued", last_error_code=code)
      session = await db.get(DeepResearchSession, session_id)
      if session is not None:
        await _emit_event(
          db, r, session,
          {"type": "retrying", "error": run_error.get("error", "Retrying research"), "error_code": code, "recoverable": True},
        )
      raise DeepResearchRetryable(code)
    if code in USER_ACTIONABLE:
      await _pause(db, r, session_id, code, run_error.get("error", "Run paused"))
      return "paused"
    await _mark_failed(db, r, session_id, code, run_error.get("error", "Run failed"))
    return "failed"

  except CancellationRequested:
    await _cancel(db, r, session_id)
    return "cancelled"
  except DeepResearchRetryable:
    raise
  except SoftTimeLimitExceeded as e:
    # Bounded execution hit its time limit; the last segment checkpoint is
    # already saved, so resume picks up from there.
    logger.info(
      "Deep research soft time limit reached; will resume", session_id=session_id
    )
    await _persist(
      db, session_id, status="queued", last_error_code=ERROR_CODE_TIMEOUT
    )
    raise DeepResearchRetryable(ERROR_CODE_TIMEOUT) from e
  except asyncio.CancelledError:
    raise
  except Exception as e:  # noqa: BLE001 — surface via the error taxonomy
    code, recoverable = classify_exception(e)
    logger.error("Deep research run error", error=str(e)[:200], error_code=code)
    if recoverable:
      await _persist(db, session_id, status="queued", last_error_code=code)
      session = await db.get(DeepResearchSession, session_id)
      if session is not None:
        await _emit_event(
          db, r, session,
          {"type": "retrying", "error": str(e)[:300], "error_code": code, "recoverable": True},
        )
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
  # A report is never evidence. Only structured results emitted by authorized
  # tools enter the ledger; otherwise a model could validate its own invented URL.
  if not collected:
    return []

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
  return out[: settings.DEEP_RESEARCH_MAX_EVIDENCE_ITEMS]


async def _cancellation_requested(db, session_id: int) -> bool:
  await db.rollback()
  session = await db.get(DeepResearchSession, session_id)
  return bool(session and session.cancel_requested)


async def _terminal_transition(
  db,
  r,
  session_id: int,
  *,
  status: str,
  event: dict[str, Any],
  report: str | None = None,
  cited_sources: list[dict[str, Any]] | None = None,
  last_error_code: str | None = None,
) -> None:
  """Atomically persist a terminal lifecycle state and its sole SSE event."""
  await db.rollback()
  session = (
    await db.execute(
      select(DeepResearchSession)
      .where(DeepResearchSession.id == session_id)
      .with_for_update()
    )
  ).scalar_one_or_none()
  if session is None:
    return
  generation = await _ensure_generation(db, session)
  _assert_lease(generation)
  terminal_exists = (
    await db.execute(
      select(DeepResearchEvent.id)
      .where(
        DeepResearchEvent.generation_id == generation.id,
        DeepResearchEvent.event_type.in_(("done", "error", "paused", "cancelled")),
      )
      .limit(1)
    )
  ).scalar_one_or_none()
  if terminal_exists is not None:
    await db.rollback()
    return
  if session.status != status:
    check_transition(str(session.status), status)
    session.status = status
    session.lifecycle_version = (session.lifecycle_version or 0) + 1
  if report is not None:
    session.report = report
  if cited_sources is not None:
    session.cited_sources = _bounded_json_value(
      cited_sources, settings.DEEP_RESEARCH_MAX_REPORT_BYTES, fallback=[]
    )
  session.run_state = None
  session.last_error_code = last_error_code
  generation.status = status
  generation.lease_until = None
  generation.finished_at = datetime.now(timezone.utc)
  generation.state_version = (generation.state_version or 0) + 1
  bounded = _bounded_event(event, settings.DEEP_RESEARCH_MAX_EVENT_BYTES)
  await EventStore().append(
    db,
    session_id=int(session.id),
    generation_id=int(generation.id),
    event=bounded,
    correlation_id=session.correlation_id,
    commit=False,
  )
  await db.commit()
  _relay(r, int(session.id), bounded)


async def _cancel(db, r, session_id: int) -> None:
  await _terminal_transition(
    db,
    r,
    session_id,
    status="cancelled",
    event={"type": "cancelled", "error": "Research cancelled", "recoverable": False},
    last_error_code="cancelled",
  )


async def _complete(
  db, r, session_id: int, report: str, *, sources: list[dict[str, Any]] | None = None
) -> None:
  report = _bounded_text(report, settings.DEEP_RESEARCH_MAX_REPORT_BYTES)
  sources = sources if sources is not None else _run_sources(report)
  await _terminal_transition(
    db,
    r,
    session_id,
    status="completed",
    event={"type": "done", "content": report, "session_id": session_id},
    report=report,
    cited_sources=sources,
  )


async def _pause(db, r, session_id: int, code: str, message: str) -> None:
  await _terminal_transition(
    db,
    r,
    session_id,
    status="paused",
    event={"type": "paused", "error": message, "error_code": code, "recoverable": True},
    last_error_code=code,
  )


async def _mark_failed(db, r, session_id: int, code: str, message: str) -> None:
  await _terminal_transition(
    db,
    r,
    session_id,
    status="failed",
    event={"type": "error", "error": message, "error_code": code, "recoverable": False},
    last_error_code=code,
  )


def run_deep_research(
  session_id: int,
  user_id: int | None,
  is_admin: bool = False,
  generation_id: int | None = None,
  lease_token: str | None = None,
) -> str:
  """Synchronous entry point for the Celery task."""
  return asyncio.run(run_research(session_id, user_id, is_admin, generation_id, lease_token))
