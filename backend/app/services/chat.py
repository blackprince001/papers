import asyncio
import re
from typing import Any, Dict, List, Optional

from google import genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.annotation import Annotation
from app.models.chat import ChatMessage, ChatSession
from app.models.paper import Paper
from app.utils.citation_extractor import add_citations


class ChatService:
  def __init__(self):
    self.client: Optional[genai.Client] = None
    self._last_api_key: Optional[str] = None
    self._initialize_client()

  def _initialize_client(self):
    """Initialize or refresh the Google API client with current settings."""
    current_key = settings.GOOGLE_API_KEY
    # Only recreate client if API key changed or client doesn't exist
    if current_key and (not self.client or self._last_api_key != current_key):
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key
    elif not current_key:
      self.client = None
      self._last_api_key = None

  def _get_client(self) -> Optional[genai.Client]:
    """Get the current client, refreshing if API key changed."""
    self._initialize_client()
    return self.client

  def parse_mentions(self, text: str) -> Dict[str, List[int]]:
    mentions = {"notes": [], "annotations": [], "papers": []}
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
          mentions[mention_type].append(int(mention_id))

    return mentions

  async def resolve_references(
    self, session: AsyncSession, paper_id: int, mentions: Dict[str, List[int]]
  ) -> Dict[str, Any]:
    resolved = {
      "notes": [],
      "annotations": [],
      "papers": [],
    }
    if mentions["notes"]:
      query = (
        select(Annotation)
        .where(Annotation.id.in_(mentions["notes"]))
        .where(Annotation.paper_id == paper_id)
        .where(Annotation.type == "note")
      )
      result = await session.execute(query)
      notes = result.scalars().all()
      for note in notes:
        page_info = ""
        if note.note_scope == "page" and note.coordinate_data:
          page = note.coordinate_data.get("page")
          if page:
            page_info = f" (Page {page})"
        resolved["notes"].append(
          {
            "id": note.id,
            "content": note.content,
            "page": note.coordinate_data.get("page") if note.coordinate_data else None,
            "scope": note.note_scope,
            "display": f"Note {note.id}{page_info}: {note.content[:100]}...",
          }
        )

    if mentions["annotations"]:
      query = (
        select(Annotation)
        .where(Annotation.id.in_(mentions["annotations"]))
        .where(Annotation.paper_id == paper_id)
        .where(Annotation.type == "annotation")
      )
      result = await session.execute(query)
      annotations = result.scalars().all()
      for ann in annotations:
        page_info = ""
        if ann.coordinate_data:
          page = ann.coordinate_data.get("page")
          if page:
            page_info = f" (Page {page})"
        resolved["annotations"].append(
          {
            "id": ann.id,
            "content": ann.content,
            "highlighted_text": ann.highlighted_text,
            "page": ann.coordinate_data.get("page") if ann.coordinate_data else None,
            "display": f"Annotation {ann.id}{page_info}: {ann.highlighted_text or ann.content[:100]}...",
          }
        )

    if mentions["papers"]:
      query = select(Paper).where(Paper.id.in_(mentions["papers"]))
      result = await session.execute(query)
      papers = result.scalars().all()
      for paper in papers:
        resolved["papers"].append(
          {
            "id": paper.id,
            "title": paper.title,
            "content_text": paper.content_text or "",
            "doi": paper.doi,
            "display": f"Paper: {paper.title}",
          }
        )

    return resolved

  def build_context(
    self, paper: Paper, references: Dict[str, Any], chat_history: List[ChatMessage]
  ) -> str:
    context_parts = []
    context_parts.append(
      "You are an AI assistant helping a user learn from research papers. "
      "Provide clear, educational responses."
    )

    context_parts.append(f"\n## Paper: {paper.title}")
    if paper.doi:
      context_parts.append(f"DOI: {paper.doi}")

    if paper.content_text:
      content = (
        paper.content_text[:3000] + "..."
        if len(paper.content_text) > 3000  # ty:ignore[invalid-argument-type]
        else paper.content_text
      )
      context_parts.append(f"\nContent:\n{content}")

    if references["notes"]:
      context_parts.append("\n## Notes:")
      for note in references["notes"][:5]:
        page_info = f" (p{note['page']})" if note.get("page") else ""
        note_content = (
          note["content"][:500] + "..."
          if len(note["content"]) > 500
          else note["content"]
        )
        context_parts.append(f"\nNote {note['id']}{page_info}: {note_content}")

    if references["annotations"]:
      context_parts.append("\n## Annotations:")
      for ann in references["annotations"][:5]:
        page_info = f" (p{ann['page']})" if ann.get("page") else ""
        ann_content = (
          ann["content"][:500] + "..." if len(ann["content"]) > 500 else ann["content"]
        )
        context_parts.append(f"\nAnn {ann['id']}{page_info}: {ann_content}")

    if references["papers"]:
      context_parts.append("\n## Referenced Papers:")
      for ref_paper in references["papers"][:3]:
        content = (
          ref_paper["content_text"][:1000] + "..."
          if len(ref_paper["content_text"]) > 1000
          else ref_paper["content_text"]
        )
        context_parts.append(f"\n{ref_paper['title']}:\n{content}")

    if chat_history:
      context_parts.append("\n## Conversation:")
      for msg in chat_history[-5:]:
        role_label = "U" if msg.role == "user" else "A"
        msg_content = (
          msg.content[:500] + "..." if len(msg.content) > 500 else msg.content
        )
        context_parts.append(f"\n{role_label}: {msg_content}")

    return "\n".join(context_parts)

  async def create_session(
    self, session: AsyncSession, paper_id: int, name: str = "New Session"
  ) -> ChatSession:
    chat_session = ChatSession(paper_id=paper_id, name=name)
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return chat_session

  async def get_session(
    self, session: AsyncSession, session_id: int
  ) -> Optional[ChatSession]:
    query = select(ChatSession).where(ChatSession.id == session_id)
    result = await session.execute(query)
    return result.scalar_one_or_none()

  async def get_latest_session(
    self, session: AsyncSession, paper_id: int
  ) -> Optional[ChatSession]:
    query = (
      select(ChatSession)
      .where(ChatSession.paper_id == paper_id)
      .order_by(ChatSession.updated_at.desc())
      .limit(1)
    )
    result = await session.execute(query)
    return result.scalar_one_or_none()

  async def stream_message(
    self,
    session: AsyncSession,
    paper_id: int,
    user_message: str,
    references: Optional[Dict[str, Any]] = None,
    session_id: Optional[int] = None,
  ):
    client = self._get_client()
    if not client:
      yield {
        "type": "error",
        "error": "Google API key not configured. Please set GOOGLE_API_KEY environment variable.",
      }
      return

    chat_session = None
    if session_id:
      chat_session = await self.get_session(session, session_id)
      if chat_session and chat_session.paper_id != paper_id:
        yield {"type": "error", "error": "Session does not belong to this paper"}
        return

    if not chat_session:
      # If no specific session requested, try to use latest or create new
      chat_session = await self.get_latest_session(session, paper_id)

    if not chat_session:
      chat_session = await self.create_session(session, paper_id)

    paper_query = select(Paper).where(Paper.id == paper_id)
    paper_result = await session.execute(paper_query)
    paper = paper_result.scalar_one_or_none()

    if not paper:
      yield {"type": "error", "error": f"Paper {paper_id} not found"}
      return

    if references and (
      references.get("notes")
      or references.get("annotations")
      or references.get("papers")
    ):
      mentions = {
        "notes": [r.get("id") for r in references.get("notes", []) if r.get("id")],
        "annotations": [
          r.get("id") for r in references.get("annotations", []) if r.get("id")
        ],
        "papers": [r.get("id") for r in references.get("papers", []) if r.get("id")],
      }
      resolved_references = await self.resolve_references(session, paper_id, mentions)
    else:
      mentions = self.parse_mentions(user_message)
      resolved_references = await self.resolve_references(session, paper_id, mentions)

    messages_query = (
      select(ChatMessage)
      .where(ChatMessage.session_id == chat_session.id)
      .order_by(ChatMessage.created_at)
    )
    messages_result = await session.execute(messages_query)
    chat_history = list(messages_result.scalars().all())

    context = self.build_context(paper, resolved_references, chat_history)

    user_msg = ChatMessage(
      session_id=chat_session.id,
      role="user",
      content=user_message,
      references=resolved_references,
    )
    session.add(user_msg)
    await session.commit()

    # Update session updated_at
    # chat_session.updated_at = datetime.now(...) # Handled by onupdate= in model

    full_prompt = f"{context}\n\n## User Question:\n{user_message}"

    try:
      from google.genai import types

      # Add Google Search grounding tool
      grounding_tool = types.Tool(google_search=types.GoogleSearch())
      config = types.GenerateContentConfig(tools=[grounding_tool])

      # Use generate_content instead of generate_content_stream to get grounding metadata
      # We'll manually stream the response by chunking it
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=full_prompt),
        config=config,
      )

      # Extract text with citations
      text_with_citations = add_citations(response)
      
      # Stream the text in chunks to simulate streaming
      # Split into chunks of approximately 50 characters for smooth streaming
      chunk_size = 50
      full_content = text_with_citations
      
      for i in range(0, len(full_content), chunk_size):
        chunk = full_content[i : i + chunk_size]
        yield {"type": "chunk", "content": chunk}
        # Small delay to simulate streaming
        await asyncio.sleep(0.01)

      assistant_msg = ChatMessage(
        session_id=chat_session.id,
        role="assistant",
        content=full_content,
        references={},
      )
      session.add(assistant_msg)
      await session.commit()
      await session.refresh(assistant_msg)

      yield {
        "type": "done",
        "message_id": assistant_msg.id,
        "session_id": chat_session.id,
      }

    except Exception as e:
      error_str = str(e)
      error_type = type(e).__name__
      # More specific rate limit detection
      is_rate_limit = (
        "429" in error_str
        or "RESOURCE_EXHAUSTED" in error_str
        or (error_type == "ResourceExhausted" or "ResourceExhausted" in error_str)
        or ("quota" in error_str.lower() and ("exceeded" in error_str.lower() or "limit" in error_str.lower()))
      )
      
      # Log the actual error for debugging
      import logging
      logger = logging.getLogger(__name__)
      logger.error(f"Google API error in stream_message: {error_type}: {error_str}")
      
      # Log which API key is being used (first 10 chars for security)
      api_key_preview = settings.GOOGLE_API_KEY[:10] + "..." if settings.GOOGLE_API_KEY else "None"
      logger.info(f"Using API key: {api_key_preview}")

      if is_rate_limit:
        error_content = (
          "I apologize, but I've hit the API rate limit/quota. "
          "This means your Google API quota has been exceeded. "
          "Please check your plan and billing details at https://ai.dev/rate-limit. "
          "If you've changed your API key, please restart the backend server to ensure the new key is loaded."
        )
      else:
        error_content = f"I apologize, but I encountered an error: {str(e)[:200]}"

      error_msg = ChatMessage(
        session_id=chat_session.id,
        role="assistant",
        content=error_content,
        references={},
      )
      session.add(error_msg)
      await session.commit()

      yield {"type": "error", "error": error_content}

  async def send_message(
    self,
    session: AsyncSession,
    paper_id: int,
    user_message: str,
    references: Optional[Dict[str, Any]] = None,
    session_id: Optional[int] = None,
  ) -> ChatMessage | None:
    client = self._get_client()
    if not client:
      raise ValueError(
        "Google API key not configured. Please set GOOGLE_API_KEY environment variable."
      )

    chat_session = None
    if session_id:
      chat_session = await self.get_session(session, session_id)
      if chat_session and chat_session.paper_id != paper_id:
        raise ValueError("Session does not belong to this paper")

    if not chat_session:
      chat_session = await self.get_latest_session(session, paper_id)

    if not chat_session:
      chat_session = await self.create_session(session, paper_id)

    paper_query = select(Paper).where(Paper.id == paper_id)
    paper_result = await session.execute(paper_query)
    paper = paper_result.scalar_one_or_none()
    if not paper:
      raise ValueError(f"Paper {paper_id} not found")

    if references and (
      references.get("notes")
      or references.get("annotations")
      or references.get("papers")
    ):
      mentions = {
        "notes": [r.get("id") for r in references.get("notes", []) if r.get("id")],
        "annotations": [
          r.get("id") for r in references.get("annotations", []) if r.get("id")
        ],
        "papers": [r.get("id") for r in references.get("papers", []) if r.get("id")],
      }
      resolved_references = await self.resolve_references(session, paper_id, mentions)
    else:
      mentions = self.parse_mentions(user_message)
      resolved_references = await self.resolve_references(session, paper_id, mentions)

    messages_query = (
      select(ChatMessage)
      .where(ChatMessage.session_id == chat_session.id)
      .order_by(ChatMessage.created_at)
    )
    messages_result = await session.execute(messages_query)
    chat_history = list(messages_result.scalars().all())

    context = self.build_context(paper, resolved_references, chat_history)

    user_msg = ChatMessage(
      session_id=chat_session.id,
      role="user",
      content=user_message,
      references=resolved_references,
    )
    session.add(user_msg)
    await session.commit()

    full_prompt = f"{context}\n\n## User Question:\n{user_message}"

    max_retries = 3
    base_delay = 1.0

    for attempt in range(max_retries):
      try:
        from google.genai import types

        # Add Google Search grounding tool
        grounding_tool = types.Tool(google_search=types.GoogleSearch())
        config = types.GenerateContentConfig(tools=[grounding_tool])

        response = client.models.generate_content(
          model=settings.GENAI_MODEL,
          contents=types.Part.from_text(text=full_prompt),
          config=config,
        )

        # Extract text with citations
        text_with_citations = add_citations(response)

        assistant_msg = ChatMessage(
          session_id=chat_session.id,
          role="assistant",
          content=text_with_citations,
          references={},
        )
        session.add(assistant_msg)
        await session.commit()
        await session.refresh(assistant_msg)

        return assistant_msg

      except Exception as e:
        error_str = str(e)
        error_type = type(e).__name__
        # More specific rate limit detection
        is_rate_limit = (
          "429" in error_str
          or "RESOURCE_EXHAUSTED" in error_str
          or (error_type == "ResourceExhausted" or "ResourceExhausted" in error_str)
          or ("quota" in error_str.lower() and ("exceeded" in error_str.lower() or "limit" in error_str.lower()))
        )
        
        # Log the actual error for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Google API error in send_message (attempt {attempt + 1}/{max_retries}): {error_type}: {error_str}")
        
        # Log which API key is being used (first 10 chars for security)
        api_key_preview = settings.GOOGLE_API_KEY[:10] + "..." if settings.GOOGLE_API_KEY else "None"
        logger.info(f"Using API key: {api_key_preview}")

        if is_rate_limit and attempt < max_retries - 1:
          retry_delay = base_delay * (2**attempt)
          retry_match = re.search(r"retry in ([\d.]+)s", error_str, re.IGNORECASE)
          if retry_match:
            retry_delay = float(retry_match.group(1)) + 1

          await asyncio.sleep(retry_delay)
          continue
        else:
          if is_rate_limit:
            error_content = (
              "I apologize, but I've hit the API rate limit/quota. "
              "This means your Google API quota has been exceeded. "
              "Please check your plan and billing details at https://ai.dev/rate-limit. "
              "If you've changed your API key, please restart the backend server to ensure the new key is loaded."
            )
          else:
            error_content = f"I apologize, but I encountered an error: {str(e)[:200]}"

          error_msg = ChatMessage(
            session_id=chat_session.id,
            role="assistant",
            content=error_content,
            references={},
          )
          session.add(error_msg)
          await session.commit()
          await session.refresh(error_msg)

          if is_rate_limit:
            raise ValueError(
              "API rate limit exceeded. Please wait a moment and try again. "
              "If this persists, check your Google API quota at https://ai.dev/usage"
            ) from e
          else:
            raise ValueError(f"Failed to get AI response: {str(e)[:200]}") from e


chat_service = ChatService()
