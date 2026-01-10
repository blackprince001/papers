from datetime import datetime, timezone
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.dependencies import get_db
from app.models.paper import Paper
from app.schemas.ai_features import (
  FindingsResponse,
  ReadingGuideResponse,
  SummaryRequest,
  SummaryResponse,
)
from app.services.ai_highlighter import ai_highlighter_service
from app.services.ai_summarizer import ai_summarizer_service

router = APIRouter()


@router.post("/papers/{paper_id}/generate-summary", response_model=SummaryResponse)
async def generate_summary(
  paper_id: int,
  request: Optional[SummaryRequest] = None,
  session: AsyncSession = Depends(get_db),
):
  """Generate AI summary for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.content_text:
    raise HTTPException(status_code=400, detail="Paper has no content to summarize")

  # Check if API key is configured
  if not settings.GOOGLE_API_KEY:
    raise HTTPException(
      status_code=400,
      detail="Google API key not configured. Please set GOOGLE_API_KEY environment variable."
    )

  summary = await ai_summarizer_service.generate_summary(
    cast(str, paper.title), cast(str, paper.content_text or "")
  )

  if not summary:
    raise HTTPException(
      status_code=500,
      detail="Failed to generate summary. Please check your Google API key configuration and ensure it is valid. If you've changed your API key, please restart the backend server."
    )

  paper.ai_summary = summary
  paper.summary_generated_at = datetime.now(timezone.utc)
  await session.commit()
  await session.refresh(paper)

  return SummaryResponse(
    summary=summary,
    generated_at=cast(datetime | None, paper.summary_generated_at),
  )


@router.get("/papers/{paper_id}/summary", response_model=SummaryResponse)
async def get_summary(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get AI summary for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.ai_summary:
    raise HTTPException(
      status_code=404, detail="Summary not found. Please generate a summary first."
    )

  return SummaryResponse(
    summary=paper.ai_summary,
    generated_at=cast(datetime | None, paper.summary_generated_at),
  )


@router.put("/papers/{paper_id}/summary", response_model=SummaryResponse)
async def update_summary(
  paper_id: int, summary: str, session: AsyncSession = Depends(get_db)
):
  """Update AI summary for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  paper.ai_summary = summary
  await session.commit()
  await session.refresh(paper)

  return SummaryResponse(
    summary=summary, generated_at=cast(datetime | None, paper.summary_generated_at)
  )


@router.post("/papers/{paper_id}/extract-findings", response_model=FindingsResponse)
async def extract_findings(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Extract key findings from a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.content_text:
    raise HTTPException(status_code=400, detail="Paper has no content")

  findings = await ai_summarizer_service.extract_findings(
    cast(str, paper.title), cast(str, paper.content_text or "")
  )

  if findings:
    paper.key_findings = findings
    paper.findings_extracted_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(paper)

  return FindingsResponse(findings=findings or {})


@router.get("/papers/{paper_id}/findings", response_model=FindingsResponse)
async def get_findings(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get key findings for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  # Ensure key_findings is a dict, default to empty dict if None
  findings = paper.key_findings if paper.key_findings is not None and isinstance(paper.key_findings, dict) else {}

  return FindingsResponse(findings=findings)


@router.put("/papers/{paper_id}/findings", response_model=FindingsResponse)
async def update_findings(
  paper_id: int, findings: dict, session: AsyncSession = Depends(get_db)
):
  """Update key findings for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  paper.key_findings = findings
  await session.commit()
  await session.refresh(paper)

  return FindingsResponse(findings=findings)


@router.post(
  "/papers/{paper_id}/generate-reading-guide", response_model=ReadingGuideResponse
)
async def generate_reading_guide(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """Generate reading guide for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.content_text:
    raise HTTPException(status_code=400, detail="Paper has no content")

  guide = await ai_summarizer_service.generate_reading_guide(
    cast(str, paper.title), cast(str, paper.content_text or "")
  )

  if guide:
    paper.reading_guide = guide
    paper.guide_generated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(paper)

  return ReadingGuideResponse(
    guide=guide or {"pre_reading": [], "during_reading": [], "post_reading": []}
  )


@router.get("/papers/{paper_id}/reading-guide", response_model=ReadingGuideResponse)
async def get_reading_guide(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get reading guide for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  # Ensure reading_guide is a dict, default to empty structure if None
  guide = paper.reading_guide if paper.reading_guide is not None and isinstance(paper.reading_guide, dict) else {"pre_reading": [], "during_reading": [], "post_reading": []}

  return ReadingGuideResponse(guide=guide)


@router.put("/papers/{paper_id}/reading-guide", response_model=ReadingGuideResponse)
async def update_reading_guide(
  paper_id: int, guide: dict, session: AsyncSession = Depends(get_db)
):
  """Update reading guide for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  paper.reading_guide = guide
  await session.commit()
  await session.refresh(paper)

  return ReadingGuideResponse(guide=guide)


@router.post("/papers/{paper_id}/generate-highlights")
async def generate_highlights(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Generate auto-highlights for a paper."""
  query = select(Paper).where(Paper.id == paper_id)
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  if not paper.content_text:
    raise HTTPException(status_code=400, detail="Paper has no content")

  annotations = await ai_highlighter_service.generate_highlights(
    session, paper_id, str(paper.content_text or "")
  )

  for annotation in annotations:
    session.add(annotation)

  await session.commit()

  return {
    "message": f"Generated {len(annotations)} highlights",
    "count": len(annotations),
  }
