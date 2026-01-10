from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.annotation import Annotation
from app.models.paper import Paper
from app.schemas.annotation import (
  Annotation as AnnotationSchema,
)
from app.schemas.annotation import (
  AnnotationCreate,
  AnnotationUpdate,
)

router = APIRouter()


@router.post(
  "/papers/{paper_id}/annotations", response_model=AnnotationSchema, status_code=201
)
async def create_annotation(
  paper_id: int,
  annotation_in: AnnotationCreate,
  session: AsyncSession = Depends(get_db),
):
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  annotation = Annotation(
    paper_id=paper_id,
    content=annotation_in.content,
    type=annotation_in.type or "annotation",
    highlighted_text=annotation_in.highlighted_text,
    selection_data=annotation_in.selection_data,
    note_scope=annotation_in.note_scope,
    coordinate_data=annotation_in.coordinate_data or {},
  )

  session.add(annotation)
  await session.commit()
  await session.refresh(annotation)

  return AnnotationSchema.model_validate(annotation)


@router.get("/papers/{paper_id}/annotations", response_model=List[AnnotationSchema])
async def list_annotations(paper_id: int, session: AsyncSession = Depends(get_db)):
  paper_query = select(Paper).where(Paper.id == paper_id)
  paper_result = await session.execute(paper_query)
  paper = paper_result.scalar_one_or_none()

  if not paper:
    raise HTTPException(status_code=404, detail="Paper not found")

  query = (
    select(Annotation)
    .where(Annotation.paper_id == paper_id)
    .order_by(Annotation.created_at.desc())
  )
  result = await session.execute(query)
  annotations = result.scalars().all()

  return [AnnotationSchema.model_validate(a) for a in annotations]


@router.get("/annotations/{annotation_id}", response_model=AnnotationSchema)
async def get_annotation(annotation_id: int, session: AsyncSession = Depends(get_db)):
  query = select(Annotation).where(Annotation.id == annotation_id)
  result = await session.execute(query)
  annotation = result.scalar_one_or_none()

  if not annotation:
    raise HTTPException(status_code=404, detail="Annotation not found")

  return AnnotationSchema.model_validate(annotation)


@router.patch("/annotations/{annotation_id}", response_model=AnnotationSchema)
async def update_annotation(
  annotation_id: int,
  annotation_update: AnnotationUpdate,
  session: AsyncSession = Depends(get_db),
):
  query = select(Annotation).where(Annotation.id == annotation_id)
  result = await session.execute(query)
  annotation = result.scalar_one_or_none()

  if not annotation:
    raise HTTPException(status_code=404, detail="Annotation not found")

  if annotation_update.content is not None:
    annotation.content = annotation_update.content
  if annotation_update.type is not None:
    annotation.type = annotation_update.type
  if annotation_update.highlighted_text is not None:
    annotation.highlighted_text = annotation_update.highlighted_text
  if annotation_update.selection_data is not None:
    annotation.selection_data = annotation_update.selection_data
  if annotation_update.note_scope is not None:
    annotation.note_scope = annotation_update.note_scope
  if annotation_update.coordinate_data is not None:
    annotation.coordinate_data = annotation_update.coordinate_data

  await session.commit()
  await session.refresh(annotation)

  return AnnotationSchema.model_validate(annotation)


@router.delete("/annotations/{annotation_id}", status_code=204)
async def delete_annotation(
  annotation_id: int, session: AsyncSession = Depends(get_db)
):
  query = select(Annotation).where(Annotation.id == annotation_id)
  result = await session.execute(query)
  annotation = result.scalar_one_or_none()

  if not annotation:
    raise HTTPException(status_code=404, detail="Annotation not found")

  await session.delete(annotation)
  await session.commit()

  return None
