from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.tag import Tag
from app.schemas.tag import Tag as TagSchema
from app.schemas.tag import TagCreate, TagListResponse, TagUpdate

router = APIRouter()


@router.get("/tags", response_model=TagListResponse)
async def list_tags(
  page: int = Query(1, ge=1),
  page_size: int = Query(100, ge=1, le=1000),
  search: str | None = None,
  session: AsyncSession = Depends(get_db),
):
  query = select(Tag)

  if search:
    query = query.where(Tag.name.ilike(f"%{search}%"))

  count_query = select(func.count()).select_from(Tag)
  if search:
    count_query = count_query.where(Tag.name.ilike(f"%{search}%"))

  total_result = await session.execute(count_query)
  total = total_result.scalar()

  offset = (page - 1) * page_size
  query = query.order_by(Tag.name.asc()).offset(offset).limit(page_size)

  result = await session.execute(query)
  tags = result.scalars().all()

  return TagListResponse(
    tags=[TagSchema.model_validate(t) for t in tags],
    total=total,
  )


@router.post("/tags", response_model=TagSchema, status_code=201)
async def create_tag(tag_in: TagCreate, session: AsyncSession = Depends(get_db)):
  # Check if tag with same name already exists
  existing = await session.execute(select(Tag).where(Tag.name == tag_in.name))
  if existing.scalar_one_or_none():
    raise HTTPException(status_code=400, detail="Tag with this name already exists")

  tag = Tag(name=tag_in.name)
  session.add(tag)
  await session.commit()
  await session.refresh(tag)

  return TagSchema.model_validate(tag)


@router.get("/tags/{tag_id}", response_model=TagSchema)
async def get_tag(tag_id: int, session: AsyncSession = Depends(get_db)):
  query = select(Tag).where(Tag.id == tag_id)
  result = await session.execute(query)
  tag = result.scalar_one_or_none()

  if not tag:
    raise HTTPException(status_code=404, detail="Tag not found")

  return TagSchema.model_validate(tag)


@router.patch("/tags/{tag_id}", response_model=TagSchema)
async def update_tag(
  tag_id: int, tag_update: TagUpdate, session: AsyncSession = Depends(get_db)
):
  query = select(Tag).where(Tag.id == tag_id)
  result = await session.execute(query)
  tag = result.scalar_one_or_none()

  if not tag:
    raise HTTPException(status_code=404, detail="Tag not found")

  if tag_update.name is not None:
    # Check if another tag with this name exists
    existing = await session.execute(
      select(Tag).where(Tag.name == tag_update.name, Tag.id != tag_id)
    )
    if existing.scalar_one_or_none():
      raise HTTPException(status_code=400, detail="Tag with this name already exists")
    tag.name = tag_update.name

  await session.commit()
  await session.refresh(tag)

  return TagSchema.model_validate(tag)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: int, session: AsyncSession = Depends(get_db)):
  query = select(Tag).where(Tag.id == tag_id)
  result = await session.execute(query)
  tag = result.scalar_one_or_none()

  if not tag:
    raise HTTPException(status_code=404, detail="Tag not found")

  await session.delete(tag)
  await session.commit()

  return None
