"""Relationships API endpoints."""

from typing import cast

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud import get_paper_or_404
from app.dependencies import get_db
from app.models.paper_citation import PaperCitation
from app.schemas.paper import Paper as PaperSchema
from app.services.graph_service import graph_service
from app.services.semantic_scholar import semantic_scholar_service

router = APIRouter()


@router.get("/papers/{paper_id}/citation-graph")
async def get_citation_graph(
  paper_id: int,
  bidirectional: bool = Query(True, description="Include papers that cite this paper"),
  max_hops: int = Query(1, ge=1, le=2, description="Maximum number of hops (1 or 2)"),
  session: AsyncSession = Depends(get_db),
):
  """Get citation graph for a paper with bidirectional connections."""
  await get_paper_or_404(session, paper_id)  # Validate paper exists
  return await graph_service.build_citation_graph(
    session, paper_id, bidirectional, max_hops
  )


@router.get("/papers/{paper_id}/citations-list")
async def get_citations_list(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get list of citations for a paper with full details."""
  await get_paper_or_404(session, paper_id)  # Validate paper exists

  citations_query = (
    select(PaperCitation)
    .options(selectinload(PaperCitation.cited_paper))
    .where(PaperCitation.paper_id == paper_id)
    .order_by(PaperCitation.created_at.desc())
  )
  result = await session.execute(citations_query)
  citations = result.scalars().all()

  citations_data = []
  for citation in citations:
    citation_dict = {
      "id": citation.id,
      "paper_id": citation.paper_id,
      "cited_paper_id": citation.cited_paper_id,
      "citation_context": citation.citation_context,
      "external_paper_title": citation.external_paper_title,
      "external_paper_doi": citation.external_paper_doi,
      "created_at": citation.created_at.isoformat() if citation.created_at else None,
    }

    if citation.cited_paper_id and citation.cited_paper:
      citation_dict["cited_paper"] = PaperSchema.model_validate(
        citation.cited_paper
      ).model_dump()

    citations_data.append(citation_dict)

  return {"citations": citations_data}


@router.get("/papers/{paper_id}/citations")
async def get_citations(
  paper_id: int,
  limit: int = Query(10, ge=1, le=50),
  session: AsyncSession = Depends(get_db),
):
  """Get papers that cite this paper."""
  paper = await get_paper_or_404(session, paper_id)

  identifier = semantic_scholar_service._get_identifier(
    doi=cast(str, paper.doi), arxiv=None
  )
  if not identifier and paper.doi and paper.doi.startswith("arxiv:"):
    identifier = semantic_scholar_service._get_identifier(
      doi=None, arxiv=paper.doi.replace("arxiv:", "")
    )

  if identifier:
    citations = await semantic_scholar_service.get_citations(identifier, limit=limit)
    return {"citations": citations}

  return {"citations": []}


@router.get("/papers/{paper_id}/cited-by")
async def get_cited_by(
  paper_id: int,
  limit: int = Query(10, ge=1, le=50),
  session: AsyncSession = Depends(get_db),
):
  """Get papers cited by this paper."""
  paper = await get_paper_or_404(session, paper_id)

  identifier = semantic_scholar_service._get_identifier(
    doi=cast(str, paper.doi), arxiv=None
  )
  if not identifier and paper.doi and paper.doi.startswith("arxiv:"):
    identifier = semantic_scholar_service._get_identifier(
      doi=None, arxiv=paper.doi.replace("arxiv:", "")
    )

  if identifier:
    references = await semantic_scholar_service.get_references(identifier, limit=limit)
    return {"references": references}

  return {"references": []}


@router.get("/papers/timeline")
async def get_timeline(session: AsyncSession = Depends(get_db)):
  """Get timeline view of papers."""
  return await graph_service.get_timeline_data(session)


@router.get("/papers/{paper_id}/semantic-graph")
async def get_semantic_graph(
  paper_id: int,
  limit: int = Query(10, ge=1, le=50),
  session: AsyncSession = Depends(get_db),
):
  """Get semantic similarity graph."""
  await get_paper_or_404(session, paper_id)  # Validate paper exists
  return await graph_service.build_semantic_graph(session, paper_id, limit)
