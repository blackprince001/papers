"""Groups API endpoints."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud import (
  create_group,
  delete_group,
  get_group_or_404,
  list_groups,
  update_group,
)
from app.dependencies import get_db
from app.schemas.group import Group as GroupSchema
from app.schemas.group import GroupCreate, GroupUpdate

router = APIRouter()


@router.get("/groups", response_model=List[GroupSchema])
async def list_groups_endpoint(session: AsyncSession = Depends(get_db)):
  """List all groups with their papers and children."""
  groups = await list_groups(session)
  return [GroupSchema.model_validate(g) for g in groups]


@router.post("/groups", response_model=GroupSchema, status_code=201)
async def create_group_endpoint(
  group_in: GroupCreate, session: AsyncSession = Depends(get_db)
):
  """Create a new group."""
  group = await create_group(session, group_in.name, group_in.parent_id)
  return GroupSchema.model_validate(group)


@router.get("/groups/{group_id}", response_model=GroupSchema)
async def get_group_endpoint(group_id: int, session: AsyncSession = Depends(get_db)):
  """Get a single group by ID."""
  group = await get_group_or_404(session, group_id, with_relations=True)
  return GroupSchema.model_validate(group)


@router.patch("/groups/{group_id}", response_model=GroupSchema)
async def update_group_endpoint(
  group_id: int, group_update: GroupUpdate, session: AsyncSession = Depends(get_db)
):
  """Update a group."""
  group = await update_group(
    session,
    group_id,
    name=group_update.name,
    parent_id=group_update.parent_id,
  )
  return GroupSchema.model_validate(group)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group_endpoint(group_id: int, session: AsyncSession = Depends(get_db)):
  """Delete a group."""
  await delete_group(session, group_id)
  return None
