from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.paper import Paper
from app.schemas.export import CitationExportRequest, ExportRequest
from app.services.export_service import export_service
from app.services.references import reference_formatter

router = APIRouter()


@router.post("/papers/export")
async def export_papers(
  request: ExportRequest, session: AsyncSession = Depends(get_db)
):
  """Export papers in specified format."""
  if not request.paper_ids:
    raise HTTPException(status_code=400, detail="No paper IDs provided")

  query = (
    select(Paper)
    .options(
      selectinload(Paper.tags),
      selectinload(Paper.groups),
      selectinload(Paper.annotations),
    )
    .where(Paper.id.in_(request.paper_ids))
  )
  result = await session.execute(query)
  papers = list(result.scalars().all())

  if request.format == "csv":
    content = export_service.export_csv(papers)
    return Response(
      content=content,
      media_type="text/csv",
      headers={"Content-Disposition": 'attachment; filename="papers.csv"'},
    )
  elif request.format == "json":
    content = export_service.export_json(papers, request.include_annotations)
    return Response(
      content=content,
      media_type="application/json",
      headers={"Content-Disposition": 'attachment; filename="papers.json"'},
    )
  elif request.format == "ris":
    content = export_service.export_ris(papers)
    return Response(
      content=content,
      media_type="text/plain",
      headers={"Content-Disposition": 'attachment; filename="papers.ris"'},
    )
  elif request.format == "endnote":
    content = export_service.export_endnote(papers)
    return Response(
      content=content,
      media_type="text/plain",
      headers={"Content-Disposition": 'attachment; filename="papers.enw"'},
    )
  else:
    raise HTTPException(status_code=400, detail=f"Unsupported format: {request.format}")


@router.post("/papers/export/citations")
async def export_citations(
  request: CitationExportRequest, session: AsyncSession = Depends(get_db)
):
  """Export citations in specified format."""
  if not request.paper_ids:
    raise HTTPException(status_code=400, detail="No paper IDs provided")

  query = select(Paper).where(Paper.id.in_(request.paper_ids)).options(selectinload(Paper.tags))
  result = await session.execute(query)
  papers = result.scalars().all()

  citations = []
  for paper in papers:
    if request.format == "apa":
      citation = reference_formatter.format_apa(paper)
    elif request.format == "mla":
      citation = reference_formatter.format_mla(paper)
    elif request.format == "bibtex":
      citation = reference_formatter.format_bibtex(paper)
    else:
      citation = f"{paper.title}"  # Default fallback
    citations.append(citation)

  content = "\n\n".join(citations)
  return Response(
    content=content,
    media_type="text/plain",
    headers={
      "Content-Disposition": f'attachment; filename="citations.{request.format}.txt"'
    },
  )


@router.post("/papers/export/bibliography")
async def generate_bibliography(
  paper_ids: List[int] = Query(...),
  format: str = Query("apa", pattern="^(apa|mla|bibtex|chicago|ieee)$"),
  session: AsyncSession = Depends(get_db),
):
  """Generate bibliography from selected papers."""
  if not paper_ids:
    raise HTTPException(status_code=400, detail="No paper IDs provided")

  query = select(Paper).where(Paper.id.in_(paper_ids)).options(selectinload(Paper.tags))
  result = await session.execute(query)
  papers = result.scalars().all()

  citations = []
  for paper in papers:
    if format == "apa":
      citation = reference_formatter.format_apa(paper)
    elif format == "mla":
      citation = reference_formatter.format_mla(paper)
    elif format == "bibtex":
      citation = reference_formatter.format_bibtex(paper)
    else:
      citation = f"{paper.title}"  # Default fallback
    citations.append(citation)

  content = "\n\n".join(citations)
  return Response(
    content=content,
    media_type="text/plain",
    headers={
      "Content-Disposition": f'attachment; filename="bibliography.{format}.txt"'
    },
  )
