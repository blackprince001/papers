"""Function tool for chat history retrieval.

Lets agents access the conversation history for multi-turn coherence.
"""

from __future__ import annotations

# OpenAI Agents SDK — optional dependency
try:
  from agents import function_tool
except ImportError:
  def function_tool(f):
    return f  # type: ignore[assignment]

from app.core.logger import get_logger
from app.services.ai.agent.context import get_byo_context
from app.services.ai.agent.tools import rollback_quietly, with_timeout

logger = get_logger(__name__)


@function_tool
@with_timeout()
async def get_chat_history(session_id: int = 0, limit: int = 10) -> str:
  """Retrieve recent messages from the current chat session.

  Use this to review what has been discussed so far in the
  conversation, especially for follow-up questions or when the
  user refers to previous responses.

  Args:
      session_id: The chat session ID. Leave as 0 to use the active
          session (it is supplied automatically from request context).
      limit: Number of recent messages to return (default 10, max 50).

  Returns:
      A formatted transcript of recent messages in the conversation.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  # The active session is injected into context by the chat service, so the
  # model never has to know (or guess) the numeric session id.
  if not session_id:
    session_id = ctx.extra.get("session_id") or 0
  if not session_id:
    return "Error: No active chat session to read history from."

  if not db:
    return "Error: No database session available."

  try:
    limit = min(max(1, limit), 50)

    from sqlalchemy import select

    from app.models.chat import ChatMessage

    result = await db.execute(
      select(ChatMessage)
      .where(ChatMessage.session_id == session_id)
      .order_by(ChatMessage.created_at.desc())
      .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))

    if not messages:
      return f"No messages found for session {session_id}."

    lines = [
      f"Chat history for session {session_id} (last {len(messages)} messages):\n"
    ]
    for msg in messages:
      role = "User" if msg.role == "user" else "Assistant"
      content = msg.content[:500]
      if len(msg.content) > 500:
        content += "..."
      timestamp = (
        msg.created_at.strftime("%H:%M:%S")
        if hasattr(msg, "created_at") and msg.created_at
        else ""
      )
      lines.append(f"[{timestamp}] {role}: {content}")
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error(
      "Error in get_chat_history",
      session_id=session_id,
      error=str(e),
    )
    return f"Error retrieving chat history: {str(e)[:200]}"


@function_tool
@with_timeout()
async def get_chat_sessions(paper_id: int) -> str:
  """List all chat sessions for a given paper.

  Returns the session IDs and names so you can reference past
  conversations about this paper.

  Args:
      paper_id: The paper to list sessions for.

  Returns:
      A formatted list of chat sessions.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.chat import ChatSession

    result = await db.execute(
      select(ChatSession)
      .where(ChatSession.paper_id == paper_id)
      .order_by(ChatSession.updated_at.desc())
      .options(selectinload(ChatSession.messages))
    )
    sessions = result.scalars().all()

    if not sessions:
      return f"No chat sessions found for paper {paper_id}."

    lines = [f"Chat sessions for paper {paper_id}:\n"]
    for s in sessions:
      msg_count = len(s.messages) if s.messages else 0
      lines.append(f'  Session {s.id}: "{s.name}" ({msg_count} messages)')

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error(
      "Error in get_chat_sessions",
      paper_id=paper_id,
      error=str(e),
    )
    return f"Error listing chat sessions: {str(e)[:200]}"
