"""Persistence and visibility rules for grounded annotation explanations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import cast

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.crud.paper import get_visible_paper_or_404
from app.models.annotation import Annotation, AnnotationExplanation
from app.schemas.annotation import (
  ExplanationAction,
  ExplanationVisibility,
  SemanticAnchor,
)
from app.services.annotation_grounding import (
  EXPLANATION_PROMPT_VERSION,
  explanation_input_hash,
  explanation_retention_until,
)


async def get_annotation_for_explanation(
  session: AsyncSession,
  annotation_id: int,
  *,
  requester_id: int,
  is_admin: bool = False,
) -> Annotation:
  """Load an annotation only after checking the paper visibility boundary."""

  result = await session.execute(
    select(Annotation)
    .where(Annotation.id == annotation_id)
    .options(selectinload(Annotation.paper))
  )
  annotation = result.scalar_one_or_none()
  if annotation is None:
    raise HTTPException(status_code=404, detail="Annotation not found")

  await get_visible_paper_or_404(
    session,
    cast(int, annotation.paper_id),
    user_id=None if is_admin else requester_id,
  )
  return annotation


async def list_visible_annotation_explanations(
  session: AsyncSession,
  *,
  annotation_id: int,
  requester_id: int,
  is_admin: bool = False,
  now: datetime | None = None,
) -> list[AnnotationExplanation]:
  """List unexpired records the requester is allowed to see."""

  current = now or datetime.now(timezone.utc)
  query = select(AnnotationExplanation).where(
    AnnotationExplanation.annotation_id == annotation_id,
    AnnotationExplanation.retention_until > current,
  )
  if not is_admin:
    query = query.where(
      or_(
        AnnotationExplanation.owner_user_id == requester_id,
        AnnotationExplanation.visibility == "paper",
      ),
      AnnotationExplanation.status == "ready",
    )
  query = query.order_by(
    AnnotationExplanation.generation.desc(), AnnotationExplanation.created_at.desc()
  )
  result = await session.execute(query)
  return list(result.scalars().all())


async def list_visible_explanations_for_paper(
  session: AsyncSession,
  *,
  paper_id: int,
  requester_id: int,
  is_admin: bool = False,
  now: datetime | None = None,
) -> list[AnnotationExplanation]:
  """List visible explanation records in one paper-scoped query."""

  await get_visible_paper_or_404(
    session, paper_id, user_id=None if is_admin else requester_id
  )
  current = now or datetime.now(timezone.utc)
  query = (
    select(AnnotationExplanation)
    .join(Annotation, Annotation.id == AnnotationExplanation.annotation_id)
    .where(
      Annotation.paper_id == paper_id,
      AnnotationExplanation.retention_until > current,
    )
  )
  if not is_admin:
    query = query.where(
      or_(
        AnnotationExplanation.owner_user_id == requester_id,
        AnnotationExplanation.visibility == "paper",
      ),
      AnnotationExplanation.status == "ready",
    )
  query = query.order_by(
    AnnotationExplanation.annotation_id,
    AnnotationExplanation.generation.desc(),
  )
  result = await session.execute(query)
  return list(result.scalars().all())


async def find_idempotent_explanation(
  session: AsyncSession,
  *,
  owner_user_id: int,
  idempotency_key: str,
) -> AnnotationExplanation | None:
  result = await session.execute(
    select(AnnotationExplanation).where(
      AnnotationExplanation.owner_user_id == owner_user_id,
      AnnotationExplanation.idempotency_key == idempotency_key,
    )
  )
  return result.scalar_one_or_none()


async def find_cached_annotation(
  session: AsyncSession,
  *,
  paper_id: int,
  owner_user_id: int,
  action: ExplanationAction,
  visibility: ExplanationVisibility,
  input_hash: str,
  now: datetime | None = None,
) -> Annotation | None:
  """Return the latest reusable answer for an exact grounded request."""

  current = now or datetime.now(timezone.utc)
  result = await session.execute(
    select(Annotation)
    .join(AnnotationExplanation, AnnotationExplanation.annotation_id == Annotation.id)
    .where(
      Annotation.paper_id == paper_id,
      AnnotationExplanation.owner_user_id == owner_user_id,
      AnnotationExplanation.action == action,
      AnnotationExplanation.visibility == visibility,
      AnnotationExplanation.input_hash == input_hash,
      AnnotationExplanation.status == "ready",
      AnnotationExplanation.retention_until > current,
    )
    .order_by(AnnotationExplanation.generation.desc())
    .limit(1)
  )
  return result.scalar_one_or_none()


async def find_latest_annotation_for_regeneration(
  session: AsyncSession,
  *,
  paper_id: int,
  owner_user_id: int,
  action: ExplanationAction,
  visibility: ExplanationVisibility,
  input_hash: str,
) -> tuple[Annotation | None, int]:
  """Find the answer annotation and next generation number for regeneration."""

  result = await session.execute(
    select(AnnotationExplanation)
    .join(Annotation, Annotation.id == AnnotationExplanation.annotation_id)
    .where(
      Annotation.paper_id == paper_id,
      AnnotationExplanation.owner_user_id == owner_user_id,
      AnnotationExplanation.action == action,
      AnnotationExplanation.visibility == visibility,
      AnnotationExplanation.input_hash == input_hash,
    )
    .options(selectinload(AnnotationExplanation.annotation))
    .order_by(AnnotationExplanation.generation.desc())
    .limit(1)
  )
  latest = result.scalar_one_or_none()
  if latest is None:
    return None, 1
  return latest.annotation, cast(int, latest.generation) + 1


async def record_explanation(
  session: AsyncSession,
  *,
  annotation: Annotation,
  owner_user_id: int,
  action: ExplanationAction,
  visibility: ExplanationVisibility,
  anchor: SemanticAnchor,
  answer: str,
  provider: str | None,
  model: str | None,
  generation: int,
  idempotency_key: str | None = None,
  now: datetime | None = None,
) -> AnnotationExplanation:
  """Persist one ready cache generation without committing its transaction."""

  current = now or datetime.now(timezone.utc)
  row = AnnotationExplanation(
    annotation_id=annotation.id,
    owner_user_id=owner_user_id,
    action=action,
    status="ready",
    visibility=visibility,
    generation=generation,
    anchor=anchor.model_dump(mode="json", exclude_none=True),
    input_hash=explanation_input_hash(
      paper_id=cast(int, annotation.paper_id),
      action=action,
      visibility=visibility,
      anchor=anchor,
      prompt_version=EXPLANATION_PROMPT_VERSION,
    ),
    prompt_version=EXPLANATION_PROMPT_VERSION,
    provider=provider,
    model=model,
    answer=answer,
    evidence=[],
    retention_until=explanation_retention_until(now=current),
    idempotency_key=idempotency_key,
  )
  session.add(row)
  await session.flush()
  return row


async def annotation_for_explanation_row(
  session: AsyncSession, row: AnnotationExplanation
) -> Annotation:
  """Load the answer annotation for an idempotent replay."""

  result = await session.execute(
    select(Annotation).where(Annotation.id == row.annotation_id)
  )
  annotation = result.scalar_one_or_none()
  if annotation is None:
    raise HTTPException(status_code=404, detail="Annotation not found")
  return annotation


async def purge_expired_explanations(
  session: AsyncSession, *, now: datetime | None = None
) -> int:
  """Delete expired cache rows; annotation rows remain owned by the user."""

  current = now or datetime.now(timezone.utc)
  result = await session.execute(
    delete(AnnotationExplanation).where(AnnotationExplanation.retention_until <= current)
  )
  return int(getattr(result, "rowcount", 0) or 0)
