"""Annotations API endpoints."""

from typing import List, cast

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import (
  create_annotation,
  delete_annotation,
  get_annotation_or_404,
  list_annotations_for_paper,
  update_annotation,
)
from app.dependencies import CurrentUser, get_db, scoped_user_id
from app.schemas.annotation import (
  Annotation as AnnotationSchema,
)
from app.schemas.annotation import (
  AnnotationCreate,
  AnnotationUpdate,
)
from app.schemas.annotation import (
  AnnotationExplanation as AnnotationExplanationSchema,
)
from app.services.annotation_explanations import (
  get_annotation_for_explanation,
  list_visible_annotation_explanations,
  list_visible_explanations_for_paper,
)

router = APIRouter()


@router.post(
  "/papers/{paper_id}/annotations", response_model=AnnotationSchema, status_code=201
)
async def create_annotation_endpoint(
  paper_id: int,
  annotation_in: AnnotationCreate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Create an annotation for a paper."""
  annotation = await create_annotation(
    session,
    paper_id,
    user_id=scoped_user_id(user),
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
  paper_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """List all annotations for a paper."""
  annotations = await list_annotations_for_paper(
    session, paper_id, user_id=scoped_user_id(user)
  )
  result = []
  for a in annotations:
    schema = AnnotationSchema.model_validate(a)
    if a.user:
      schema.user_display_name = a.user.display_name
    result.append(schema)
  return result


@router.get("/annotations/{annotation_id}", response_model=AnnotationSchema)
async def get_annotation_endpoint(
  annotation_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Get a single annotation by ID."""
  annotation = await get_annotation_or_404(
    session, annotation_id, user_id=scoped_user_id(user)
  )
  return AnnotationSchema.model_validate(annotation)


@router.patch("/annotations/{annotation_id}", response_model=AnnotationSchema)
async def update_annotation_endpoint(
  annotation_id: int,
  annotation_update: AnnotationUpdate,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """Update an annotation."""
  annotation = await update_annotation(
    session,
    annotation_id,
    user_id=scoped_user_id(user),
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
  annotation_id: int, user: CurrentUser, session: AsyncSession = Depends(get_db)
):
  """Delete an annotation."""
  await delete_annotation(session, annotation_id, user_id=scoped_user_id(user))
  return None


@router.get(
  "/annotations/{annotation_id}/explanations",
  response_model=List[AnnotationExplanationSchema],
)
async def list_annotation_explanations_endpoint(
  annotation_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """List unexpired explanation generations visible to the current user."""

  requester_id = cast(int, user.id)
  is_admin = cast(bool, user.role == "admin")
  await get_annotation_for_explanation(
    session,
    annotation_id,
    requester_id=requester_id,
    is_admin=is_admin,
  )
  explanations = await list_visible_annotation_explanations(
    session,
    annotation_id=annotation_id,
    requester_id=requester_id,
    is_admin=is_admin,
  )
  return [AnnotationExplanationSchema.model_validate(item) for item in explanations]


@router.get(
  "/papers/{paper_id}/explanations",
  response_model=List[AnnotationExplanationSchema],
)
async def list_paper_explanations_endpoint(
  paper_id: int,
  user: CurrentUser,
  session: AsyncSession = Depends(get_db),
):
  """List visible explanation records for a paper in one request."""

  requester_id = cast(int, user.id)
  is_admin = cast(bool, user.role == "admin")
  explanations = await list_visible_explanations_for_paper(
    session,
    paper_id=paper_id,
    requester_id=requester_id,
    is_admin=is_admin,
  )
  return [AnnotationExplanationSchema.model_validate(item) for item in explanations]
