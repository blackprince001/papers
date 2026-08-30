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
  SERPAPI_KEY: str = ""
  SEMANTIC_SCHOLAR_API_KEY: str = ""
  OPENALEX_API_KEY: str = ""
  AGENT_MAX_TURNS: int = 25
  # Emergency kill switch for new starts and resumes. The durable lifecycle is
  # enabled by default; set false during an incident or planned maintenance.
  DEEP_RESEARCH_MUTATIONS_ENABLED: bool = True
  DEEP_RESEARCH_MAX_QUESTION_LENGTH: int = 4000
  DEEP_RESEARCH_MAX_ACTIVE_RUNS: int = 3
  DEEP_RESEARCH_MAX_EVENT_BYTES: int = 64 * 1024
  DEEP_RESEARCH_MAX_REPORT_BYTES: int = 2 * 1024 * 1024
  DEEP_RESEARCH_MAX_TURNS: int = 50
  DEEP_RESEARCH_MAX_EVIDENCE_ITEMS: int = 120
  INGESTION_MAX_DOWNLOAD_BYTES: int = 100 * 1024 * 1024
  INGESTION_MAX_REDIRECTS: int = 5
  AI_TASK_RATE_LIMIT: int = Field(
    default=10, description="Max AI tasks per minute per user (Celery)"
  )
  DEBUG: bool = False
  PORT: int = 8000

  DB_HOST: str = ""
  DB_PORT: str = ""
  DB_USER: str = ""
  DB_PASSWORD: str = ""
  DB_NAME: str = ""

  REDIS_HOST: str = "localhost"
  REDIS_PORT: int = 6379
  REDIS_DB: int = 0
  REDIS_PASSWORD: str = ""

  JWT_SECRET_KEY: str = ""
  AI_KEY_ENCRYPTION_KEY: str = ""
  JWT_ALGORITHM: str = "HS256"
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
  REFRESH_TOKEN_EXPIRE_DAYS: int = 7

  GOOGLE_CLIENT_ID: str = ""

  ADMIN_USERNAME: str = ""
  ADMIN_PASSWORD: str = ""

  FRONTEND_URL: str = "http://localhost:5173"

  RESEND_API_KEY: str | None = None
  EMAIL_FROM: str = "noreply@papers.local"
  EMAIL_ENABLED: bool = False
  APP_URL: str = "http://localhost:5173"

  @property
  def REDIS_URL(self) -> str:
    """Construct Redis URL from components."""
    if self.REDIS_PASSWORD:
      return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
    return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

  @property
  def CELERY_BROKER_URL(self) -> str:
    """Celery broker URL (Redis)."""
    return self.REDIS_URL

  @property
  def CELERY_RESULT_BACKEND(self) -> str:
    """Celery result backend URL (Redis)."""
    return self.REDIS_URL

  model_config = SettingsConfigDict(
    env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
  )

  def model_post_init(self, __context):
    # Auto-generate JWT secret in debug mode
    if not self.JWT_SECRET_KEY:
      if self.DEBUG:
        import secrets

        self.JWT_SECRET_KEY = secrets.token_hex(32)
      else:
        warnings.warn(
          "JWT_SECRET_KEY is not set. Set it for production use.",
          UserWarning,
          stacklevel=2,
        )
        import secrets

        self.JWT_SECRET_KEY = secrets.token_hex(32)

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
