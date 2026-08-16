"""RAG (Retrieval-Augmented Generation) function tool.

Provides ``semantic_search`` — a tool that lets agents retrieve
relevant paper passages using vector embeddings and pgvector
cosine similarity.
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
from app.services.deep_research.evidence import collect_context_evidence
from app.services.embeddings import embedding_service

logger = get_logger(__name__)


@function_tool
@with_timeout()
async def semantic_search(query: str, limit: int = 5) -> str:
  """Search papers using semantic similarity.

  Converts the query into a vector embedding and finds the most
  semantically similar papers in the user's library.  Use this for
  finding papers by concept, topic, or meaning rather than exact
  keyword matches.

  Args:
      query: The search query (natural language).
      limit: Maximum number of results to return (default 5, max 20).

  Returns:
      A formatted list of semantically similar papers with relevance
      scores and content excerpts.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")
  user_id = ctx.user_id
  is_admin = ctx.is_admin

  if not db:
    return "Error: No database session available."

  try:
    limit = min(max(1, limit), 20)

    embedding = await embedding_service.generate_query_embedding(query)
    if not embedding:
      return "Error: Could not generate embedding for the query."

    from sqlalchemy import select

    from app.models.paper import Paper
    from app.services.access import apply_agent_paper_visibility_filter

    distance = Paper.embedding.cosine_distance(embedding)
    sql = (
      select(
        Paper.id,
        Paper.title,
        Paper.metadata_json,
        (1 - distance).label("similarity"),
      )
      .where(Paper.embedding.is_not(None))
      .order_by(distance)
      .limit(limit)
    )
    sql = apply_agent_paper_visibility_filter(sql, user_id, is_admin=is_admin)

    result = await db.execute(sql)
    rows = result.fetchall()

    if not rows:
      return "No semantically similar papers found."

    collect_context_evidence(
      ctx.extra,
      [
        {"source": "library", "external_id": str(row.id), "title": row.title or "Untitled"}
        for row in rows
      ],
    )
    lines = [f"Top {len(rows)} semantically similar paper(s):\n"]
    for i, row in enumerate(rows, 1):
      score = float(row.similarity) if row.similarity is not None else 0.0
      lines.append(f"{i}. [{row.id}] {row.title} (similarity: {score:.3f})")
      meta = row.metadata_json if isinstance(row.metadata_json, dict) else {}
      row_authors = meta.get("authors")
      if row_authors:
        if isinstance(row_authors, (list, tuple)):
          row_authors = ", ".join(str(a) for a in row_authors if a)
        lines.append(f"   Authors: {str(row_authors)[:100]}")

      paper = await db.get(Paper, row.id)
      if paper and paper.content_text:
        excerpt = paper.content_text[:500].replace("\n", " ")
        lines.append(f"   Excerpt: {excerpt}...")

      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in semantic_search", query=query, error=str(e))
    return f"Error performing semantic search: {str(e)[:200]}"
