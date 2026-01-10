from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.duplicate_log import DuplicateDetectionLog
from app.models.paper import Paper
from app.schemas.duplicate import DuplicateMatch, MergePreview, MergeRequest
from app.schemas.paper import Paper as PaperSchema
from app.services.duplicate_detection import duplicate_detection_service

router = APIRouter()


@router.post("/papers/{paper_id}/find-duplicates", response_model=List[DuplicateMatch])
async def find_duplicates(
  paper_id: int,
  threshold: float = 0.8,
  session: AsyncSession = Depends(get_db),
):
  """Find duplicates for a paper."""
  duplicates = await duplicate_detection_service.find_duplicates(
    session, paper_id, threshold
  )

  return [
    DuplicateMatch(
      paper=PaperSchema.model_validate(paper),
      confidence_score=score,
      detection_method=method,
    )
    for paper, score, method in duplicates
  ]


@router.post("/papers/merge", response_model=PaperSchema)
async def merge_papers(request: MergeRequest, session: AsyncSession = Depends(get_db)):
  """Merge duplicate papers."""
  if request.primary_paper_id == request.duplicate_paper_id:
    raise HTTPException(status_code=400, detail="Cannot merge paper with itself")

  # Create log entry
  log_entry = DuplicateDetectionLog(
    paper_id=request.primary_paper_id,
    duplicate_paper_id=request.duplicate_paper_id,
    confidence_score=1.0,  # Merged
    detection_method="manual",
    merged=True,
  )
  session.add(log_entry)
  await session.commit()

  query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == request.primary_paper_id)
  )
  result = await session.execute(query)
  paper = result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  return PaperSchema.model_validate(paper)


@router.get("/papers/{paper_id}/merge-preview", response_model=MergePreview)
async def get_merge_preview(
  primary_paper_id: int,
  duplicate_paper_id: int,
  session: AsyncSession = Depends(get_db),
):
  """Get preview of merge operation."""
  primary_query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == primary_paper_id)
  )
  duplicate_query = (
    select(Paper)
    .options(
      selectinload(Paper.annotations),
      selectinload(Paper.groups),
      selectinload(Paper.tags),
    )
    .where(Paper.id == duplicate_paper_id)
  )

  primary_result = await session.execute(primary_query)
  duplicate_result = await session.execute(duplicate_query)

  primary_paper = primary_result.scalar_one_or_none()
  duplicate_paper = duplicate_result.scalar_one_or_none()

  if not primary_paper or not duplicate_paper:
    raise HTTPException(status_code=404, detail="One or both papers not found")

  return MergePreview(
    primary_paper=PaperSchema.model_validate(primary_paper),
    duplicate_paper=PaperSchema.model_validate(duplicate_paper),
    annotations_to_merge=len(duplicate_paper.annotations or []),
    tags_to_add=len(
      [t for t in duplicate_paper.tags or [] if t not in (primary_paper.tags or [])]
    ),
    groups_to_add=len(
      [g for g in duplicate_paper.groups or [] if g not in (primary_paper.groups or [])]
    ),
  )
