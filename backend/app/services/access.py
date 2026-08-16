from typing import Literal

from sqlalchemy import Select, case, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.paper import Paper, paper_group_association
from app.models.sharing import GroupShare, PaperShare

PaperPermission = Literal["owner", "editor", "viewer"]


def visible_papers_clause(user_id: int):
  from app.models.group import Group as GroupModel

  owned = Paper.uploaded_by_id == user_id
  direct = Paper.id.in_(
    select(PaperShare.paper_id).where(PaperShare.recipient_id == user_id)
  )

  # Subtree CTE for group shares
  base = select(GroupShare.group_id.label("id")).where(
    GroupShare.recipient_id == user_id
  )
  shared_tree = base.cte(name="paper_shared_tree", recursive=True)
  shared_tree = shared_tree.union_all(
    select(GroupModel.id.label("id")).where(GroupModel.parent_id == shared_tree.c.id)
  )
  via_group = Paper.id.in_(
    select(paper_group_association.c.paper_id).where(
      paper_group_association.c.group_id.in_(select(shared_tree.c.id))
    )
  )
  return or_(owned, direct, via_group)


def visible_groups_clause(user_id: int):
  from app.models.group import Group as GroupModel

  # CTE: start with directly shared groups, recurse into children
  base = select(GroupShare.group_id.label("id")).where(
    GroupShare.recipient_id == user_id
  )
  shared_tree = base.cte(name="shared_tree", recursive=True)
  shared_tree = shared_tree.union_all(
    select(GroupModel.id.label("id")).where(GroupModel.parent_id == shared_tree.c.id)
  )
  return or_(
    Group.user_id == user_id,
    Group.id.in_(select(shared_tree.c.id)),
  )


def apply_visible_papers_filter(query: Select, user_id: int | None) -> Select:
  if user_id is None:
    return query
  return query.where(visible_papers_clause(user_id))


async def get_effective_paper_permission(
  session: AsyncSession, user_id: int, paper: Paper
) -> PaperPermission | None:
  if paper.uploaded_by_id == user_id:
    return "owner"

  direct_result = await session.execute(
    select(PaperShare.permission)
    .where(PaperShare.paper_id == paper.id)
    .where(PaperShare.recipient_id == user_id)
    .limit(1)
  )
  direct_permission = direct_result.scalar_one_or_none()
  if direct_permission:
    return str(direct_permission)

  group_result = await session.execute(
    select(
      func.max(
        case(
          (GroupShare.permission == "editor", 2),
          else_=1,
        )
      )
    )
    .select_from(paper_group_association)
    .join(GroupShare, GroupShare.group_id == paper_group_association.c.group_id)
    .where(paper_group_association.c.paper_id == paper.id)
    .where(GroupShare.recipient_id == user_id)
  )
  group_rank = group_result.scalar_one_or_none()
  if group_rank == 2:
    return "editor"
  if group_rank == 1:
    return "viewer"
  return None


def apply_agent_paper_visibility_filter(
  query: Select,
  user_id: int | None,
  *,
  is_admin: bool = False,
) -> Select:
  """Apply the fail-closed paper scope used by AI agent tools.

  API routes use ``None`` to mean an administrator/no filter. Agent tools must
  not inherit that convention: a missing identity returns zero rows unless the
  request explicitly carries the administrator capability.
  """
  if is_admin:
    return query
  if user_id is None:
    return query.where(false())
  return query.where(visible_papers_clause(user_id))
