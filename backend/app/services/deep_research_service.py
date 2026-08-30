"""Deep research: a long-running, resumable research agent run.

Runs ``create_deep_research_agent`` inside a Celery worker. Generation-scoped
checkpoints and the Postgres event store are the durable source of truth: a
retry resumes from ``DeepResearchGeneration.checkpoint`` and a reconnecting
browser replays ordered events from Postgres.

Failures are routed by the shared error taxonomy (``agent/error.py``):
recoverable errors raise :class:`DeepResearchRetryable` so the Celery task
resumes from the checkpoint; user-actionable errors (auth / no provider) pause
for a manual ``resume``; anything else fails.
"""

from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager
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
  DeepResearchMessage,
  DeepResearchSession,
)
from app.services.ai.agent import (
  ERROR_CODE_AUTH,
  ERROR_CODE_INTERNAL,
  ERROR_CODE_MAX_TURNS,
  ERROR_CODE_NETWORK,
  ERROR_CODE_NO_PROVIDER,
  ERROR_CODE_PROVIDER_UNAVAILABLE,
  ERROR_CODE_RATE_LIMIT,
  ERROR_CODE_TIMEOUT,
  ERROR_CODE_TOOL_ERROR,
  adapt_stream,
  build_run_config,
  classify_exception,
  get_byo_context,
  reset_byo_context,
  set_byo_context,
)
from app.services.ai.agent.agents import create_deep_research_agent
from app.services.ai.agent.context import BYOContext
from app.services.deep_research.conversation import (
  append_message,
  build_research_input,
  evidence_ids_for_generation,
)
from app.services.deep_research.event_store import DuplicateTerminalEvent, EventStore
from app.services.deep_research.evidence import persist_evidence
from app.services.deep_research.orchestrator import verify_report
from app.services.deep_research.provider import resolve_generation_provider
from app.services.deep_research.state import check_transition, payload_bytes
from app.services.deep_research.telemetry import record_metric

logger = get_logger(__name__)

# Runner requires a finite turn budget. A bound keeps one generation from
# consuming unbounded provider capacity; exhausted work pauses for review.

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

_SAFE_ERROR_MESSAGES = {
  ERROR_CODE_AUTH: "The AI provider rejected this run. Check your provider settings, then resume.",
  ERROR_CODE_INTERNAL: "The research run could not be completed. Start a new run to try again.",
  ERROR_CODE_MAX_TURNS: "This is taking a while. Resume to let the research keep going.",
  ERROR_CODE_NETWORK: "The connection to the AI provider was interrupted. The run will retry.",
  ERROR_CODE_NO_PROVIDER: "No AI provider is configured. Add one in Settings, then resume.",
  ERROR_CODE_PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable. The run will retry.",
  ERROR_CODE_RATE_LIMIT: "The AI provider is rate-limiting this run. The run will retry.",
  ERROR_CODE_TIMEOUT: "The research run timed out. The run will retry.",
  ERROR_CODE_TOOL_ERROR: "A research source could not be read. The run will retry.",
}


def _safe_error_message(error_code: str) -> str:
  """Return a bounded, provider-agnostic message for durable/UI surfaces."""
  return _SAFE_ERROR_MESSAGES.get(error_code, _SAFE_ERROR_MESSAGES[ERROR_CODE_INTERNAL])


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
  except Exception:  # noqa: BLE001 — SDK internals vary; degrade gracefully
    logger.warning("to_input_list unavailable; resuming from prior input")
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
    if k != "checkpoint":
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
  if "checkpoint" in values:
    generation.checkpoint = values["checkpoint"]
    generation.checkpoint_bytes = (
      payload_bytes(values["checkpoint"]) if values["checkpoint"] is not None else 0
    )
  if str(row.status) in {"completed", "failed", "cancelled", "paused"}:
    generation.lease_until = None
    generation.finished_at = datetime.now(timezone.utc)
  generation.state_version = (generation.state_version or 0) + 1
  await db.commit()
  if target_status is not None:
    record_metric(
      "phase_transition",
      mode=generation.mode,
      status=str(row.status),
      phase=str(row.status),
      provider_type=generation.provider_type,
      model=generation.model,
      retry_count=row.attempt_count,
    )


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
      return await _run_research(
        db,
        session_id,
        user_id,
        is_admin,
        generation_id,
        session_maker=session_maker,
      )
  finally:
    _LEASE_TOKEN.reset(token)
    await engine.dispose()


@asynccontextmanager
async def _agent_session(session_maker, fallback_db):
  """Yield the DB session reserved for tool calls during a streamed run.

  The lifecycle session is used for checkpoints, cancellation, and events.
  Keeping tool queries on a second session prevents the SDK's stream task and
  the lifecycle loop from concurrently using one asyncpg connection.
  """
  if session_maker is None:
    # Preserve direct/private callers while ensuring the production entry point
    # always supplies a fresh session maker.
    yield fallback_db
    return

  async with session_maker() as tool_db:
    yield tool_db


async def _run_research(
  db,
  session_id: int,
  user_id: int | None,
  is_admin: bool = False,
  generation_id: int | None = None,
  session_maker=None,
) -> str:
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
    await _cancel(db, session_id)
    return "cancelled"

  question = (session.question or "").strip()
  if not question or len(question) > settings.DEEP_RESEARCH_MAX_QUESTION_LENGTH:
    await _mark_failed(
      db,
      session_id,
      "input_too_large",
      "Research question exceeds the configured size limit",
    )
    return "failed"
  resume_state = generation.checkpoint
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
    await _cancel(db, session_id)
    return "cancelled"

  if Runner is None:
    await _pause(
      db, session_id, ERROR_CODE_NO_PROVIDER, "OpenAI Agents SDK not installed."
    )
    return "paused"

  provider = await resolve_generation_provider(
    db,
    user_id=user_id,
    generation=generation,
  )
  if provider is None:
    await _pause(
      db,
      session_id,
      ERROR_CODE_NO_PROVIDER,
      "No AI provider configured. Add one in your settings to run deep research.",
    )
    return "paused"
  if provider.route.provider_type.lower() not in AGENT_PROVIDER_TYPES:
    await _pause(
      db,
      session_id,
      ERROR_CODE_NO_PROVIDER,
      f"Provider '{provider.route.provider_type}' is not supported. "
      "Configure an OpenAI-compatible provider.",
    )
    return "paused"

  record_metric(
    "provider_selected",
    mode=generation.mode,
    status="running",
    provider_type=provider.route.provider_type,
    model=provider.route.default_model,
  )

  # Persist the provider/model pin before any streamed work begins. Retries and
  # later Research further generations then resolve this same provider instead
  # of silently following a changed account default.
  await db.commit()
  run_config = build_run_config(
    provider_configs=[provider.route],
    model_hint=provider.route.default_model or None,
  )
  agent = create_deep_research_agent()
  agent_input: Any = resume_state or await build_research_input(
    db,
    session=session,
    generation=generation,
  )
  try:
    await _persist(db, session_id, status="searching")
  except CancellationRequested:
    await _cancel(db, session_id)
    return "cancelled"
  session = await db.get(DeepResearchSession, session_id)
  if session is None:
    return "failed"

  try:
    async with _agent_session(session_maker, db) as tool_db:
      set_byo_context(
        BYOContext(
          user_id=user_id,
          provider_configs=[provider.route],
          is_admin=is_admin,
          extra={"db_session": tool_db, "session_id": session_id, "dr_sources": []},
        )
      )
      result = Runner.run_streamed(
        agent, input=agent_input, run_config=run_config, max_turns=settings.DEEP_RESEARCH_MAX_TURNS
      )
      content: list[str] = []
      content_bytes = 0
      run_error: dict[str, Any] | None = None
      try:
        async for adapted in adapt_stream(result, session_id=session_id):
          if await _cancellation_requested(db, session_id):
            await _cancel(db, session_id)
            return "cancelled"
          await _emit_event(db, session, adapted, generation)
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
          checkpoint=_bounded_json_value(
            _safe_to_input_list(result, fallback=agent_input),
            settings.DEEP_RESEARCH_MAX_EVENT_BYTES,
            fallback=agent_input,
          ),
          status="queued",
          last_error_code=ERROR_CODE_TIMEOUT,
        )
        raise DeepResearchRetryable(ERROR_CODE_TIMEOUT) from e

      collected_sources = list(get_byo_context().extra.get("dr_sources") or [])

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
      sources = _run_sources(report, collected_sources)
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
          session_id,
          "unsupported_citation",
          "Research report contains citations that are not present in its evidence ledger.",
        )
        return "paused"
      existing_assistant = (
        await db.execute(
          select(DeepResearchMessage.id).where(
            DeepResearchMessage.generation_id == generation.id,
            DeepResearchMessage.role == "assistant",
          ).limit(1)
        )
      ).scalar_one_or_none()
      if existing_assistant is None:
        await append_message(
          db,
          session_id=session_id,
          generation_id=int(generation.id),
          role="assistant",
          mode="research",
          content=report,
          payload={
            "mode": "research",
            "verification": "evidence_scoped" if evidence else "insufficient_evidence",
            "source_ids": await evidence_ids_for_generation(
              db, generation_id=int(generation.id)
            ),
          },
        )
        await db.commit()
      await _complete(db, session_id, report, sources=sources)
      return "completed"

    code = run_error.get("error_code") or ERROR_CODE_INTERNAL
    await _persist(db, session_id, checkpoint=checkpoint)

    if code == ERROR_CODE_MAX_TURNS:
      # Investigation didn't converge within the budget — pause with the
      # checkpoint saved so a resume continues rather than restarting.
      await _pause(
        db,
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
          db, session,
          {"type": "retrying", "error": _safe_error_message(code), "error_code": code, "recoverable": True},
        )
      raise DeepResearchRetryable(code)
    if code in USER_ACTIONABLE:
      await _pause(db, session_id, code, _safe_error_message(code))
      return "paused"
    await _mark_failed(db, session_id, code, _safe_error_message(code))
    return "failed"

  except CancellationRequested:
    await _cancel(db, session_id)
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
    logger.error("Deep research run error", error_code=code, recoverable=recoverable)
    if recoverable:
      await _persist(db, session_id, status="queued", last_error_code=code)
      session = await db.get(DeepResearchSession, session_id)
      if session is not None:
        await _emit_event(
          db, session,
          {"type": "retrying", "error": _safe_error_message(code), "error_code": code, "recoverable": True},
        )
      raise DeepResearchRetryable(code) from e
    if code in USER_ACTIONABLE:
      await _pause(db, session_id, code, _safe_error_message(code))
      return "paused"
    await _mark_failed(db, session_id, code, _safe_error_message(code))
    return "failed"
  finally:
    reset_byo_context()


def _run_sources(
  report: str, collected_sources: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
  """The run's cited sources: the structured papers the tools collected this run
  (rich metadata for the Citations panel), deduped; falls back to links parsed
  from the report when nothing was collected."""
  if collected_sources is None:
    try:
      collected = get_byo_context().extra.get("dr_sources") or []
    except Exception:  # noqa: BLE001
      collected = []
  else:
    collected = collected_sources
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
  session.last_error_code = last_error_code
  generation.status = status
  if status != "paused":
    generation.checkpoint = None
    generation.checkpoint_bytes = 0
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
  duration_ms = None
  if generation.started_at is not None:
    duration_ms = max(
      0, int((datetime.now(timezone.utc) - generation.started_at).total_seconds() * 1000)
    )
  record_metric(
    "run_terminal",
    mode=generation.mode,
    status=status,
    phase=status,
    provider_type=generation.provider_type,
    model=generation.model,
    duration_ms=duration_ms,
    source_count=len(cited_sources or []),
    verification_status=(
      "verified" if status == "completed" and cited_sources
      else "insufficient_evidence" if status == "completed"
      else "needs_attention"
    ),
    error_code=last_error_code,
    stop_reason=last_error_code,
    cancel_requested=status in {"cancelled", "cancel_requested"},
  )


async def _cancel(db, session_id: int) -> None:
  await _terminal_transition(
    db,
    session_id,
    status="cancelled",
    event={"type": "cancelled", "error": "Research cancelled", "recoverable": False},
    last_error_code="cancelled",
  )


async def _complete(
  db, session_id: int, report: str, *, sources: list[dict[str, Any]] | None = None
) -> None:
  report = _bounded_text(report, settings.DEEP_RESEARCH_MAX_REPORT_BYTES)
  sources = sources if sources is not None else _run_sources(report)
  await _terminal_transition(
    db,
    session_id,
    status="completed",
    event={"type": "done", "content": report, "session_id": session_id},
    report=report,
    cited_sources=sources,
  )


async def _pause(db, session_id: int, code: str, message: str) -> None:
  await _terminal_transition(
    db,
    session_id,
    status="paused",
    event={"type": "paused", "error": message, "error_code": code, "recoverable": True},
    last_error_code=code,
  )


async def _mark_failed(db, session_id: int, code: str, message: str) -> None:
  await _terminal_transition(
    db,
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
