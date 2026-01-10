from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  PROJECT_NAME: str = "Research Engine"
  API_V1_STR: str = "/api/v1"
  DATABASE_URL: str = Field(default="")
  STORAGE_PATH: str = "./storage/papers"
  EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
  GOOGLE_API_KEY: str = ""
  GENAI_MODEL: str = "gemini-3-flash-preview"
  DEBUG: bool = False
  PORT: int = 8000

  # Database connection components (optional, used to construct DATABASE_URL if not set)
  DB_HOST: str = "localhost"
  DB_PORT: str = "5433"
  DB_USER: str = "postgres"
  DB_PASSWORD: str = "postgres"
  DB_NAME: str = "nexus"

  model_config = SettingsConfigDict(
    env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore"
  )

  def model_post_init(self, __context):
    # If DATABASE_URL is not explicitly set, construct it from components
    if not self.DATABASE_URL:
      self.DATABASE_URL = f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


settings = Settings()
