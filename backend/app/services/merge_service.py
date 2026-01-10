from typing import Any, Dict, cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.paper import Paper


class MergeService:
  async def merge_papers(
    self, session: AsyncSession, primary_paper_id: int, duplicate_paper_id: int
  ) -> Paper:
    """Merge duplicate paper into primary paper."""
    primary_query = select(Paper).where(Paper.id == primary_paper_id)
    duplicate_query = select(Paper).where(Paper.id == duplicate_paper_id)

    primary_result = await session.execute(primary_query)
    duplicate_result = await session.execute(duplicate_query)

    primary_paper = primary_result.scalar_one_or_none()
    duplicate_paper = duplicate_result.scalar_one_or_none()

    if not primary_paper or not duplicate_paper:
      raise ValueError("One or both papers not found")

    # Merge annotations
    duplicate_annotations_query = select(Annotation).where(
      Annotation.paper_id == duplicate_paper_id
    )
    duplicate_annotations_result = await session.execute(duplicate_annotations_query)
    duplicate_annotations = duplicate_annotations_result.scalars().all()

    for ann in duplicate_annotations:
      ann.paper_id = primary_paper_id

    # Merge tags (add unique tags from duplicate)
    existing_tag_ids = {tag.id for tag in primary_paper.tags}
    for tag in duplicate_paper.tags:
      if tag.id not in existing_tag_ids:
        primary_paper.tags.append(tag)

    # Merge groups (add unique groups from duplicate)
    existing_group_ids = {group.id for group in primary_paper.groups}
    for group in duplicate_paper.groups:
      if group.id not in existing_group_ids:
        primary_paper.groups.append(group)

    # FIX: Merge metadata (Handle JSON mutation and Type Errors)
    if duplicate_paper.metadata_json:
      # Cast both to dicts for the type checker
      dup_meta = cast(Dict[str, Any], duplicate_paper.metadata_json)

      if not primary_paper.metadata_json:
        primary_paper.metadata_json = dup_meta
      else:
        # Create a fresh copy to ensure SQLAlchemy tracks the change
        primary_meta = dict(cast(Dict[str, Any], primary_paper.metadata_json))

        # Merge missing fields from duplicate
        for key, value in dup_meta.items():
          if key not in primary_meta or not primary_meta[key]:
            primary_meta[key] = value

        # Reassign to trigger dirty tracking
        primary_paper.metadata_json = primary_meta

    # Merge reading progress (keep maximum values)
    primary_paper.reading_time_minutes = max(
      cast(int, primary_paper.reading_time_minutes or 0),
      cast(int, duplicate_paper.reading_time_minutes or 0),
    )

    # Casting pages to handle Column | int union
    dup_page = cast(int | None, duplicate_paper.last_read_page)
    pri_page = cast(int | None, primary_paper.last_read_page)

    if dup_page and (not pri_page or dup_page > pri_page):
      primary_paper.last_read_page = dup_page

    # Mark duplicate as merged
    duplicate_paper.merged_from_paper_id = primary_paper_id
    duplicate_paper.is_duplicate_of = primary_paper_id

    # Update primary paper metadata with casts to resolve Column[str] vs str
    if not primary_paper.doi and duplicate_paper.doi:
      primary_paper.doi = cast(str, duplicate_paper.doi)
    if not primary_paper.url and duplicate_paper.url:
      primary_paper.url = cast(str, duplicate_paper.url)

    await session.commit()
    await session.refresh(primary_paper)

    return primary_paper


merge_service = MergeService()
