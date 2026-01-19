import asyncio
import re
from typing import Any, AsyncGenerator, cast

from google import genai
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import get_logger
from app.models.annotation import Annotation
from app.models.chat import ChatMessage, ChatSession
from app.models.paper import Paper
from app.utils.citation_extractor import add_citations

logger = get_logger(__name__)

RATE_LIMIT_ERROR_MESSAGE = (
  "I apologize, but I've hit the API rate limit/quota. "
  "This means your Google API quota has been exceeded. "
  "Please check your plan and billing details at https://ai.dev/rate-limit. "
  "If you've changed your API key, please restart the backend server."
)


def _is_rate_limit_error(error: Exception) -> bool:
  """Determine if an exception is a rate limit/quota error."""
  error_str = str(error)
  error_type = type(error).__name__

  is_rate_limited = (
    "429" in error_str
    or "RESOURCE_EXHAUSTED" in error_str
    or error_type == "ResourceExhausted"
    or "ResourceExhausted" in error_str
    or ("quota" in error_str.lower() and "exceeded" in error_str.lower())
    or ("quota" in error_str.lower() and "limit" in error_str.lower())
  )
  return is_rate_limited


def _build_error_message(error: Exception) -> str:
  """Build user-facing error message based on exception type."""
  if _is_rate_limit_error(error):
    return RATE_LIMIT_ERROR_MESSAGE
  return f"I apologize, but I encountered an error: {str(error)[:200]}"


class ChatService:
  def __init__(self) -> None:
    self.client: genai.Client | None = None
    self._last_api_key: str | None = None
    self._initialize_client()

  def _initialize_client(self) -> None:
    """Initialize or refresh the Google API client with current settings."""
    current_key = settings.GOOGLE_API_KEY
    has_key_changed = self._last_api_key != current_key
    should_recreate = not self.client or has_key_changed

    if current_key and should_recreate:
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key
    elif not current_key:
      self.client = None
      self._last_api_key = None

  def _get_client(self) -> genai.Client | None:
    """Get the current client, refreshing if API key changed."""
    self._initialize_client()
    return self.client

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
    """Resolve note mentions to their full content."""
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
    """Resolve annotation mentions to their full content."""
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
    """Resolve paper mentions to their full content."""
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
    """Resolve all mentions to their full content."""
    notes = await self._resolve_notes(db_session, paper_id, mentions.get("notes", []))
    annotations = await self._resolve_annotations(
      db_session, paper_id, mentions.get("annotations", [])
    )
    papers = await self._resolve_papers(db_session, mentions.get("papers", []))

    return {"notes": notes, "annotations": annotations, "papers": papers}

  def _build_context_header(self, paper: Paper) -> list[str]:
    """Build the initial context header with paper info."""
    parts = [
      "You are an AI assistant helping a user learn from research papers. "
      "Provide clear, educational responses.",
      f"\n## Paper: {paper.title}",
    ]
    if paper.doi:
      parts.append(f"DOI: {paper.doi}")
    return parts

  def _build_context_content(self, paper: Paper) -> str:
    """Build the paper content section of context."""
    if not paper.content_text:
      return ""

    content = cast(str, paper.content_text)
    max_length = 3000
    if len(content) > max_length:
      content = content[:max_length] + "..."
    return f"\nContent:\n{content}"

  def _build_context_references(self, references: dict[str, Any]) -> list[str]:
    """Build the references section of context."""
    parts = []

    if references.get("notes"):
      parts.append("\n## Notes:")
      for note in references["notes"][:5]:
        page_info = f" (p{note['page']})" if note.get("page") else ""
        note_content = note["content"][:500]
        if len(note["content"]) > 500:
          note_content += "..."
        parts.append(f"\nNote {note['id']}{page_info}: {note_content}")

    if references.get("annotations"):
      parts.append("\n## Annotations:")
      for ann in references["annotations"][:5]:
        page_info = f" (p{ann['page']})" if ann.get("page") else ""
        ann_content = ann["content"][:500]
        if len(ann["content"]) > 500:
          ann_content += "..."
        parts.append(f"\nAnn {ann['id']}{page_info}: {ann_content}")

    if references.get("papers"):
      parts.append("\n## Referenced Papers:")
      for ref_paper in references["papers"][:3]:
        content = ref_paper["content_text"][:1000]
        if len(ref_paper["content_text"]) > 1000:
          content += "..."
        parts.append(f"\n{ref_paper['title']}:\n{content}")

    return parts

  def _build_context_history(self, chat_history: list[ChatMessage]) -> list[str]:
    """Build the conversation history section of context."""
    if not chat_history:
      return []

    parts = ["\n## Conversation:"]
    for msg in chat_history[-5:]:
      role_label = "U" if msg.role == "user" else "A"
      msg_content = msg.content[:500]
      if len(msg.content) > 500:
        msg_content += "..."
      parts.append(f"\n{role_label}: {msg_content}")

    return parts

  def build_context(
    self,
    paper: Paper,
    references: dict[str, Any],
    chat_history: list[ChatMessage],
  ) -> str:
    """Build the full context string for the AI prompt."""
    context_parts = self._build_context_header(paper)
    context_parts.append(self._build_context_content(paper))
    context_parts.extend(self._build_context_references(references))
    context_parts.extend(self._build_context_history(chat_history))
    return "\n".join(context_parts)

  async def create_session(
    self, db_session: AsyncSession, paper_id: int, name: str = "New Session"
  ) -> ChatSession:
    """Create a new chat session for a paper."""
    chat_session = ChatSession(paper_id=paper_id, name=name)
    db_session.add(chat_session)
    await db_session.commit()
    await db_session.refresh(chat_session)
    return chat_session

  async def get_session(
    self, db_session: AsyncSession, session_id: int
  ) -> ChatSession | None:
    """Get a chat session by ID."""
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  async def get_latest_session(
    self, db_session: AsyncSession, paper_id: int
  ) -> ChatSession | None:
    """Get the most recent chat session for a paper."""
    query = (
      select(ChatSession)
      .where(ChatSession.paper_id == paper_id)
      .order_by(ChatSession.updated_at.desc())
      .limit(1)
    )
    result = await db_session.execute(query)
    return result.scalar_one_or_none()

  async def _get_or_create_session(
    self,
    db_session: AsyncSession,
    paper_id: int,
    session_id: int | None,
  ) -> tuple[ChatSession | None, str | None]:
    """Get existing session or create new one. Returns (session, error)."""
    chat_session = None
    if session_id:
      chat_session = await self.get_session(db_session, session_id)
      if chat_session and chat_session.paper_id != paper_id:
        return None, "Session does not belong to this paper"

    if not chat_session:
      chat_session = await self.get_latest_session(db_session, paper_id)

    if not chat_session:
      chat_session = await self.create_session(db_session, paper_id)

    return chat_session, None

  async def _fetch_paper(self, db_session: AsyncSession, paper_id: int) -> Paper | None:
    """Fetch a paper by ID."""
    paper_query = select(Paper).where(Paper.id == paper_id)
    paper_result = await db_session.execute(paper_query)
    return paper_result.scalar_one_or_none()

  async def _get_chat_history(
    self, db_session: AsyncSession, session_id: int
  ) -> list[ChatMessage]:
    """Get chat history for a session."""
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
    """Extract IDs from references dict."""
    if not references:
      return {"notes": [], "annotations": [], "papers": []}

    return {
      "notes": [r.get("id") for r in references.get("notes", []) if r.get("id")],
      "annotations": [
        r.get("id") for r in references.get("annotations", []) if r.get("id")
      ],
      "papers": [r.get("id") for r in references.get("papers", []) if r.get("id")],
    }

  async def _prepare_message_context(
    self,
    db_session: AsyncSession,
    paper_id: int,
    user_message: str,
    references: dict[str, Any] | None,
    chat_session: ChatSession,
  ) -> tuple[str, dict[str, Any]]:
    """Prepare full context and resolved references for AI call."""
    has_explicit_refs = references and (
      references.get("notes")
      or references.get("annotations")
      or references.get("papers")
    )

    if has_explicit_refs:
      mention_ids = self._extract_mention_ids(references)
    else:
      mention_ids = self.parse_mentions(user_message)

    resolved_references = await self.resolve_references(
      db_session, paper_id, mention_ids
    )

    paper = await self._fetch_paper(db_session, paper_id)
    if not paper:
      raise ValueError(f"Paper {paper_id} not found")

    chat_history = await self._get_chat_history(db_session, cast(int, chat_session.id))
    context = self.build_context(paper, resolved_references, chat_history)

    return context, resolved_references

  async def _save_user_message(
    self,
    db_session: AsyncSession,
    session_id: int,
    content: str,
    references: dict[str, Any],
  ) -> ChatMessage:
    """Save user message to database."""
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
    """Save assistant message to database."""
    assistant_msg = ChatMessage(
      session_id=session_id,
      role="assistant",
      content=content,
      references={},
    )
    db_session.add(assistant_msg)
    await db_session.commit()
    await db_session.refresh(assistant_msg)
    return assistant_msg

  def _call_genai_api(self, client: genai.Client, prompt: str) -> Any:
    """Call the GenAI API with grounding."""
    grounding_tool = types.Tool(google_search=types.GoogleSearch())
    config = types.GenerateContentConfig(tools=[grounding_tool])

    return client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=types.Part.from_text(text=prompt),
      config=config,
    )

  async def stream_message(
    self,
    db_session: AsyncSession,
    paper_id: int,
    user_message: str,
    references: dict[str, Any] | None = None,
    session_id: int | None = None,
  ) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a chat message response."""
    client = self._get_client()
    if not client:
      yield {
        "type": "error",
        "error": "Google API key not configured. Please set GOOGLE_API_KEY.",
      }
      return

    chat_session, session_error = await self._get_or_create_session(
      db_session, paper_id, session_id
    )
    if session_error or not chat_session:
      yield {"type": "error", "error": session_error or "Failed to get session"}
      return

    paper = await self._fetch_paper(db_session, paper_id)
    if not paper:
      yield {"type": "error", "error": f"Paper {paper_id} not found"}
      return

    try:
      context, resolved_refs = await self._prepare_message_context(
        db_session, paper_id, user_message, references, chat_session
      )
    except ValueError as e:
      yield {"type": "error", "error": str(e)}
      return

    await self._save_user_message(
      db_session, cast(int, chat_session.id), user_message, resolved_refs
    )

    full_prompt = f"{context}\n\n## User Question:\n{user_message}"

    try:
      response = self._call_genai_api(client, full_prompt)
      full_content = add_citations(response)

      chunk_size = 50
      for i in range(0, len(full_content), chunk_size):
        chunk = full_content[i : i + chunk_size]
        yield {"type": "chunk", "content": chunk}
        await asyncio.sleep(0.01)

      assistant_msg = await self._save_assistant_message(
        db_session, cast(int, chat_session.id), full_content
      )

      yield {
        "type": "done",
        "message_id": assistant_msg.id,
        "session_id": chat_session.id,
      }

    except Exception as e:
      logger.error(
        "Google API error in stream_message",
        error_type=type(e).__name__,
        error_message=str(e),
      )

      error_content = _build_error_message(e)
      await self._save_assistant_message(
        db_session, cast(int, chat_session.id), error_content
      )
      yield {"type": "error", "error": error_content}

  async def send_message(
    self,
    db_session: AsyncSession,
    paper_id: int,
    user_message: str,
    references: dict[str, Any] | None = None,
    session_id: int | None = None,
  ) -> ChatMessage | None:
    """Send a chat message and get a response (non-streaming)."""
    client = self._get_client()
    if not client:
      raise ValueError("Google API key not configured. Please set GOOGLE_API_KEY.")

    chat_session, session_error = await self._get_or_create_session(
      db_session, paper_id, session_id
    )
    if session_error or not chat_session:
      raise ValueError(session_error or "Failed to get session")

    context, resolved_refs = await self._prepare_message_context(
      db_session, paper_id, user_message, references, chat_session
    )

    await self._save_user_message(
      db_session, cast(int, chat_session.id), user_message, resolved_refs
    )

    full_prompt = f"{context}\n\n## User Question:\n{user_message}"
    max_retries = 3
    base_delay = 1.0

    for attempt in range(max_retries):
      try:
        response = self._call_genai_api(client, full_prompt)
        text_with_citations = add_citations(response)

        return await self._save_assistant_message(
          db_session, cast(int, chat_session.id), text_with_citations
        )

      except Exception as e:
        is_rate_limited = _is_rate_limit_error(e)
        logger.error(
          "Google API error in send_message",
          attempt=attempt + 1,
          max_retries=max_retries,
          error_type=type(e).__name__,
          error_message=str(e),
          is_rate_limit=is_rate_limited,
        )

        is_last_attempt = attempt >= max_retries - 1
        if is_rate_limited and not is_last_attempt:
          retry_delay = base_delay * (2**attempt)
          retry_match = re.search(r"retry in ([\d.]+)s", str(e), re.IGNORECASE)
          if retry_match:
            retry_delay = float(retry_match.group(1)) + 1

          await asyncio.sleep(retry_delay)
          continue

        error_content = _build_error_message(e)
        await self._save_assistant_message(
          db_session, cast(int, chat_session.id), error_content
        )

        if is_rate_limited:
          raise ValueError("API rate limit exceeded. Please wait and try again.") from e
        raise ValueError(f"Failed to get AI response: {str(e)[:200]}") from e

    return None


chat_service = ChatService()
