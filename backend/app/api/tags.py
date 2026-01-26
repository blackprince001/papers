"""Tags API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import create_tag, delete_tag, get_tag_or_404, list_tags, update_tag
from app.dependencies import get_db
from app.schemas.tag import Tag as TagSchema
from app.schemas.tag import TagCreate, TagListResponse, TagUpdate

router = APIRouter()


@router.get("/tags", response_model=TagListResponse)
async def list_tags_endpoint(
  page: int = Query(1, ge=1),
  page_size: int = Query(100, ge=1, le=1000),
  search: str | None = None,
  session: AsyncSession = Depends(get_db),
):
  """List all tags with pagination."""
  tags, total = await list_tags(session, page=page, page_size=page_size, search=search)
  return TagListResponse(
    tags=[TagSchema.model_validate(t) for t in tags],
    total=total,
  )


@router.post("/tags", response_model=TagSchema, status_code=201)
async def create_tag_endpoint(
  tag_in: TagCreate, session: AsyncSession = Depends(get_db)
):
  """Create a new tag."""
  tag = await create_tag(session, tag_in.name)
  return TagSchema.model_validate(tag)


@router.get("/tags/{tag_id}", response_model=TagSchema)
async def get_tag_endpoint(tag_id: int, session: AsyncSession = Depends(get_db)):
  """Get a tag by ID."""
  tag = await get_tag_or_404(session, tag_id)
  return TagSchema.model_validate(tag)


@router.patch("/tags/{tag_id}", response_model=TagSchema)
async def update_tag_endpoint(
  tag_id: int, tag_update: TagUpdate, session: AsyncSession = Depends(get_db)
):
  """Update a tag."""
  if tag_update.name is not None:
    tag = await update_tag(session, tag_id, tag_update.name)
  else:
    tag = await get_tag_or_404(session, tag_id)
  return TagSchema.model_validate(tag)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag_endpoint(tag_id: int, session: AsyncSession = Depends(get_db)):
  """Delete a tag."""
  await delete_tag(session, tag_id)
  return None
