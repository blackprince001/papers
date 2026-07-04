"""CRUD operations for user AI provider records (multi-provider BYO)."""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_ai_provider import UserAIProvider
from app.schemas.user_ai_provider import (
  UserAIProviderCreate,
  UserAIProviderUpdate,
)


async def list_user_ai_providers(
  db_session: AsyncSession, user_id: int
) -> list[UserAIProvider]:
  """Return all providers for a user, default first then newest."""
  query = (
    select(UserAIProvider)
    .where(UserAIProvider.user_id == user_id)
    .order_by(UserAIProvider.is_default.desc(), UserAIProvider.created_at.desc())
  )
  result = await db_session.execute(query)
  return list(result.scalars().all())


async def get_user_ai_provider(
  db_session: AsyncSession, user_id: int, provider_id: int
) -> UserAIProvider | None:
  """Return a single provider owned by the user, or None."""
  query = select(UserAIProvider).where(
    UserAIProvider.id == provider_id,
    UserAIProvider.user_id == user_id,
  )
  result = await db_session.execute(query)
  return result.scalar_one_or_none()


async def get_default_provider(
  db_session: AsyncSession, user_id: int
) -> UserAIProvider | None:
  """Return the user's default provider, falling back to the first active one."""
  query = (
    select(UserAIProvider)
    .where(
      UserAIProvider.user_id == user_id,
      UserAIProvider.is_active.is_(True),
    )
    .order_by(UserAIProvider.is_default.desc(), UserAIProvider.created_at.asc())
  )
  result = await db_session.execute(query)
  return result.scalars().first()


async def _clear_other_defaults(
  db_session: AsyncSession, user_id: int, keep_id: int | None
) -> None:
  """Unset ``is_default`` on every provider for the user except ``keep_id``."""
  stmt = (
    update(UserAIProvider)
    .where(
      UserAIProvider.user_id == user_id,
      UserAIProvider.is_default.is_(True),
    )
    .values(is_default=False)
  )
  if keep_id is not None:
    stmt = stmt.where(UserAIProvider.id != keep_id)
  await db_session.execute(stmt)


async def create_user_ai_provider(
  db_session: AsyncSession, user_id: int, data: UserAIProviderCreate
) -> UserAIProvider:
  """Create a provider. The first provider for a user becomes the default."""
  existing = await list_user_ai_providers(db_session, user_id)
  make_default = data.is_default or not existing

  provider = UserAIProvider(
    user_id=user_id,
    label=data.label or data.provider,
    provider=data.provider,
    base_url=data.base_url,
    model=data.model,
    timeout_seconds=data.timeout_seconds,
    is_default=make_default,
  )
  if data.api_key:
    provider.set_api_key(data.api_key)

  db_session.add(provider)
  await db_session.flush()
  if make_default:
    await _clear_other_defaults(db_session, user_id, keep_id=provider.id)  # type: ignore[arg-type]

  await db_session.commit()
  await db_session.refresh(provider)
  return provider


async def update_user_ai_provider(
  db_session: AsyncSession,
  user_id: int,
  provider_id: int,
  data: UserAIProviderUpdate,
) -> UserAIProvider | None:
  """Partially update a provider owned by the user."""
  provider = await get_user_ai_provider(db_session, user_id, provider_id)
  if not provider:
    return None

  update_data = data.model_dump(exclude_unset=True)

  if "api_key" in update_data:
    # Empty string means "leave the stored key unchanged".
    if update_data["api_key"]:
      provider.set_api_key(update_data["api_key"])
    del update_data["api_key"]

  becoming_default = update_data.get("is_default") is True

  for field, value in update_data.items():
    setattr(provider, field, value)

  if becoming_default:
    await _clear_other_defaults(db_session, user_id, keep_id=provider.id)  # type: ignore[arg-type]

  await db_session.commit()
  await db_session.refresh(provider)
  return provider


async def set_default_provider(
  db_session: AsyncSession, user_id: int, provider_id: int
) -> UserAIProvider | None:
  """Mark a provider as the user's default, unsetting any other."""
  provider = await get_user_ai_provider(db_session, user_id, provider_id)
  if not provider:
    return None
  provider.is_default = True  # type: ignore[assignment]
  await _clear_other_defaults(db_session, user_id, keep_id=provider.id)  # type: ignore[arg-type]
  await db_session.commit()
  await db_session.refresh(provider)
  return provider


async def delete_user_ai_provider(
  db_session: AsyncSession, user_id: int, provider_id: int
) -> bool:
  """Delete a provider. If it was the default, promote another active one."""
  provider = await get_user_ai_provider(db_session, user_id, provider_id)
  if not provider:
    return False

  was_default = bool(provider.is_default)
  await db_session.delete(provider)
  await db_session.flush()

  if was_default:
    replacement = await get_default_provider(db_session, user_id)
    if replacement is not None:
      replacement.is_default = True  # type: ignore[assignment]

  await db_session.commit()
  return True
