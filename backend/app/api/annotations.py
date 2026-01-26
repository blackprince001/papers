"""Annotations API endpoints."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import (
  create_annotation,
  delete_annotation,
  get_annotation_or_404,
  list_annotations_for_paper,
  update_annotation,
)
from app.dependencies import get_db
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
async def create_annotation_endpoint(
  paper_id: int,
  annotation_in: AnnotationCreate,
  session: AsyncSession = Depends(get_db),
):
  """Create an annotation for a paper."""
  annotation = await create_annotation(
    session,
    paper_id,
    content=annotation_in.content,
    type=annotation_in.type or "annotation",
    highlighted_text=annotation_in.highlighted_text,
    selection_data=annotation_in.selection_data,
    note_scope=annotation_in.note_scope,
    coordinate_data=annotation_in.coordinate_data,
  )
  return AnnotationSchema.model_validate(annotation)


@router.get("/papers/{paper_id}/annotations", response_model=List[AnnotationSchema])
async def list_annotations_endpoint(
  paper_id: int, session: AsyncSession = Depends(get_db)
):
  """List all annotations for a paper."""
  annotations = await list_annotations_for_paper(session, paper_id)
  return [AnnotationSchema.model_validate(a) for a in annotations]


@router.get("/annotations/{annotation_id}", response_model=AnnotationSchema)
async def get_annotation_endpoint(
  annotation_id: int, session: AsyncSession = Depends(get_db)
):
  """Get a single annotation by ID."""
  annotation = await get_annotation_or_404(session, annotation_id)
  return AnnotationSchema.model_validate(annotation)


@router.patch("/annotations/{annotation_id}", response_model=AnnotationSchema)
async def update_annotation_endpoint(
  annotation_id: int,
  annotation_update: AnnotationUpdate,
  session: AsyncSession = Depends(get_db),
):
  """Update an annotation."""
  annotation = await update_annotation(
    session,
    annotation_id,
    content=annotation_update.content,
    type=annotation_update.type,
    highlighted_text=annotation_update.highlighted_text,
    selection_data=annotation_update.selection_data,
    note_scope=annotation_update.note_scope,
    coordinate_data=annotation_update.coordinate_data,
  )
  return AnnotationSchema.model_validate(annotation)


@router.delete("/annotations/{annotation_id}", status_code=204)
async def delete_annotation_endpoint(
  annotation_id: int, session: AsyncSession = Depends(get_db)
):
  """Delete an annotation."""
  await delete_annotation(session, annotation_id)
  return None
