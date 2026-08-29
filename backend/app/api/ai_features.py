"""AI Features API endpoints."""

from datetime import datetime, timezone
from typing import Any, Optional, cast

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import get_visible_paper_or_404
from app.core.logger import get_logger
from app.dependencies import CurrentUser, get_db, scoped_user_id
from app.schemas.ai_features import (
  AIActionRequest,
  FindingsResponse,
  ReadingGuideResponse,
  SummaryRequest,
  SummaryResponse,
)
from app.schemas.annotation import Annotation as AnnotationSchema
from app.services.annotation_explanations import (
  annotation_for_explanation_row,
  find_cached_annotation,
  find_idempotent_explanation,
  find_latest_annotation_for_regeneration,
  record_explanation,
)
from app.services.annotation_grounding import (
  build_semantic_anchor,
  explanation_input_hash,
  normalize_idempotency_key,
)
from app.tasks.ai_tasks import (
  extract_findings_task,
  generate_highlights_task,
  generate_reading_guide_task,
  generate_summary_task,
)

router = APIRouter()
logger = get_logger(__name__)

AI_ACTION_PROMPTS = {
  "explain": (
    "Explain the following passage from the paper in clear, accessible terms. "
    "Cover what it means and how it connects to the paper's argument. "
    "Be concise (3-6 sentences)."
  ),
  "why": (
    "Explain why the following passage matters in the context of this paper: "
    "the motivation or reasoning behind it, and what would be lost without it. "
    "Be concise (3-6 sentences)."
  ),
  "define": (
    "Define the key term(s) or concept(s) in the following passage, as used in "
    "this paper. Give the paper-specific meaning first, then the general one if "
    "it differs. Be concise."
  ),
}


@router.post("/papers/{paper_id}/ai-actions", response_model=AnnotationSchema)
async def run_ai_action(
  paper_id: int,
  request: AIActionRequest,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
  idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
  """Run a selection AI action (explain/why/define).

  The answer is persisted as an annotation anchored to the selection's
  geometry, so it renders as a highlight + margin card in the reader.
  """
  from app.models.annotation import Annotation
  from app.services.ai.helpers import get_provider_for_user
  from app.services.ai.providers.base import GenerateConfig

  uid: int = cast(int, user.id)
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  try:
    request_key = normalize_idempotency_key(idempotency_key)
    anchor = build_semantic_anchor(
      page=request.page,
      quoted_text=request.selection_text,
      rects=request.rects,
      document_revision=(
        paper.updated_at.isoformat() if paper.updated_at is not None else None
      ),
    )
  except ValueError as e:
    raise HTTPException(status_code=422, detail=str(e)) from e

  input_hash = explanation_input_hash(
    paper_id=paper_id,
    action=request.action,
    visibility=request.visibility,
    anchor=anchor,
  )

  if request_key:
    existing = await find_idempotent_explanation(
      session, owner_user_id=uid, idempotency_key=request_key
    )
    if existing is not None:
      if cast(str, existing.input_hash) != input_hash:
        raise HTTPException(
          status_code=409,
          detail="Idempotency-Key was already used for a different selection",
        )
      if cast(datetime, existing.retention_until) <= datetime.now(timezone.utc):
        raise HTTPException(
          status_code=409,
          detail="Idempotency-Key refers to an expired explanation",
        )
      annotation = await annotation_for_explanation_row(session, existing)
      return AnnotationSchema.model_validate(annotation)

  if not request.regenerate:
    cached = await find_cached_annotation(
      session,
      paper_id=paper_id,
      owner_user_id=uid,
      action=request.action,
      visibility=request.visibility,
      input_hash=input_hash,
    )
    if cached is not None:
      return AnnotationSchema.model_validate(cached)

  provider = await get_provider_for_user(session, uid)
  if not provider:
    raise HTTPException(status_code=400, detail="No AI provider configured")

  content = cast(Optional[str], paper.content_text) or ""
  prompt = (
    f"Paper Context:\n{paper.title or 'Unknown'}\n\n"
    + (f"Paper Content:\n{content[:40000]}\n\n" if content else "")
    + f"{AI_ACTION_PROMPTS[request.action]}\n\n"
    + f'Passage (page {anchor.page}):\n"""{anchor.quoted_text}"""'
  )

  config = GenerateConfig(
    model=provider.config.model,
    temperature=0.3,
    max_output_tokens=1024,
  )
  try:
    answer = await provider.generate(prompt, config)
  except Exception as e:
    logger.error("AI provider error in selection action", error_type=type(e).__name__)
    raise HTTPException(
      status_code=502, detail="The AI provider could not generate an explanation"
    ) from e

  if not answer or not answer.strip():
    raise HTTPException(status_code=502, detail="AI provider returned no answer")

  answer_text = answer.strip()
  rects = [r.model_dump(mode="json") for r in request.rects]
  annotation: Annotation | None = None
  generation = 1
  if request.regenerate:
    annotation, generation = await find_latest_annotation_for_regeneration(
      session,
      paper_id=paper_id,
      owner_user_id=uid,
      action=request.action,
      visibility=request.visibility,
      input_hash=input_hash,
    )

  if annotation is None:
    annotation = Annotation(
      paper_id=paper_id,
      user_id=uid,
      content=answer_text,
      highlighted_text=anchor.quoted_text,
      type="annotation",
      auto_highlighted=False,
      highlight_type=request.action,
      selection_data={"rects": rects, "source": "ai_action"} if rects else None,
      coordinate_data={
        "page": anchor.page,
        "x": (rects[0]["left"] + rects[0]["width"] / 2) if rects else 0.5,
        "y": rects[0]["top"] if rects else 0.0,
      },
    )
    session.add(annotation)
    await session.flush()
  else:
    # Regeneration keeps one visible mark while retaining prior answer
    # generations in the cache table for the retention window.
    editable_annotation = cast(Any, annotation)
    editable_annotation.content = answer_text
    editable_annotation.highlighted_text = anchor.quoted_text
    editable_annotation.highlight_type = request.action
    editable_annotation.selection_data = (
      {"rects": rects, "source": "ai_action"} if rects else None
    )
    editable_annotation.coordinate_data = {
      "page": anchor.page,
      "x": (rects[0]["left"] + rects[0]["width"] / 2) if rects else 0.5,
      "y": rects[0]["top"] if rects else 0.0,
    }

  await record_explanation(
    session,
    annotation=annotation,
    owner_user_id=uid,
    action=request.action,
    visibility=request.visibility,
    anchor=anchor,
    answer=answer_text,
    provider=getattr(provider, "name", None),
    model=provider.config.model,
    generation=generation,
    idempotency_key=request_key,
  )
  await session.commit()
  await session.refresh(annotation)
  return AnnotationSchema.model_validate(annotation)


@router.post("/papers/{paper_id}/generate-summary", response_model=SummaryResponse)
async def generate_summary(
  paper_id: int,
  user: CurrentUser,
  request: Optional[SummaryRequest] = None,
  session: AsyncSession = Depends(get_db),
):
  """Trigger AI summary generation task."""
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  # Trigger task (uses the paper owner's configured provider — no server key needed)
  generate_summary_task.delay(paper_id)

  return SummaryResponse(summary=None, generated_at=None, status="pending")


@router.get("/papers/{paper_id}/summary", response_model=SummaryResponse)
async def get_summary(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get AI summary for a paper."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

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
  user: CurrentUser,
  summary: str = Body(..., embed=True),
  session: AsyncSession = Depends(get_db),
):
  """Update AI summary manually."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

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
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Trigger extraction of key findings."""
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  extract_findings_task.delay(paper_id)

  return FindingsResponse(findings=None, status="pending")


@router.get("/papers/{paper_id}/findings", response_model=FindingsResponse)
async def get_findings(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get key findings for a paper."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  findings = (
    paper.key_findings
    if paper.key_findings is not None and isinstance(paper.key_findings, dict)
    else {}
  )

  return FindingsResponse(
    findings=findings,
    generated_at=cast(datetime | None, paper.findings_extracted_at),
    status="completed" if findings else "not_found",
  )


@router.put("/papers/{paper_id}/findings", response_model=FindingsResponse)
async def update_findings(
  paper_id: int,
  user: CurrentUser,
  findings: dict = Body(..., embed=True),
  session: AsyncSession = Depends(get_db),
):
  """Update key findings manually."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  paper.key_findings = findings
  await session.commit()
  await session.refresh(paper)

  return FindingsResponse(findings=findings, status="completed")


@router.post(
  "/papers/{paper_id}/generate-reading-guide", response_model=ReadingGuideResponse
)
async def generate_reading_guide(
  paper_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Trigger reading guide generation."""
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  generate_reading_guide_task.delay(paper_id)

  return ReadingGuideResponse(guide=None, status="pending")


@router.get("/papers/{paper_id}/reading-guide", response_model=ReadingGuideResponse)
async def get_reading_guide(
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get reading guide for a paper."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  guide = (
    paper.reading_guide
    if paper.reading_guide is not None and isinstance(paper.reading_guide, dict)
    else {}
  )

  return ReadingGuideResponse(
    guide=guide,
    generated_at=cast(datetime | None, paper.guide_generated_at),
    status="completed" if guide else "not_found",
  )


@router.put("/papers/{paper_id}/reading-guide", response_model=ReadingGuideResponse)
async def update_reading_guide(
  paper_id: int,
  user: CurrentUser,
  guide: dict = Body(..., embed=True),
  session: AsyncSession = Depends(get_db),
):
  """Update reading guide manually."""
  paper = await get_visible_paper_or_404(
    session, paper_id, user_id=scoped_user_id(user)
  )

  paper.reading_guide = guide
  await session.commit()
  await session.refresh(paper)

  return ReadingGuideResponse(guide=guide, status="completed")


@router.post("/papers/{paper_id}/generate-highlights")
async def generate_highlights(
  paper_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Trigger auto-highlights generation."""
  await get_visible_paper_or_404(session, paper_id, user_id=scoped_user_id(user))

  generate_highlights_task.delay(paper_id)

  return {"message": "Highlights generation started in background", "status": "pending"}
