"""AI Features API endpoints."""

from datetime import datetime
from typing import Optional, cast

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import get_paper_or_404
from app.core.config import settings
from app.dependencies import get_db
from app.schemas.ai_features import (
  FindingsResponse,
  ReadingGuideResponse,
  SummaryRequest,
  SummaryResponse,
)
from app.tasks.ai_tasks import (
  extract_findings_task,
  generate_highlights_task,
  generate_reading_guide_task,
  generate_summary_task,
)

router = APIRouter()


@router.post("/papers/{paper_id}/generate-summary", response_model=SummaryResponse)
async def generate_summary(
  paper_id: int,
  request: Optional[SummaryRequest] = None,
  session: AsyncSession = Depends(get_db),
):
  """Trigger AI summary generation task."""
  await get_paper_or_404(session, paper_id)

  if not settings.GOOGLE_API_KEY:
    raise HTTPException(
      status_code=400,
      detail="Google API key not configured.",
    )

  # Trigger task
  generate_summary_task.delay(paper_id)

  return SummaryResponse(summary=None, generated_at=None, status="pending")


@router.get("/papers/{paper_id}/summary", response_model=SummaryResponse)
async def get_summary(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get AI summary for a paper."""
  paper = await get_paper_or_404(session, paper_id)

  if not paper.ai_summary:
    # If no summary, it might be pending or not requested
    return SummaryResponse(
      summary=None,
      generated_at=None,
      status="not_found",  # or check if task is running if we tracked it
    )

  return SummaryResponse(
    summary=cast(str, paper.ai_summary),
    generated_at=cast(datetime | None, paper.summary_generated_at),
    status="completed",
  )


@router.put("/papers/{paper_id}/summary", response_model=SummaryResponse)
async def update_summary(
  paper_id: int,
  summary: str = Body(..., embed=True),
  session: AsyncSession = Depends(get_db),
):
  """Update AI summary manually."""
  paper = await get_paper_or_404(session, paper_id)

  paper.ai_summary = summary
  await session.commit()
  await session.refresh(paper)

  return SummaryResponse(
    summary=summary,
    generated_at=cast(datetime | None, paper.summary_generated_at),
    status="completed",
  )


@router.post("/papers/{paper_id}/extract-findings", response_model=FindingsResponse)
async def extract_findings(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Trigger extraction of key findings."""
  await get_paper_or_404(session, paper_id)

  extract_findings_task.delay(paper_id)

  return FindingsResponse(findings=None, status="pending")


@router.get("/papers/{paper_id}/findings", response_model=FindingsResponse)
async def get_findings(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get key findings for a paper."""
  paper = await get_paper_or_404(session, paper_id)

  findings = (
    paper.key_findings
    if paper.key_findings is not None and isinstance(paper.key_findings, dict)
    else {}
  )

  return FindingsResponse(
    findings=findings, status="completed" if findings else "not_found"
  )


@router.put("/papers/{paper_id}/findings", response_model=FindingsResponse)
async def update_findings(
  paper_id: int,
  findings: dict = Body(..., embed=True),
  session: AsyncSession = Depends(get_db),
):
  """Update key findings manually."""
  paper = await get_paper_or_404(session, paper_id)

  paper.key_findings = findings
  await session.commit()
  await session.refresh(paper)

  return FindingsResponse(findings=findings, status="completed")


@router.post(
  "/papers/{paper_id}/generate-reading-guide", response_model=ReadingGuideResponse
)
async def generate_reading_guide(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Trigger reading guide generation."""
  await get_paper_or_404(session, paper_id)

  generate_reading_guide_task.delay(paper_id)

  return ReadingGuideResponse(guide=None, status="pending")


@router.get("/papers/{paper_id}/reading-guide", response_model=ReadingGuideResponse)
async def get_reading_guide(paper_id: int, session: AsyncSession = Depends(get_db)):
  """Get reading guide for a paper."""
  paper = await get_paper_or_404(session, paper_id)

  guide = (
    paper.reading_guide
    if paper.reading_guide is not None and isinstance(paper.reading_guide, dict)
    else {}
  )

  return ReadingGuideResponse(guide=guide, status="completed" if guide else "not_found")


@router.put("/papers/{paper_id}/reading-guide", response_model=ReadingGuideResponse)
async def update_reading_guide(
  paper_id: int,
  guide: dict = Body(..., embed=True),
  session: AsyncSession = Depends(get_db),
):
  """Update reading guide manually."""
  paper = await get_paper_or_404(session, paper_id)

  paper.reading_guide = guide
  await session.commit()
  await session.refresh(paper)

  return ReadingGuideResponse(guide=guide, status="completed")


@router.post("/papers/{paper_id}/generate-highlights")
async def generate_highlights(
  paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Trigger auto-highlights generation."""
  await get_paper_or_404(session, paper_id)

  generate_highlights_task.delay(paper_id)

  return {"message": "Highlights generation started in background", "status": "pending"}
