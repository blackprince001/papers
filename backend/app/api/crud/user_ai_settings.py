"""CRUD operations for user AI provider settings."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_ai_settings import UserAISettings
from app.schemas.user_ai_settings import UserAISettingsCreate, UserAISettingsUpdate


async def get_user_ai_settings(
  db_session: AsyncSession, user_id: int
) -> UserAISettings | None:
  """Get AI settings for a user.

  Args:
      db_session: Database session
      user_id: User ID

  Returns:
      Settings record or None if not configured
  """
  query = select(UserAISettings).where(UserAISettings.user_id == user_id)
  result = await db_session.execute(query)
  return result.scalar_one_or_none()


async def create_user_ai_settings(
  db_session: AsyncSession, user_id: int, data: UserAISettingsCreate
) -> UserAISettings:
  """Create AI settings for a user.

  Args:
      db_session: Database session
      user_id: User ID
      data: Settings data

  Returns:
      Created settings record
  """
  settings = UserAISettings(user_id=user_id, provider=data.provider)
  if data.api_key:
    settings.set_api_key(data.api_key)
  if data.base_url:
    settings.base_url = data.base_url  # type: ignore[assignment]
  if data.model:
    settings.model = data.model  # type: ignore[assignment]

  db_session.add(settings)
  await db_session.commit()
  await db_session.refresh(settings)
  return settings


async def update_user_ai_settings(
  db_session: AsyncSession,
  user_id: int,
  data: UserAISettingsUpdate,
) -> UserAISettings | None:
  """Update AI settings for a user. Creates if not exists.

  Args:
      db_session: Database session
      user_id: User ID
      data: Settings update data

  Returns:
      Updated settings record
  """
  settings = await get_user_ai_settings(db_session, user_id)
  if not settings:
    create_data = UserAISettingsCreate(
      provider=data.provider or "openai-compatible",
      api_key=data.api_key or "",
      base_url=data.base_url,
      model=data.model or "",
    )
    return await create_user_ai_settings(db_session, user_id, create_data)

  update_data = data.model_dump(exclude_unset=True)
  if "api_key" in update_data:
    if update_data["api_key"]:
      settings.set_api_key(update_data["api_key"])
    del update_data["api_key"]

  for field, value in update_data.items():
    if value is not None:
      setattr(settings, field, value)

  await db_session.commit()
  await db_session.refresh(settings)
  return settings


async def delete_user_ai_settings(db_session: AsyncSession, user_id: int) -> bool:
  """Delete AI settings for a user.

  Args:
      db_session: Database session
      user_id: User ID

  Returns:
      True if deleted, False if not found
  """
  settings = await get_user_ai_settings(db_session, user_id)
  if not settings:
    return False
  await db_session.delete(settings)
  await db_session.commit()
  return True
