from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.paper import Paper
from app.models.paper_citation import PaperCitation
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
  return await graph_service.build_citation_graph(
    session, paper_id, bidirectional, max_hops
  )


@router.get("/papers/{paper_id}/citations-list")
async def get_citations_list(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get list of citations for a paper with full details."""
  # Verify paper exists
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  # Get citations with eager loading of cited_paper
  citations_query = (
    select(PaperCitation)
    .options(selectinload(PaperCitation.cited_paper))
    .where(PaperCitation.paper_id == paper_id)
    .order_by(PaperCitation.created_at.desc())
  )
  result = await session.execute(citations_query)
  citations = result.scalars().all()

  # Format response with cited paper details if internal
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

    # Add cited paper details if it's an internal citation
    if citation.cited_paper_id and citation.cited_paper:
      from app.schemas.paper import Paper as PaperSchema

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
  # Use Semantic Scholar API
  from sqlalchemy import select

  from app.models.paper import Paper

  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    return {"citations": []}

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
  from sqlalchemy import select

  from app.models.paper import Paper

  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    return {"references": []}

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
  return await graph_service.build_semantic_graph(session, paper_id, limit)
