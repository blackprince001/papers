"""Service for multi-paper chat functionality (group/selection-based AI conversations).

Uses the OpenAI Agents SDK for agent execution with function-calling
tools.  Falls back to legacy ``provider.generate()`` for providers
that are not yet OpenAI-compatible (e.g. Gemini).
"""

import asyncio
from typing import Any, AsyncGenerator, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logger import get_logger
from app.models.multi_chat import MultiChatMessage, MultiChatSession
from app.models.paper import Paper
from app.services.ai.agent import (
  ERROR_CODE_INTERNAL,
  ERROR_CODE_NO_PROVIDER,
  adapt_stream,
  build_error_message,
  build_run_config,
  classify_exception,
)
from app.services.ai.agent.agents import build_agent_input, create_multi_paper_agent
from app.services.ai.agent.context import (
  BYOContext,
  reset_byo_context,
  set_byo_context,
)
from app.services.ai.agent.fallback_runner import stream_agent_with_fallback
from app.services.ai.agent.multi_provider import ProviderRouteConfig
from app.services.ai.agent.provider_resolver import (
  ResolvedProvider,
  resolve_providers,
)
from app.services.reference_resolver import resolve_manifest

logger = get_logger(__name__)

AGENT_PROVIDER_TYPES = {
  "openai-compatible",
  "openai",
  "anthropic",
  "deepseek",
  "ollama",
  "vllm",
}


def _get_runner():
  """Lazy import of the OpenAI Agents SDK Runner.

  Returns ``None`` when the ``openai-agents`` package is not installed.
  """
  if adapt_stream is None:
    return None
  try:
    from agents import Runner as R

    return R
  except ImportError:
    return None


class MultiChatService:
  """Service for chat functionality with multiple research papers."""

  async def create_session(
    self,
    db_session: AsyncSession,
    paper_ids: list[int],
    group_id: int | None = None,
    name: str = "New Session",
    user_id: int | None = None,
  ) -> MultiChatSession:
    papers = await self._fetch_papers(db_session, paper_ids)
    if not papers:
      raise ValueError("No valid papers found for the given IDs.")
    chat_session = MultiChatSession(name=name, group_id=group_id, user_id=user_id)
    chat_session.papers = papers
    db_session.add(chat_session)
    await db_session.commit()
    return chat_session

  async def get_session(
    self, db_session: AsyncSession, session_id: int
  ) -> MultiChatSession | None:
    query = (
      select(MultiChatSession)
      .options(
        selectinload(MultiChatSession.messages),
        selectinload(MultiChatSession.papers),
        selectinload(MultiChatSession.user),
        selectinload(MultiChatSession.group),
      )
      .where(MultiChatSession.id == session_id)
    )
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  async def get_latest_session(
    self, db_session: AsyncSession, group_id: int, user_id: int | None = None
  ) -> MultiChatSession | None:
    query = (
      select(MultiChatSession)
      .options(
        selectinload(MultiChatSession.messages),
        selectinload(MultiChatSession.papers),
        selectinload(MultiChatSession.user),
        selectinload(MultiChatSession.group),
      )
      .where(MultiChatSession.group_id == group_id)
    )
    if user_id is not None:
      query = query.where(MultiChatSession.user_id == user_id)
    query = query.order_by(MultiChatSession.updated_at.desc()).limit(1)
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  async def _get_or_create_session(
    self,
    db_session: AsyncSession,
    paper_ids: list[int],
    group_id: int | None,
    session_id: int | None,
  ) -> tuple[MultiChatSession | None, str | None]:
    chat_session = None
    if session_id:
      chat_session = await self.get_session(db_session, session_id)
      if not chat_session:
        return None, f"Session {session_id} not found"
    if not chat_session and group_id:
      chat_session = await self.get_latest_session(db_session, group_id)
    if not chat_session:
      try:
        chat_session = await self.create_session(
          db_session, paper_ids, group_id=group_id
        )
      except ValueError as e:
        return None, str(e)
    return chat_session, None

  async def _fetch_papers(
    self, db_session: AsyncSession, paper_ids: list[int]
  ) -> list[Paper]:
    if not paper_ids:
      return []
    query = (
      select(Paper)
      .where(Paper.id.in_(paper_ids))
      .options(
        selectinload(Paper.tags),
        selectinload(Paper.groups),
        selectinload(Paper.annotations),
      )
    )
    result = await db_session.execute(query)
    return list(result.scalars().all())

  async def _fetch_group_paper_ids(
    self, db_session: AsyncSession, group_id: int
  ) -> list[int]:
    from app.models.paper import paper_group_association

    query = select(paper_group_association.c.paper_id).where(
      paper_group_association.c.group_id == group_id
    )
    result = await db_session.execute(query)
    return [row[0] for row in result.fetchall()]

  async def _save_user_message(
    self,
    db_session: AsyncSession,
    session_id: int,
    content: str,
    references: dict[str, Any] | None = None,
  ) -> MultiChatMessage:
    user_msg = MultiChatMessage(
      session_id=session_id,
      role="user",
      content=content,
      references=references or {},
    )
    db_session.add(user_msg)
    await db_session.commit()
    return user_msg

  async def _save_assistant_message(
    self,
    db_session: AsyncSession,
    session_id: int,
    content: str,
  ) -> MultiChatMessage:
    assistant_msg = MultiChatMessage(
      session_id=session_id,
      role="assistant",
      content=content,
      references={},
    )
    db_session.add(assistant_msg)
    await db_session.commit()
    return assistant_msg

  async def _get_chat_history(
    self, db_session: AsyncSession, session_id: int
  ) -> list[MultiChatMessage]:
    query = (
      select(MultiChatMessage)
      .where(MultiChatMessage.session_id == session_id)
      .order_by(MultiChatMessage.created_at)
    )
    result = await db_session.execute(query)
    return list(result.scalars().all())

  async def _resolve_providers(
    self,
    db_session: AsyncSession,
    user_id: int | None,
    preferred_provider_id: int | None = None,
  ) -> list[ResolvedProvider]:
    return await resolve_providers(db_session, user_id, preferred_provider_id)

  def _setup_byo_context(
    self,
    db_session: AsyncSession,
    user_id: int | None,
    provider_configs: list[ProviderRouteConfig],
    session_id: int | None = None,
    is_admin: bool = False,
  ) -> None:
    """Set up the BYOContext for the current request (always overwrites)."""
    set_byo_context(
      BYOContext(
        user_id=user_id,
        provider_configs=provider_configs,
        is_admin=is_admin,
        extra={"db_session": db_session, "session_id": session_id},
      )
    )

  async def _persist_session_provider(
    self,
    db_session: AsyncSession,
    session_pk: int,
    current_provider_id: int | None,
    used_holder: list[ResolvedProvider],
  ) -> None:
    """Remember which provider produced the response on the session.

    Uses an explicit UPDATE by primary key rather than mutating the ORM
    object: after a tool-triggered rollback the ``MultiChatSession`` instance
    may be expired, and touching its attributes would fire an implicit lazy
    reload — which async SQLAlchemy cannot do from attribute access and which
    surfaces as ``MissingGreenlet``.
    """
    if not used_holder:
      return
    used = used_holder[-1]
    if used.provider_id is not None and current_provider_id != used.provider_id:
      from sqlalchemy import update

      await db_session.execute(
        update(MultiChatSession)
        .where(MultiChatSession.id == session_pk)
        .values(provider_id=used.provider_id)
      )
      await db_session.commit()

  def _can_use_agent(self, provider_type: str) -> bool:
    return provider_type.lower() in AGENT_PROVIDER_TYPES

  async def stream_message(
    self,
    db_session: AsyncSession,
    user_message: str,
    paper_ids: list[int] | None = None,
    group_id: int | None = None,
    references: dict[str, Any] | None = None,
    session_id: int | None = None,
    user_id: int | None = None,
    provider_id: int | None = None,
    is_admin: bool = False,
  ) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a multi-paper chat message response."""
    effective_paper_ids = paper_ids or []
    if not effective_paper_ids and group_id:
      effective_paper_ids = await self._fetch_group_paper_ids(db_session, group_id)

    if not effective_paper_ids:
      yield {
        "type": "error",
        "error": "No papers provided for context. Add papers to the group or select papers to chat about.",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    chat_session, session_error = await self._get_or_create_session(
      db_session, effective_paper_ids, group_id, session_id
    )
    if session_error or not chat_session:
      yield {
        "type": "error",
        "error": session_error or "Failed to get session",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    papers = await self._fetch_papers(db_session, effective_paper_ids)
    if not papers:
      yield {
        "type": "error",
        "error": "No papers found for the given IDs.",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    # Capture primitives up front: once the agent run starts, a tool error may
    # roll back the session and expire ``chat_session``. Re-reading its
    # attributes afterwards would fire an implicit lazy load (MissingGreenlet),
    # so everything below works off these plain ints instead of the ORM object.
    session_pk = cast(int, chat_session.id)
    current_provider_id = cast("int | None", chat_session.provider_id)

    preferred_provider_id = provider_id or current_provider_id
    resolved = await self._resolve_providers(db_session, user_id, preferred_provider_id)

    if not resolved:
      yield {
        "type": "error",
        "error": "No AI provider configured. Add one in your settings to chat.",
        "error_code": ERROR_CODE_NO_PROVIDER,
        "recoverable": False,
      }
      return
    if not self._can_use_agent(resolved[0].route.provider_type):
      yield {
        "type": "error",
        "error": (
          f"Provider '{resolved[0].route.provider_type}' is not supported for chat. "
          "Configure an OpenAI-compatible provider."
        ),
        "error_code": ERROR_CODE_NO_PROVIDER,
        "recoverable": False,
      }
      return

    _Runner = _get_runner()
    if _Runner is None:
      yield {
        "type": "error",
        "error": "OpenAI Agents SDK not installed. Please install openai-agents to use this provider.",
        "error_code": ERROR_CODE_NO_PROVIDER,
        "recoverable": False,
      }
      return

    try:
      # Replay session history so the group chat keeps context across turns
      # and across a provider switch — memory keyed by the chat session.
      history = await self._get_chat_history(db_session, session_pk)
      agent_input = build_agent_input(history, user_message)

      self._setup_byo_context(
        db_session, user_id, [r.route for r in resolved], session_id=session_pk, is_admin=is_admin
      )
      agent = create_multi_paper_agent(papers)

      await self._save_user_message(db_session, session_pk, user_message, references)

      full_content: list[str] = []
      had_error = False
      used_holder: list[ResolvedProvider] = []
      async for adapted in stream_agent_with_fallback(
        runner=_Runner,
        agent=agent,
        agent_input=agent_input,
        providers=resolved,
        session_id=session_pk,
        used_holder=used_holder,
      ):
        if adapted["type"] == "chunk":
          full_content.append(adapted.get("content", ""))
        elif adapted["type"] == "error":
          had_error = True
        yield adapted

      response_text = "".join(full_content)
      if not had_error:
        manifest = await resolve_manifest(
          db_session, user_id, response_text, paper_id=None
        )
        assistant_msg = await self._save_assistant_message(
          db_session, session_pk, response_text
        )
        if manifest:
          assistant_msg.reference_manifest = manifest
          await db_session.commit()
        await self._persist_session_provider(
          db_session, session_pk, current_provider_id, used_holder
        )
        yield {
          "type": "done",
          "content": response_text,
          "message_id": assistant_msg.id,
          "session_id": session_pk,
          "reference_manifest": manifest,
        }
      elif response_text.strip():
        await self._save_assistant_message(db_session, session_pk, response_text)

    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error(
        "Agent error in multi-chat stream_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )
      error_content = build_error_message(e)
      error_code, recoverable = classify_exception(e)
      # The session may be in an aborted transaction after a tool error; clear
      # it so this assistant-message insert can commit.
      await db_session.rollback()
      await self._save_assistant_message(db_session, session_pk, error_content)
      yield {
        "type": "error",
        "error": error_content,
        "error_code": error_code,
        "recoverable": recoverable,
      }
    finally:
      reset_byo_context()

  async def send_message(
    self,
    db_session: AsyncSession,
    user_message: str,
    paper_ids: list[int] | None = None,
    group_id: int | None = None,
    references: dict[str, Any] | None = None,
    session_id: int | None = None,
    user_id: int | None = None,
    provider_id: int | None = None,
    is_admin: bool = False,
  ) -> MultiChatMessage | None:
    """Send a multi-paper chat message and get a response (non-streaming)."""
    effective_paper_ids = paper_ids or []
    if not effective_paper_ids and group_id:
      effective_paper_ids = await self._fetch_group_paper_ids(db_session, group_id)

    if not effective_paper_ids:
      raise ValueError("No papers provided for context.")

    chat_session, session_error = await self._get_or_create_session(
      db_session, effective_paper_ids, group_id, session_id
    )
    if session_error or not chat_session:
      raise ValueError(session_error or "Failed to get session")

    papers = await self._fetch_papers(db_session, effective_paper_ids)
    if not papers:
      raise ValueError("No papers found for the given IDs.")

    session_pk = cast(int, chat_session.id)
    current_provider_id = cast("int | None", chat_session.provider_id)

    preferred_provider_id = provider_id or current_provider_id
    resolved = await self._resolve_providers(db_session, user_id, preferred_provider_id)

    if not resolved:
      raise ValueError("No AI provider configured. Add one in your settings to chat.")
    if not self._can_use_agent(resolved[0].route.provider_type):
      raise ValueError(
        f"Provider '{resolved[0].route.provider_type}' is not supported for chat. "
        "Configure an OpenAI-compatible provider."
      )

    _Runner = _get_runner()
    if _Runner is None:
      raise ValueError(
        "OpenAI Agents SDK not installed. Please install openai-agents to use this provider."
      )
    try:
      history = await self._get_chat_history(db_session, session_pk)
      agent_input = build_agent_input(history, user_message)

      self._setup_byo_context(
        db_session, user_id, [r.route for r in resolved], session_id=session_pk, is_admin=is_admin
      )
      agent = create_multi_paper_agent(papers)
      primary = resolved[0]
      rc = build_run_config(
        provider_configs=[primary.route],
        model_hint=primary.route.default_model or None,
      )

      await self._save_user_message(db_session, session_pk, user_message, references)

      result = await _Runner.run(
        agent, input=agent_input, run_config=rc, max_turns=settings.AGENT_MAX_TURNS
      )
      response_text = result.final_output

      await self._persist_session_provider(
        db_session, session_pk, current_provider_id, [primary]
      )
      return await self._save_assistant_message(db_session, session_pk, response_text)

    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error(
        "Agent error in multi-chat send_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )
      error_content = build_error_message(e)
      await db_session.rollback()
      await self._save_assistant_message(db_session, session_pk, error_content)
      raise ValueError(f"Failed to get AI response: {str(e)[:200]}") from e
    finally:
      reset_byo_context()


multi_chat_service = MultiChatService()
