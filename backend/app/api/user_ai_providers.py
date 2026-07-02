"""API endpoints for managing a user's AI providers (multi-provider BYO)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.crud.user_ai_provider import (
  create_user_ai_provider,
  delete_user_ai_provider,
  list_user_ai_providers,
  set_default_provider,
  update_user_ai_provider,
)
from app.dependencies import CurrentUser, get_db
from app.schemas.user_ai_provider import (
  UserAIProviderCreate,
  UserAIProviderResponse,
  UserAIProviderUpdate,
)

router = APIRouter()


@router.get(
  "/user/ai-providers",
  response_model=list[UserAIProviderResponse],
)
async def list_my_ai_providers(
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """List all of the current user's saved AI providers."""
  providers = await list_user_ai_providers(db_session, user.id)  # type: ignore[arg-type]
  return [UserAIProviderResponse.model_validate(p) for p in providers]


@router.post(
  "/user/ai-providers",
  response_model=UserAIProviderResponse,
  status_code=201,
)
async def create_my_ai_provider(
  data: UserAIProviderCreate,
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Create a new AI provider for the current user."""
  provider = await create_user_ai_provider(db_session, user.id, data)  # type: ignore[arg-type]
  return UserAIProviderResponse.model_validate(provider)


@router.patch(
  "/user/ai-providers/{provider_id}",
  response_model=UserAIProviderResponse,
)
async def update_my_ai_provider(
  provider_id: int,
  data: UserAIProviderUpdate,
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Partially update one of the current user's AI providers."""
  provider = await update_user_ai_provider(db_session, user.id, provider_id, data)  # type: ignore[arg-type]
  if not provider:
    raise HTTPException(status_code=404, detail="Provider not found")
  return UserAIProviderResponse.model_validate(provider)


@router.put(
  "/user/ai-providers/{provider_id}/default",
  response_model=UserAIProviderResponse,
)
async def set_my_default_ai_provider(
  provider_id: int,
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Mark one of the current user's providers as the default."""
  provider = await set_default_provider(db_session, user.id, provider_id)  # type: ignore[arg-type]
  if not provider:
    raise HTTPException(status_code=404, detail="Provider not found")
  return UserAIProviderResponse.model_validate(provider)


@router.delete("/user/ai-providers/{provider_id}", status_code=204)
async def delete_my_ai_provider(
  provider_id: int,
  user: CurrentUser,
  db_session: AsyncSession = Depends(get_db),
):
  """Delete one of the current user's AI providers."""
  deleted = await delete_user_ai_provider(db_session, user.id, provider_id)  # type: ignore[arg-type]
  if not deleted:
    raise HTTPException(status_code=404, detail="Provider not found")
  return None
