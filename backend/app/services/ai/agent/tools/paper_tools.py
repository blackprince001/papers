"""Function tools for paper content retrieval.

These tools give agents access to the user's library: paper text,
metadata, annotations, notes, and citation data.  They use the
per-request ``BYOContext`` for user identity and permission scoping.
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
from app.services.ai.agent.paper_meta import authors_str, publication_year
from app.services.ai.agent.tools import rollback_quietly, with_timeout

logger = get_logger(__name__)


@function_tool
@with_timeout()
async def get_paper_content(paper_ids: list[int]) -> str:
  """Retrieve the full text content of one or more papers.

  Use this when you need to read a paper's body text to answer
  detailed questions about methodology, results, or conclusions.
  Pass multiple IDs to batch-read several papers at once.

  Args:
      paper_ids: One or more paper IDs in the user's library.

  Returns:
      The paper(s) full text content, or an error message if a
      paper is not found or not accessible.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")
  user_id = ctx.user_id

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.paper import Paper

    result = await db.execute(
      select(Paper)
      .where(Paper.id.in_(paper_ids))
      .options(selectinload(Paper.tags), selectinload(Paper.groups))
    )
    papers = {p.id: p for p in result.scalars().all()}

    from app.services.access import apply_visible_papers_filter

    visible_ids: set[int] | None = None
    if user_id is not None:
      visible_query = apply_visible_papers_filter(select(Paper.id), user_id)
      visible_ids = {r[0] for r in (await db.execute(visible_query)).all()}

    parts: list[str] = []
    for pid in paper_ids:
      paper = papers.get(pid)
      if not paper:
        parts.append(f"## Paper {pid}\n\n(not found)")
        continue
      if visible_ids is not None and paper.id not in visible_ids:
        parts.append(f"## {paper.title}\n\n(not accessible)")
        continue

      text = paper.content_text
      if not text:
        parts.append(f"## {paper.title}\n\n(no extracted text content)")
        continue

      max_chars = 50000
      if len(text) > max_chars:
        text = text[:max_chars]
      parts.append(f"# {paper.title}\n\n{text}")

    return "\n\n---\n\n".join(parts)

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in get_paper_content", paper_ids=paper_ids, error=str(e))
    return f"Error retrieving paper content: {str(e)[:200]}"


@function_tool
@with_timeout()
async def get_paper_metadata(paper_id: int) -> str:
  """Retrieve metadata about a paper by its ID.

  Returns title, authors, DOI, arXiv ID, publication year, source,
  and page count.  Useful for quickly identifying papers or building
  citations.

  Args:
      paper_id: The unique ID of the paper in the user's library.

  Returns:
      A formatted string with the paper's metadata.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.paper import Paper

    # Eager-load tags: a lazy relationship access on an async session raises
    # "greenlet_spawn has not been called".
    result = await db.execute(
      select(Paper).where(Paper.id == paper_id).options(selectinload(Paper.tags))
    )
    paper = result.scalar_one_or_none()

    if not paper:
      return f"Paper {paper_id} not found."

    lines = [
      f"Title: {paper.title or 'N/A'}",
      f"Authors: {authors_str(paper) or 'N/A'}",
      f"DOI: {paper.doi or 'N/A'}",
      f"Year: {publication_year(paper) or 'N/A'}",
      f"Pages: {paper.pages or 'N/A'}",
      f"Tags: {', '.join(t.name for t in paper.tags) if paper.tags else 'None'}",
    ]
    return "\n".join(lines)

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in get_paper_metadata", paper_id=paper_id, error=str(e))
    return f"Error retrieving paper metadata: {str(e)[:200]}"


@function_tool
@with_timeout()
async def search_papers(query: str, limit: int = 10) -> str:
  """Search the user's library for papers matching a text query.

  Performs a full-text search across paper titles, abstracts, and
  content.  Returns a list of matching papers with their IDs, titles,
  and authors.

  Args:
      query: The search query string.
      limit: Maximum number of results to return (default 10, max 50).

  Returns:
      A formatted list of matching papers.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import or_, select

    from app.models.paper import Paper

    limit = min(max(1, limit), 50)

    search_filter = or_(
      Paper.title.ilike(f"%{query}%"),
      Paper.content_text.ilike(f"%{query}%"),
    )

    result = await db.execute(
      select(Paper)
      .where(search_filter)
      .limit(limit)
      .options(selectinload(Paper.tags), selectinload(Paper.groups))
    )
    papers = result.scalars().all()

    if not papers:
      return f"No papers found matching '{query}'."

    lines = [f"Found {len(papers)} paper(s) matching '{query}':\n"]
    for i, p in enumerate(papers, 1):
      lines.append(f"{i}. [{p.id}] {p.title}")
      p_authors = authors_str(p)
      if p_authors:
        lines.append(f"   Authors: {p_authors[:100]}")
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in search_papers", query=query, error=str(e))
    return f"Error searching papers: {str(e)[:200]}"


@function_tool
@with_timeout()
async def get_annotations(
  paper_id: int, annotation_ids: list[int] | None = None
) -> str:
  """Retrieve user annotations or highlights for a paper.

  Annotations are user-created highlights with comments on specific
  passages.  If annotation_ids is provided, returns only those
  specific annotations.  Otherwise returns all annotations for the
  paper.

  Args:
      paper_id: The paper to get annotations for.
      annotation_ids: Optional list of specific annotation IDs to retrieve.

  Returns:
      A formatted string with annotation content, page numbers, and
      highlighted text.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.annotation import Annotation

    query = (
      select(Annotation)
      .where(
        Annotation.paper_id == paper_id,
        Annotation.type == "annotation",
      )
      .options(selectinload(Annotation.paper))
    )
    if annotation_ids:
      query = query.where(Annotation.id.in_(annotation_ids))

    result = await db.execute(query)
    annotations = result.scalars().all()

    if not annotations:
      return f"No annotations found for paper {paper_id}."

    lines = [f"Found {len(annotations)} annotation(s):\n"]
    for ann in annotations:
      page = ann.coordinate_data.get("page") if ann.coordinate_data else None
      page_str = f" (p{page})" if page else ""
      highlighted = ann.highlighted_text or ""
      comment = ann.content or ""
      lines.append(f"--- Annotation {ann.id}{page_str} ---")
      if highlighted:
        lines.append(f'Highlighted: "{highlighted[:300]}"')
      if comment:
        lines.append(f"Comment: {comment[:300]}")
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in get_annotations", paper_id=paper_id, error=str(e))
    return f"Error retrieving annotations: {str(e)[:200]}"


@function_tool
@with_timeout()
async def get_notes(paper_id: int, note_ids: list[int] | None = None) -> str:
  """Retrieve user notes for a paper.

  Notes are user-written text attached to specific pages or general
  to the paper.  If note_ids is provided, returns only those
  specific notes.

  Args:
      paper_id: The paper to get notes for.
      note_ids: Optional list of specific note IDs to retrieve.

  Returns:
      A formatted string with note content.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.annotation import Annotation

    query = (
      select(Annotation)
      .where(
        Annotation.paper_id == paper_id,
        Annotation.type == "note",
      )
      .options(selectinload(Annotation.paper))
    )
    if note_ids:
      query = query.where(Annotation.id.in_(note_ids))

    result = await db.execute(query)
    notes = result.scalars().all()

    if not notes:
      return f"No notes found for paper {paper_id}."

    lines = [f"Found {len(notes)} note(s):\n"]
    for note in notes:
      page = note.coordinate_data.get("page") if note.coordinate_data else None
      page_str = f" (p{page})" if page else ""
      content = note.content or ""
      lines.append(f"--- Note {note.id}{page_str} ---")
      lines.append(content[:500])
      lines.append("")

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in get_notes", paper_id=paper_id, error=str(e))
    return f"Error retrieving notes: {str(e)[:200]}"


@function_tool
@with_timeout()
async def get_citations(paper_id: int) -> str:
  """Retrieve citation information for a paper.

  Returns the paper's references (papers it cites) and its
  citations (papers that cite it) if available.

  Args:
      paper_id: The paper to get citation info for.

  Returns:
      A formatted string with citation information.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from sqlalchemy import select

    from app.models.paper_citation import PaperCitation

    result = await db.execute(
      select(PaperCitation).where(PaperCitation.paper_id == paper_id)
    )
    citations = result.scalars().all()

    if not citations:
      return f"No citation data available for paper {paper_id}."

    lines = [f"Citation info for paper {paper_id}:\n"]
    for c in citations:
      ctx = c.citation_context or "N/A"
      lines.append(f"- [{c.id}] {ctx}")
      if c.external_paper_title:
        lines.append(f"  Title: {c.external_paper_title}")
      if c.external_paper_doi:
        lines.append(f"  DOI: {c.external_paper_doi}")
      if c.cited_paper_id is not None:
        lines.append(f"  (matched paper in library: [ref:paper/{c.cited_paper_id}])")

    return "\n".join(lines).strip()

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in get_citations", paper_id=paper_id, error=str(e))
    return f"Error retrieving citations: {str(e)[:200]}"


@function_tool
@with_timeout()
async def get_paper_layout(paper_id: int) -> str:
  """Retrieve the paper's document structure: section headings and figures.

  Returns an outline of section headings with page numbers and the pages
  on which figures appear. Use this to locate sections, figures, or tables,
  or to answer questions about the paper's structure and layout.

  Args:
      paper_id: The unique ID of the paper in the user's library.

  Returns:
      A formatted outline of headings and figure locations.
  """
  ctx = get_byo_context()
  db = ctx.extra.get("db_session")

  if not db:
    return "Error: No database session available."

  try:
    from collections import Counter

    from sqlalchemy import select

    from app.models.paper import Paper

    result = await db.execute(
      select(Paper)
      .where(Paper.id == paper_id)
      .options(selectinload(Paper.tags), selectinload(Paper.groups))
    )
    paper = result.scalar_one_or_none()

    if not paper:
      return f"Paper {paper_id} not found."

    blocks = paper.layout_blocks or []
    if not blocks:
      return (
        f"Paper '{paper.title}' has no extracted layout. Use get_paper_content "
        "to read the full text instead."
      )

    headings: list[str] = []
    figure_pages: list[int] = []
    for b in blocks:
      if not isinstance(b, dict):
        continue
      btype = b.get("type")
      page = (b.get("metadata", {}) or {}).get("page", {}) or {}
      page_no = page.get("number")
      if btype == "heading":
        snippet = (b.get("content") or "").strip().replace("\n", " ")[:120]
        if snippet:
          headings.append(f"(p{page_no}) {snippet}")
      elif btype == "figure" and page_no is not None:
        figure_pages.append(page_no)

    lines = [f"Document structure for '{paper.title}':"]
    if headings:
      lines.append("\nHeadings:")
      lines.extend(f"- {h}" for h in headings[:80])
    if figure_pages:
      counts = Counter(figure_pages)
      pages_str = ", ".join(
        f"p{p}×{c}" if c > 1 else f"p{p}" for p, c in sorted(counts.items())
      )
      lines.append(f"\nFigures detected: {len(figure_pages)} (pages: {pages_str})")
    if not headings and not figure_pages:
      return (
        f"Paper '{paper.title}' has layout data but no headings or figures "
        "were detected."
      )
    return "\n".join(lines)

  except Exception as e:
    await rollback_quietly(db)
    logger.error("Error in get_paper_layout", paper_id=paper_id, error=str(e))
    return f"Error retrieving paper layout: {str(e)[:200]}"
