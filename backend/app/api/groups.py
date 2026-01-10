from typing import List, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db
from app.models.group import Group
from app.models.paper import Paper
from app.schemas.group import Group as GroupSchema
from app.schemas.group import GroupCreate, GroupUpdate

router = APIRouter()


async def load_all_nested_children(
  session: AsyncSession, group: Group, loaded_groups: set[int] | None = None
):
  """Recursively load all nested children relationships to prevent lazy loading issues.

  This function ensures all descendant groups and their papers are eagerly loaded
  before serialization to avoid greenlet errors.
  """
  if loaded_groups is None:
    loaded_groups = set()

  if group.id in loaded_groups:
    return  # Already processed this group

  loaded_groups.add(cast(int, group.id))

  # Access children to ensure they're loaded (they should be via selectinload)
  # If children is None or empty, there's nothing to load
  if not group.children:
    return

  # Get all child IDs from the already-loaded children
  child_ids = [child.id for child in group.children]

  if child_ids:
    # Eagerly load all children with their relationships
    children_query = (
      select(Group)
      .options(
        selectinload(Group.papers).selectinload(Paper.tags),
        selectinload(Group.children)
        .selectinload(Group.papers)
        .selectinload(Paper.tags),
      )
      .where(Group.id.in_(child_ids))
    )
    result = await session.execute(children_query)
    loaded_children = result.scalars().all()

    # Replace the children list with eagerly loaded ones
    group.children = loaded_children

    # Recursively load nested children
    for child in loaded_children:
      await load_all_nested_children(session, child, loaded_groups)


async def check_cycle(session: AsyncSession, group_id: int, new_parent_id: int) -> bool:
  """Check if setting new_parent_id as parent would create a cycle."""
  if new_parent_id == group_id:
    return True  # Can't be its own parent

  current_parent_id = new_parent_id
  visited = {group_id}  # Prevent infinite loops

  while current_parent_id is not None:
    if current_parent_id in visited:
      return True  # Cycle detected
    visited.add(current_parent_id)

    result = await session.execute(
      select(Group.parent_id).where(Group.id == current_parent_id)
    )
    current_parent_id = result.scalar_one_or_none()
    if current_parent_id == group_id:
      return True  # Would create a cycle

  return False


@router.get("/groups", response_model=List[GroupSchema])
async def list_groups(session: AsyncSession = Depends(get_db)):
  query = (
    select(Group)
    .options(
      selectinload(Group.papers).selectinload(Paper.tags),
      selectinload(Group.children).selectinload(Group.papers).selectinload(Paper.tags),
    )
    .order_by(Group.name)
  )
  result = await session.execute(query)
  groups = result.scalars().all()

  # Ensure all relationships are loaded by accessing them while session is active
  for group in groups:
    _ = list(group.papers) if group.papers else []
    # Recursively load all nested children to prevent lazy loading issues
    await load_all_nested_children(session, group)

  return [GroupSchema.model_validate(g) for g in groups]


@router.post("/groups", response_model=GroupSchema, status_code=201)
async def create_group(group_in: GroupCreate, session: AsyncSession = Depends(get_db)):
  # Validate parent exists if provided
  if group_in.parent_id is not None:
    parent_result = await session.execute(
      select(Group).where(Group.id == group_in.parent_id)
    )
    parent = parent_result.scalar_one_or_none()
    if not parent:
      raise HTTPException(status_code=404, detail="Parent group not found")

  # Check name uniqueness within parent scope
  query = select(Group).where(Group.name == group_in.name)
  if group_in.parent_id is not None:
    query = query.where(Group.parent_id == group_in.parent_id)
  else:
    query = query.where(Group.parent_id.is_(None))

  existing = await session.execute(query)
  if existing.scalar_one_or_none():
    raise HTTPException(
      status_code=400,
      detail="Group with this name already exists in the specified parent",
    )

  group = Group(name=group_in.name, parent_id=group_in.parent_id)
  session.add(group)
  await session.commit()
  await session.refresh(group)

  # Reload with all relationships eagerly loaded
  query = (
    select(Group)
    .options(
      selectinload(Group.papers).selectinload(Paper.tags),
      selectinload(Group.children).selectinload(Group.papers).selectinload(Paper.tags),
    )
    .where(Group.id == group.id)
  )
  result = await session.execute(query)
  group = result.scalar_one()

  # Recursively load all nested children to prevent lazy loading issues
  await load_all_nested_children(session, group)

  return GroupSchema.model_validate(group)


@router.get("/groups/{group_id}", response_model=GroupSchema)
async def get_group(group_id: int, session: AsyncSession = Depends(get_db)):
  query = (
    select(Group)
    .options(
      selectinload(Group.papers).selectinload(Paper.tags),
      selectinload(Group.children).selectinload(Group.papers).selectinload(Paper.tags),
    )
    .where(Group.id == group_id)
  )
  result = await session.execute(query)
  group = result.scalar_one_or_none()

  if not group:
    raise HTTPException(status_code=404, detail="Group not found")

  # Ensure all relationships are loaded by accessing them while session is active
  _ = list(group.papers) if group.papers else []
  # Recursively load all nested children to prevent lazy loading issues
  await load_all_nested_children(session, group)

  return GroupSchema.model_validate(group)


@router.patch("/groups/{group_id}", response_model=GroupSchema)
async def update_group(
  group_id: int, group_update: GroupUpdate, session: AsyncSession = Depends(get_db)
):
  query = select(Group).where(Group.id == group_id)
  result = await session.execute(query)
  group = result.scalar_one_or_none()

  if not group:
    raise HTTPException(status_code=404, detail="Group not found")

  # Handle parent_id update with cycle prevention
  new_parent_id = (
    group_update.parent_id if group_update.parent_id is not None else group.parent_id
  )

  if group_update.parent_id is not None and group_update.parent_id != group.parent_id:
    # Validate new parent exists if provided
    if new_parent_id is not None:
      parent_result = await session.execute(
        select(Group).where(Group.id == new_parent_id)
      )
      parent = parent_result.scalar_one_or_none()
      if not parent:
        raise HTTPException(status_code=404, detail="Parent group not found")

    # Check for cycles
    if await check_cycle(session, group_id, new_parent_id):  # ty:ignore[invalid-argument-type]
      raise HTTPException(
        status_code=400, detail="Cannot set parent: would create a cycle"
      )

    group.parent_id = new_parent_id

  # Handle name update with parent-scoped uniqueness
  if group_update.name is not None:
    query = select(Group).where(Group.name == group_update.name, Group.id != group_id)
    if new_parent_id is not None:
      query = query.where(Group.parent_id == new_parent_id)
    else:
      query = query.where(Group.parent_id.is_(None))

    existing = await session.execute(query)
    if existing.scalar_one_or_none():
      raise HTTPException(
        status_code=400,
        detail="Group with this name already exists in the specified parent",
      )
    group.name = group_update.name

  await session.commit()
  await session.refresh(group)

  # Reload with all relationships eagerly loaded
  query = (
    select(Group)
    .options(
      selectinload(Group.papers).selectinload(Paper.tags),
      selectinload(Group.children).selectinload(Group.papers).selectinload(Paper.tags),
    )
    .where(Group.id == group_id)
  )
  result = await session.execute(query)
  group = result.scalar_one()

  # Recursively load all nested children to prevent lazy loading issues
  await load_all_nested_children(session, group)

  return GroupSchema.model_validate(group)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(group_id: int, session: AsyncSession = Depends(get_db)):
  query = (
    select(Group).options(selectinload(Group.children)).where(Group.id == group_id)
  )
  result = await session.execute(query)
  group = result.scalar_one_or_none()

  if not group:
    raise HTTPException(status_code=404, detail="Group not found")

  # Check if group has children
  if group.children and len(group.children) > 0:
    raise HTTPException(
      status_code=400,
      detail="Cannot delete group with sub-groups. Please delete or move sub-groups first.",
    )

  await session.delete(group)
  await session.commit()

  return None
