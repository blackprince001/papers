from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.ai_features import router as ai_features_router
from app.api.annotations import router as annotations_router
from app.api.chat import router as chat_router
from app.api.duplicates import router as duplicates_router
from app.api.export import router as export_router
from app.api.groups import router as groups_router
from app.api.ingest import router as ingest_router
from app.api.papers import router as papers_router
from app.api.relationships import router as relationships_router
from app.api.search import router as search_router
from app.api.statistics import router as statistics_router
from app.api.tags import router as tags_router
from app.core.config import settings
from app.core.database import init_db

storage_path = Path(settings.STORAGE_PATH)
storage_path.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
  await init_db()
  yield


app = FastAPI(title="Nexus Research Engine", version="1.0.0", lifespan=lifespan)

app.add_middleware(
  CORSMiddleware,  # type: ignore[arg-type]
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)
app.include_router(ingest_router, prefix="/api/v1")
app.include_router(papers_router, prefix="/api/v1")
app.include_router(annotations_router, prefix="/api/v1")
app.include_router(groups_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(tags_router, prefix="/api/v1")
app.include_router(statistics_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
app.include_router(duplicates_router, prefix="/api/v1")
app.include_router(relationships_router, prefix="/api/v1")
app.include_router(ai_features_router, prefix="/api/v1")

app.mount("/storage", StaticFiles(directory=str(storage_path)), name="storage")


@app.get("/")
def read_root():
  return {"message": "Welcome to Nexus API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
  return {"status": "healthy"}
