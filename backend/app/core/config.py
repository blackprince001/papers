import warnings

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Development defaults - can be overridden by environment variables
_DEV_DB_HOST = "localhost"
_DEV_DB_PORT = "5433"
_DEV_DB_USER = "postgres"
_DEV_DB_PASSWORD = "postgres"
_DEV_DB_NAME = "nexus"


class Settings(BaseSettings):
  PROJECT_NAME: str = "Research Engine"
  API_V1_STR: str = "/api/v1"
  DATABASE_URL: str = Field(default="")
  STORAGE_PATH: str = "./storage/papers"
  EMBEDDING_MODEL: str = "gemini-embedding-001"
  EMBEDDING_DIMENSION: int = 768
  GOOGLE_API_KEY: str = ""
  GENAI_MODEL: str = "gemini-3-flash-preview"
  DEBUG: bool = False
  PORT: int = 8000

  # Database connection components (optional, used to construct DATABASE_URL if not set)
  # These have development defaults but should be explicitly set in production
  DB_HOST: str = ""
  DB_PORT: str = ""
  DB_USER: str = ""
  DB_PASSWORD: str = ""
  DB_NAME: str = ""

  model_config = SettingsConfigDict(
    env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
  )

  def model_post_init(self, __context):
    # If DATABASE_URL is not explicitly set, construct it from components
    if not self.DATABASE_URL:
      # Use provided values or fall back to dev defaults
      db_host = self.DB_HOST or _DEV_DB_HOST
      db_port = self.DB_PORT or _DEV_DB_PORT
      db_user = self.DB_USER or _DEV_DB_USER
      db_password = self.DB_PASSWORD or _DEV_DB_PASSWORD
      db_name = self.DB_NAME or _DEV_DB_NAME

      # Track if using any defaults
      using_defaults = not all(
        [self.DB_HOST, self.DB_USER, self.DB_PASSWORD, self.DB_NAME]
      )

      # Warn in non-debug mode if using development defaults
      if not self.DEBUG and using_defaults:
        warnings.warn(
          "Using development database defaults in non-debug mode. "
          "Set DATABASE_URL or DB_* environment variables for production.",
          UserWarning,
          stacklevel=2,
        )

      self.DATABASE_URL = (
        f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
      )


settings = Settings()
