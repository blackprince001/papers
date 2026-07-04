"""Pydantic schemas for user AI provider records (multi-provider BYO)."""

from datetime import datetime

from pydantic import BaseModel, Field


class UserAIProviderCreate(BaseModel):
  """Request schema for creating a provider."""

  label: str = Field(default="", description="Human-friendly name for this provider")
  provider: str = Field(
    default="openai-compatible",
    description="Provider type: 'openai', 'anthropic', 'deepseek', 'gemini', "
    "'ollama', 'vllm', 'openai-compatible'",
  )
  api_key: str = Field(default="", description="API key for the provider")
  base_url: str | None = Field(
    default=None, description="Base URL for OpenAI-compatible providers"
  )
  model: str = Field(default="", description="Model name for chat/generation")
  timeout_seconds: int | None = Field(
    default=None, description="HTTP request timeout in seconds (default 120)"
  )
  is_default: bool = Field(
    default=False, description="Make this the user's default provider"
  )


class UserAIProviderUpdate(BaseModel):
  """Request schema for partial updates."""

  label: str | None = None
  provider: str | None = None
  api_key: str | None = None
  base_url: str | None = None
  model: str | None = None
  timeout_seconds: int | None = None
  is_default: bool | None = None
  is_active: bool | None = None


class UserAIProviderResponse(BaseModel):
  """Response schema (API key never returned, only whether one is set)."""

  id: int
  user_id: int
  label: str
  provider: str
  has_api_key: bool
  base_url: str | None = None
  model: str
  timeout_seconds: int | None = None
  is_default: bool
  is_active: bool
  created_at: datetime
  updated_at: datetime

  model_config = {"from_attributes": True}
