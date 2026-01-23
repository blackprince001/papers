from typing import AsyncGenerator

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import settings

# Async engine for FastAPI
engine = create_async_engine(
  settings.DATABASE_URL,
  echo=settings.DEBUG,
  future=True,
)

AsyncSessionLocal = async_sessionmaker(
  engine,
  class_=AsyncSession,
  expire_on_commit=False,
  autocommit=False,
  autoflush=False,
)

# Sync engine for Celery workers
# Convert async URL to sync (postgresql+asyncpg -> postgresql+psycopg2)
_sync_database_url = settings.DATABASE_URL.replace(
  "postgresql+asyncpg", "postgresql+psycopg2"
)

sync_engine = create_engine(
  _sync_database_url,
  echo=settings.DEBUG,
  future=True,
)

SyncSessionLocal = sessionmaker(
  bind=sync_engine,
  class_=Session,
  expire_on_commit=False,
  autocommit=False,
  autoflush=False,
)

Base = declarative_base()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
  async with AsyncSessionLocal() as session:
    try:
      yield session
      await session.commit()
    except Exception:
      await session.rollback()
      raise
    finally:
      await session.close()


async def init_db() -> None:
  async with engine.begin() as conn:
    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
  await engine.dispose()
