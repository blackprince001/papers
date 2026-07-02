"""Service for chat functionality with research papers.

Uses the OpenAI Agents SDK for agent execution with function-calling
tools for paper content retrieval.  Falls back to the legacy
``provider.generate()`` path for providers that are not yet
OpenAI-compatible (e.g. Gemini).
"""

import asyncio
import re
from typing import Any, AsyncGenerator, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.logger import get_logger
from app.models.annotation import Annotation
from app.models.chat import ChatMessage, ChatSession
from app.models.paper import Paper
from app.services.ai.agent import (
  ERROR_CODE_INTERNAL,
  ERROR_CODE_NO_PROVIDER,
  adapt_stream,
  build_error_message,
  build_run_config,
  classify_exception,
)
from app.services.ai.agent.agents import build_agent_input, create_paper_agent
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
from app.services.ai.helpers import get_provider_for_user
from app.services.ai.providers.base import AIProvider, GenerateConfig
from app.services.content_provider import content_provider
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

  Returns ``None`` when the ``openai-agents`` package is not installed,
  allowing the legacy provider path to operate without it.
  """
  if adapt_stream is None:
    return None
  try:
    from agents import Runner as R

    return R
  except ImportError:
    return None


class ChatService:
  """Service for chat functionality with research papers."""

  async def _get_provider(
    self,
    db_session: AsyncSession | None = None,
    user_id: int | None = None,
    preferred_provider_id: int | None = None,
  ) -> AIProvider | None:
    return await get_provider_for_user(db_session, user_id, preferred_provider_id)

  def _build_config(
    self,
    provider: AIProvider,
    system_instruction: str | None = None,
    temperature: float = 0.7,
    max_output_tokens: int | None = None,
    response_format: dict[str, Any] | None = None,
  ) -> GenerateConfig:
    return GenerateConfig(
      model=provider.config.model or "",
      system_instruction=system_instruction,
      temperature=temperature,
      max_output_tokens=max_output_tokens,
      response_format=response_format,
    )

  def parse_mentions(self, text: str) -> dict[str, list[int]]:
    """Parse @mentions from message text."""
    parsed_mentions: dict[str, list[int]] = {
      "notes": [],
      "annotations": [],
      "papers": [],
    }
    patterns = {
      "notes": r"@note(?:{(\d+)})?",
      "annotations": r"@annotation(?:{(\d+)})?",
      "papers": r"@paper(?:{(\d+)})?",
    }

    for mention_type, pattern in patterns.items():
      matches = re.finditer(pattern, text, re.IGNORECASE)
      for match in matches:
        mention_id = match.group(1)
        if mention_id:
          parsed_mentions[mention_type].append(int(mention_id))

    return parsed_mentions

  async def _resolve_notes(
    self, db_session: AsyncSession, paper_id: int, note_ids: list[int]
  ) -> list[dict[str, Any]]:
    if not note_ids:
      return []
    query = (
      select(Annotation)
      .where(Annotation.id.in_(note_ids))
      .where(Annotation.paper_id == paper_id)
      .where(Annotation.type == "note")
    )
    result = await db_session.execute(query)
    notes = result.scalars().all()
    resolved_notes = []
    for note in notes:
      page_info = ""
      if note.note_scope == "page" and note.coordinate_data:
        page = note.coordinate_data.get("page")
        if page:
          page_info = f" (Page {page})"
      resolved_notes.append(
        {
          "id": note.id,
          "content": note.content,
          "page": note.coordinate_data.get("page") if note.coordinate_data else None,
          "scope": note.note_scope,
          "display": f"Note {note.id}{page_info}: {note.content[:100]}...",
        }
      )
    return resolved_notes

  async def _resolve_annotations(
    self, db_session: AsyncSession, paper_id: int, annotation_ids: list[int]
  ) -> list[dict[str, Any]]:
    if not annotation_ids:
      return []
    query = (
      select(Annotation)
      .where(Annotation.id.in_(annotation_ids))
      .where(Annotation.paper_id == paper_id)
      .where(Annotation.type == "annotation")
    )
    result = await db_session.execute(query)
    annotations = result.scalars().all()
    resolved_annotations = []
    for ann in annotations:
      page_info = ""
      if ann.coordinate_data:
        page = ann.coordinate_data.get("page")
        if page:
          page_info = f" (Page {page})"
      highlighted = ann.highlighted_text or ann.content[:100]
      resolved_annotations.append(
        {
          "id": ann.id,
          "content": ann.content,
          "highlighted_text": ann.highlighted_text,
          "page": ann.coordinate_data.get("page") if ann.coordinate_data else None,
          "display": f"Annotation {ann.id}{page_info}: {highlighted}...",
        }
      )
    return resolved_annotations

  async def _resolve_papers(
    self, db_session: AsyncSession, paper_ids: list[int]
  ) -> list[dict[str, Any]]:
    if not paper_ids:
      return []
    query = select(Paper).where(Paper.id.in_(paper_ids))
    result = await db_session.execute(query)
    papers = result.scalars().all()
    return [
      {
        "id": paper.id,
        "title": paper.title,
        "content_text": paper.content_text or "",
        "doi": paper.doi,
        "display": f"Paper: {paper.title}",
      }
      for paper in papers
    ]

  async def resolve_references(
    self,
    db_session: AsyncSession,
    paper_id: int,
    mentions: dict[str, list[int]],
  ) -> dict[str, Any]:
    notes = await self._resolve_notes(db_session, paper_id, mentions.get("notes", []))
    annotations = await self._resolve_annotations(
      db_session, paper_id, mentions.get("annotations", [])
    )
    papers = await self._resolve_papers(db_session, mentions.get("papers", []))
    return {"notes": notes, "annotations": annotations, "papers": papers}

  async def create_session(
    self,
    db_session: AsyncSession,
    paper_id: int,
    name: str = "New Session",
    user_id: int | None = None,
  ) -> ChatSession:
    if not name or name.strip() in ("", "New Session"):
      count_query = (
        select(func.count())
        .select_from(ChatSession)
        .where(ChatSession.paper_id == paper_id)
      )
      if user_id is not None:
        count_query = count_query.where(ChatSession.user_id == user_id)
      existing = (await db_session.execute(count_query)).scalar_one() or 0
      name = f"Chat {existing + 1}"

    chat_session = ChatSession(paper_id=paper_id, name=name, user_id=user_id)
    db_session.add(chat_session)
    await db_session.commit()
    return chat_session

  async def get_session(
    self, db_session: AsyncSession, session_id: int
  ) -> ChatSession | None:
    query = (
      select(ChatSession)
      .where(ChatSession.id == session_id)
      .options(
        selectinload(ChatSession.messages),
        selectinload(ChatSession.user),
        selectinload(ChatSession.paper),
      )
    )
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  async def get_latest_session(
    self, db_session: AsyncSession, paper_id: int, user_id: int | None = None
  ) -> ChatSession | None:
    query = (
      select(ChatSession)
      .where(ChatSession.paper_id == paper_id)
      .options(
        selectinload(ChatSession.messages),
        selectinload(ChatSession.user),
        selectinload(ChatSession.paper),
      )
    )
    if user_id is not None:
      query = query.where(ChatSession.user_id == user_id)
    query = query.order_by(ChatSession.updated_at.desc()).limit(1)
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  async def _get_or_create_session(
    self,
    db_session: AsyncSession,
    paper_id: int,
    session_id: int | None,
    user_id: int | None = None,
  ) -> tuple[ChatSession | None, str | None]:
    chat_session = None
    if session_id:
      chat_session = await self.get_session(db_session, session_id)
      if chat_session and chat_session.paper_id != paper_id:
        return None, "Session does not belong to this paper"
    if not chat_session:
      chat_session = await self.get_latest_session(
        db_session, paper_id, user_id=user_id
      )
    if not chat_session:
      chat_session = await self.create_session(db_session, paper_id, user_id=user_id)
    return chat_session, None

  async def _fetch_paper(self, db_session: AsyncSession, paper_id: int) -> Paper | None:
    paper_query = (
      select(Paper)
      .where(Paper.id == paper_id)
      .options(
        selectinload(Paper.tags),
        selectinload(Paper.groups),
        selectinload(Paper.annotations),
      )
    )
    paper_result = await db_session.execute(paper_query)
    return paper_result.scalar_one_or_none()

  async def _get_chat_history(
    self, db_session: AsyncSession, session_id: int
  ) -> list[ChatMessage]:
    messages_query = (
      select(ChatMessage)
      .where(ChatMessage.session_id == session_id)
      .order_by(ChatMessage.created_at)
    )
    messages_result = await db_session.execute(messages_query)
    return list(messages_result.scalars().all())

  def _extract_mention_ids(
    self, references: dict[str, Any] | None
  ) -> dict[str, list[int]]:
    if not references:
      return {"notes": [], "annotations": [], "papers": []}
    return {
      "notes": [r.get("id") for r in references.get("notes", []) if r.get("id")],
      "annotations": [
        r.get("id") for r in references.get("annotations", []) if r.get("id")
      ],
      "papers": [r.get("id") for r in references.get("papers", []) if r.get("id")],
    }

  async def _save_user_message(
    self,
    db_session: AsyncSession,
    session_id: int,
    content: str,
    references: dict[str, Any],
  ) -> ChatMessage:
    user_msg = ChatMessage(
      session_id=session_id,
      role="user",
      content=content,
      references=references,
    )
    db_session.add(user_msg)
    await db_session.commit()
    return user_msg

  async def _save_assistant_message(
    self,
    db_session: AsyncSession,
    session_id: int,
    content: str,
  ) -> ChatMessage:
    assistant_msg = ChatMessage(
      session_id=session_id,
      role="assistant",
      content=content,
      references={},
    )
    db_session.add(assistant_msg)
    await db_session.commit()
    return assistant_msg

  def _setup_byo_context(
    self,
    db_session: AsyncSession,
    user_id: int | None,
    provider_configs: list[ProviderRouteConfig],
    session_id: int | None = None,
  ) -> None:
    """Set up the BYOContext for the current request.

    Always overwrites any prior context so a request never inherits another
    request's db_session or credentials. ``session_id`` is stored so tools
    (e.g. ``get_chat_history``) can scope to the active chat session without
    the model having to supply it.
    """
    set_byo_context(
      BYOContext(
        user_id=user_id,
        provider_configs=provider_configs,
        extra={"db_session": db_session, "session_id": session_id},
      )
    )

  async def _resolve_providers(
    self,
    db_session: AsyncSession,
    user_id: int | None,
    preferred_provider_id: int | None = None,
  ) -> list[ResolvedProvider]:
    return await resolve_providers(db_session, user_id, preferred_provider_id)

  async def _persist_session_provider(
    self,
    db_session: AsyncSession,
    session_pk: int,
    current_provider_id: int | None,
    used_holder: list[ResolvedProvider],
  ) -> None:
    """Remember which provider produced the response on the session.

    Uses an explicit UPDATE by primary key rather than mutating the ORM
    object: after a tool-triggered rollback the ``ChatSession`` instance may
    be expired, and touching its attributes would fire an implicit lazy reload
    — which async SQLAlchemy cannot do from attribute access and which
    surfaces as ``MissingGreenlet``.
    """
    if not used_holder:
      return
    used = used_holder[-1]
    if used.provider_id is not None and current_provider_id != used.provider_id:
      from sqlalchemy import update

      await db_session.execute(
        update(ChatSession)
        .where(ChatSession.id == session_pk)
        .values(provider_id=used.provider_id)
      )
      await db_session.commit()

  def _can_use_agent(self, provider_type: str) -> bool:
    """Check if the provider supports the agent framework."""
    return provider_type.lower() in AGENT_PROVIDER_TYPES

  def _build_context_header(self, paper: Paper) -> list[str]:
    parts = [
      "You are an AI assistant helping a user learn from research papers. "
      "Provide clear, educational responses.",
      f"\n## Paper: {paper.title}",
    ]
    if paper.doi:
      parts.append(f"DOI: {paper.doi}")
    return parts

  def _build_context_content(self, paper: Paper) -> str:
    if not paper.content_text:
      return ""
    content = cast(str, paper.content_text)
    max_length = 3000
    if len(content) > max_length:
      content = content[:max_length] + "..."
    return f"\nContent:\n{content}"

  async def stream_message(
    self,
    db_session: AsyncSession,
    paper_id: int,
    user_message: str,
    references: dict[str, Any] | None = None,
    session_id: int | None = None,
    user_id: int | None = None,
    provider_id: int | None = None,
  ) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a chat message response.

    Uses the new agent framework for OpenAI-compatible providers and
    falls back to the legacy ``provider.generate()`` path for others.
    """
    chat_session, session_error = await self._get_or_create_session(
      db_session, paper_id, session_id, user_id=user_id
    )
    if session_error or not chat_session:
      yield {
        "type": "error",
        "error": session_error or "Failed to get session",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    paper = await self._fetch_paper(db_session, paper_id)
    if not paper:
      yield {
        "type": "error",
        "error": f"Paper {paper_id} not found",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    # Capture primitives up front: a tool error during the agent run may roll
    # back the session and expire ``chat_session``. Re-reading its attributes
    # afterwards would fire an implicit lazy load (MissingGreenlet), so the rest
    # of this method works off these plain ints instead of the ORM object.
    session_pk = cast(int, chat_session.id)
    current_provider_id = cast("int | None", chat_session.provider_id)

    # Resolve the provider chain (default + fallbacks). No env fallback:
    # an unconfigured user gets a clear error instead of a silent server key.
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
          "Configure an OpenAI-compatible provider (openai, anthropic, deepseek, "
          "ollama, vllm, or a custom endpoint)."
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
      # Replay this session's history so the agent keeps context across turns
      # and across a provider switch — memory is keyed by the chat session.
      history = await self._get_chat_history(db_session, session_pk)
      agent_input = build_agent_input(history, user_message)

      self._setup_byo_context(
        db_session, user_id, [r.route for r in resolved], session_id=session_pk
      )
      agent = create_paper_agent(paper)

      await self._save_user_message(db_session, session_pk, user_message, {})

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
          db_session, user_id, response_text, paper_id=paper_id
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
        # Persist whatever streamed before the error so the turn isn't lost.
        await self._save_assistant_message(db_session, session_pk, response_text)

    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error(
        "Agent error in stream_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )
      error_content = build_error_message(e)
      error_code, recoverable = classify_exception(e)
      # Clear any aborted transaction left by a tool error before inserting.
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
    paper_id: int,
    user_message: str,
    references: dict[str, Any] | None = None,
    session_id: int | None = None,
    user_id: int | None = None,
    provider_id: int | None = None,
  ) -> ChatMessage | None:
    """Send a chat message and get a response (non-streaming, agent-only)."""
    chat_session, session_error = await self._get_or_create_session(
      db_session, paper_id, session_id, user_id=user_id
    )
    if session_error or not chat_session:
      raise ValueError(session_error or "Failed to get session")

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
    paper = await self._fetch_paper(db_session, paper_id)
    if not paper:
      raise ValueError(f"Paper {paper_id} not found")
    try:
      history = await self._get_chat_history(db_session, session_pk)
      agent_input = build_agent_input(history, user_message)

      self._setup_byo_context(
        db_session, user_id, [r.route for r in resolved], session_id=session_pk
      )
      agent = create_paper_agent(paper)
      primary = resolved[0]
      rc = build_run_config(
        provider_configs=[primary.route],
        model_hint=primary.route.default_model or None,
      )

      await self._save_user_message(db_session, session_pk, user_message, {})

      result = await _Runner.run(
        agent, input=agent_input, run_config=rc, max_turns=settings.AGENT_MAX_TURNS
      )
      response_text = result.final_output

      assistant_msg = await self._save_assistant_message(
        db_session, session_pk, response_text
      )
      manifest = await resolve_manifest(
        db_session, user_id, response_text, paper_id=paper_id
      )
      if manifest:
        assistant_msg.reference_manifest = manifest
        await db_session.commit()
      await self._persist_session_provider(
        db_session, session_pk, current_provider_id, [primary]
      )
      return assistant_msg

    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error(
        "Agent error in send_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )
      error_content = build_error_message(e)
      await db_session.rollback()
      await self._save_assistant_message(db_session, session_pk, error_content)
      raise ValueError(f"Failed to get AI response: {str(e)[:200]}") from e
    finally:
      reset_byo_context()

  async def get_thread_messages(
    self, db_session: AsyncSession, parent_message_id: int
  ) -> list[ChatMessage]:
    query = (
      select(ChatMessage)
      .where(ChatMessage.parent_message_id == parent_message_id)
      .order_by(ChatMessage.created_at)
    )
    result = await db_session.execute(query)
    return list(result.scalars().all())

  async def get_thread_count(self, db_session: AsyncSession, message_id: int) -> int:
    from sqlalchemy import func

    query = select(func.count()).where(ChatMessage.parent_message_id == message_id)
    result = await db_session.execute(query)
    return result.scalar() or 0

  async def get_message_by_id(
    self, db_session: AsyncSession, message_id: int
  ) -> ChatMessage | None:
    query = select(ChatMessage).where(ChatMessage.id == message_id)
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  def build_thread_context(
    self,
    paper: Paper,
    parent_message: ChatMessage,
    thread_history: list[ChatMessage],
    use_file_context: bool = False,
  ) -> str:
    context_parts = self._build_context_header(paper)
    if not use_file_context:
      context_parts.append(self._build_context_content(paper))
    context_parts.append("\n## Original Message (you are replying to this):")
    context_parts.append(f"Assistant: {parent_message.content}")
    if thread_history:
      context_parts.append("\n## Thread Conversation:")
      for msg in thread_history[-5:]:
        role_label = "User" if msg.role == "user" else "Assistant"
        msg_content = msg.content[:500]
        if len(msg.content) > 500:
          msg_content += "..."
        context_parts.append(f"\n{role_label}: {msg_content}")
    return "\n".join(context_parts)

  async def _save_thread_message(
    self,
    db_session: AsyncSession,
    session_id: int,
    parent_message_id: int,
    role: str,
    content: str,
    references: dict[str, Any] | None = None,
  ) -> ChatMessage:
    msg = ChatMessage(
      session_id=session_id,
      parent_message_id=parent_message_id,
      role=role,
      content=content,
      references=references or {},
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)
    return msg

  def _build_thread_agent_input(
    self,
    parent_message: ChatMessage,
    thread_history: list[ChatMessage],
    user_message: str,
  ) -> list[dict[str, str]]:
    """Build the Runner input for a thread reply.

    Replays the parent assistant message followed by the thread's prior
    turns so the agent stays anchored to the message being discussed, then
    appends the new user question. The paper content itself is injected via
    ``create_paper_agent``'s instructions, so it isn't repeated here.
    """
    return build_agent_input([parent_message, *thread_history], user_message)

  async def stream_thread_message(
    self,
    db_session: AsyncSession,
    parent_message_id: int,
    user_message: str,
    references: dict[str, Any] | None = None,
    user_id: int | None = None,
  ) -> AsyncGenerator[dict[str, Any], None]:
    """Stream AI response for a thread message.

    Uses the agent framework so thread replies stream real model tokens as
    they arrive (matching ``stream_message``) instead of buffering the full
    response and slicing it into fake chunks.
    """
    parent_message = await self.get_message_by_id(db_session, parent_message_id)
    if not parent_message:
      yield {
        "type": "error",
        "error": "Parent message not found",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    if parent_message.role != "assistant":
      yield {
        "type": "error",
        "error": "Can only create threads on assistant messages",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    session_id = cast(int, parent_message.session_id)
    chat_session = await self.get_session(db_session, session_id)
    if not chat_session:
      yield {
        "type": "error",
        "error": "Session not found",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    # Capture primitives up front — a tool error mid-run may roll back and
    # expire the ORM object (see stream_message for the MissingGreenlet note).
    paper_id = cast(int, chat_session.paper_id)
    current_provider_id = cast("int | None", chat_session.provider_id)

    paper = await self._fetch_paper(db_session, paper_id)
    if not paper:
      yield {
        "type": "error",
        "error": f"Paper {paper_id} not found",
        "error_code": ERROR_CODE_INTERNAL,
        "recoverable": False,
      }
      return

    resolved = await self._resolve_providers(db_session, user_id, current_provider_id)
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
          "Configure an OpenAI-compatible provider (openai, anthropic, deepseek, "
          "ollama, vllm, or a custom endpoint)."
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
      thread_history = await self.get_thread_messages(db_session, parent_message_id)
      agent_input = self._build_thread_agent_input(
        parent_message, thread_history, user_message
      )

      self._setup_byo_context(
        db_session, user_id, [r.route for r in resolved], session_id=session_id
      )
      agent = create_paper_agent(paper)

      await self._save_thread_message(
        db_session, session_id, parent_message_id, "user", user_message, references
      )

      full_content: list[str] = []
      had_error = False
      used_holder: list[ResolvedProvider] = []
      async for adapted in stream_agent_with_fallback(
        runner=_Runner,
        agent=agent,
        agent_input=agent_input,
        providers=resolved,
        session_id=session_id,
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
          db_session, user_id, response_text, paper_id=paper_id
        )
        assistant_msg = await self._save_thread_message(
          db_session, session_id, parent_message_id, "assistant", response_text
        )
        if manifest:
          assistant_msg.reference_manifest = manifest
          await db_session.commit()
        await self._persist_session_provider(
          db_session, session_id, current_provider_id, used_holder
        )
        yield {
          "type": "done",
          "content": response_text,
          "message_id": assistant_msg.id,
          "parent_message_id": parent_message_id,
          "reference_manifest": manifest,
        }
      elif response_text.strip():
        # Persist whatever streamed before the error so the turn isn't lost.
        await self._save_thread_message(
          db_session, session_id, parent_message_id, "assistant", response_text
        )

    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error(
        "Agent error in stream_thread_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )
      error_content = build_error_message(e)
      error_code, recoverable = classify_exception(e)
      # Clear any aborted transaction left by a tool error before inserting.
      await db_session.rollback()
      await self._save_thread_message(
        db_session, session_id, parent_message_id, "assistant", error_content
      )
      yield {
        "type": "error",
        "error": error_content,
        "error_code": error_code,
        "recoverable": recoverable,
      }
    finally:
      reset_byo_context()

  async def send_thread_message(
    self,
    db_session: AsyncSession,
    parent_message_id: int,
    user_message: str,
    references: dict[str, Any] | None = None,
    user_id: int | None = None,
  ) -> tuple[ChatMessage, ChatMessage]:
    """Send a thread message and get AI response (non-streaming)."""
    provider = await self._get_provider(db_session, user_id)
    if not provider:
      raise ValueError(
        "AI provider not configured. Please configure your AI provider in settings."
      )

    parent_message = await self.get_message_by_id(db_session, parent_message_id)
    if not parent_message:
      raise ValueError("Parent message not found")
    if parent_message.role != "assistant":
      raise ValueError("Can only create threads on assistant messages")

    session_id = parent_message.session_id
    chat_session = await self.get_session(db_session, session_id)
    if not chat_session:
      raise ValueError("Session not found")

    paper_id = chat_session.paper_id
    paper = await self._fetch_paper(db_session, paper_id)
    if not paper:
      raise ValueError(f"Paper {paper_id} not found")

    thread_history = await self.get_thread_messages(db_session, parent_message_id)
    paper_content_parts = await content_provider.get_content_parts(paper)
    use_file_context = bool(paper_content_parts) and any(
      hasattr(p, "file_uri") for p in paper_content_parts
    )

    context = self.build_thread_context(
      paper, parent_message, thread_history, use_file_context=use_file_context
    )

    user_msg = await self._save_thread_message(
      db_session, session_id, parent_message_id, "user", user_message, references
    )

    full_prompt = f"{context}\n\n## User Question (in thread):\n{user_message}"

    try:
      config = self._build_config(provider)
      full_content = await provider.generate(full_prompt, config)
      assistant_msg = await self._save_thread_message(
        db_session, session_id, parent_message_id, "assistant", full_content
      )
      return user_msg, assistant_msg
    except asyncio.CancelledError:
      raise
    except Exception as e:
      logger.error(
        "AI provider error in send_thread_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )
      error_content = build_error_message(e)
      _ = await self._save_thread_message(
        db_session, session_id, parent_message_id, "assistant", error_content
      )
      raise


chat_service = ChatService()
