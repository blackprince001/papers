import asyncio
import json
from typing import List, Optional, cast

from fastapi import (
  APIRouter,
  Body,
  Depends,
  File,
  Form,
  HTTPException,
  UploadFile,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.dependencies import get_db
from app.models.paper import Paper as PaperModel
from app.schemas.paper import Paper, PaperBatchCreate, PaperCreate, PaperUploadResponse
from app.services.duplicate_detection import duplicate_detection_service
from app.services.ingestion import DuplicatePaperError, ingestion_service
from app.services.url_parser import url_parser
from app.tasks.paper_processing import process_paper_full

router = APIRouter()


def _escape_like_pattern(value: str) -> str:
  """Escape special characters for SQL LIKE patterns.

  This prevents SQL injection and ensures special characters like % and _ are
  treated as literals rather than wildcards.
  """
  return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _dispatch_paper_processing(paper_id: int, file_path: str) -> str | None:
  """Dispatch Celery task for paper processing. Returns task_id if dispatched.

  If Redis/Celery is unavailable, logs a warning and returns None.
  Paper ingestion will still succeed, just without AI processing.
  """
  import logging

  logger = logging.getLogger(__name__)

  try:
    result = process_paper_full.delay(paper_id, file_path)
    logger.info(f"Dispatched paper processing task {result.id} for paper {paper_id}")
    return result.id
  except Exception as e:
    # If Celery/Redis is not available, log warning but don't fail ingestion
    logger.warning(
      f"Could not dispatch background processing for paper {paper_id}: {e}. "
      "Paper was saved but AI processing will not run. "
      "Check Redis/Celery worker status."
    )
    return None


@router.post("/ingest", response_model=Paper, status_code=201)
async def ingest_paper_endpoint(
  paper_in: PaperCreate,
  check_duplicates: bool = True,
  session: AsyncSession = Depends(get_db),
):
  try:
    # Check for duplicates before ingestion if requested
    potential_duplicates = []
    if check_duplicates:
      # Check for DOI match first (highest confidence)
      if paper_in.doi:
        existing_doi = await session.execute(
          select(PaperModel).where(PaperModel.doi == paper_in.doi)
        )
        existing = existing_doi.scalar_one_or_none()
        if existing:
          return Paper.model_validate(existing)

      # Check for similar titles
      if paper_in.title:
        safe_title = _escape_like_pattern(paper_in.title[:50])
        existing_title = await session.execute(
          select(PaperModel).where(
            PaperModel.title.ilike(f"%{safe_title}%", escape="\\")
          )
        )
        similar = existing_title.scalars().all()
        if similar:
          # Calculate similarity scores
          for sim_paper in similar[:5]:  # Limit to top 5
            similarity = duplicate_detection_service.calculate_title_similarity(
              paper_in.title, sim_paper.title or ""
            )
            if similarity >= 0.8:
              potential_duplicates.append(
                {"paper_id": sim_paper.id, "confidence": similarity, "method": "title"}
              )
    paper = await ingestion_service.ingest_paper(
      db_session=session,
      url=str(paper_in.url),
      title=paper_in.title,
      doi=paper_in.doi,
      group_ids=paper_in.group_ids,
    )

    # Dispatch Celery task for full AI processing
    paper_response = Paper.model_validate(paper)
    if paper.file_path:
      task_id = _dispatch_paper_processing(
        cast(int, paper.id), cast(str, paper.file_path)
      )
      if task_id:
        paper_response.task_id = task_id
        paper_response.background_processing_message = "Processing in background: extracting citations, generating summary, key findings, and reading guide."

    return paper_response
  except DuplicatePaperError as e:
    if e.existing_paper:
      return Paper.model_validate(e.existing_paper)
    raise HTTPException(status_code=409, detail=str(e)) from e
  except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e)) from e
  except Exception as e:
    raise HTTPException(
      status_code=500, detail=f"Failed to ingest paper: {str(e)}"
    ) from e


MAX_FILE_SIZE = 100 * 1024 * 1024
MAX_FILES = 10


@router.post("/ingest/upload", response_model=PaperUploadResponse, status_code=201)
async def upload_files_endpoint(
  files: List[UploadFile] = File(...),
  group_ids: Optional[str] = Form(None),
  session: AsyncSession = Depends(get_db),
):
  if len(files) > MAX_FILES:
    raise HTTPException(
      status_code=400, detail=f"Maximum {MAX_FILES} files allowed per upload"
    )

  if len(files) == 0:
    raise HTTPException(status_code=400, detail="At least one file is required")

  parsed_group_ids = None
  if group_ids:
    try:
      parsed_group_ids = json.loads(group_ids)
      if not isinstance(parsed_group_ids, list):
        raise ValueError("group_ids must be a list")
    except (json.JSONDecodeError, ValueError) as e:
      raise HTTPException(status_code=400, detail=f"Invalid group_ids format: {str(e)}")  # noqa: B904

  # Validate all files first
  file_contents = {}
  valid_files = []
  errors = []
  paper_ids = []

  for file in files:
    try:
      content = await file.read()

      if len(content) > MAX_FILE_SIZE:
        errors.append(
          {
            "filename": file.filename,
            "error": f"File size exceeds {MAX_FILE_SIZE / (1024 * 1024)}MB limit",
          }
        )
        continue

      if not file.filename or not file.filename.lower().endswith(".pdf"):
        errors.append(
          {"filename": file.filename, "error": "Only PDF files are allowed"}
        )
        continue

      if file.content_type and "pdf" not in file.content_type.lower():
        errors.append(
          {
            "filename": file.filename,
            "error": "Invalid file type. Only PDF files are allowed",
          }
        )
        continue

      file_contents[file.filename] = content
      valid_files.append(file)
    except Exception as e:
      errors.append({"filename": file.filename or "unknown", "error": str(e)})

  # Process valid files in parallel
  async def process_file(
    file: UploadFile,
  ) -> tuple[Optional[int], Optional[str], Optional[dict]]:
    """Process a single file and return (paper_id, file_path, error_dict)."""
    try:
      content = file_contents[file.filename]

      # Use a separate session for each file to avoid transaction conflicts
      from app.core.database import AsyncSessionLocal

      async_session = AsyncSessionLocal()

      try:
        paper = await ingestion_service.ingest_paper_from_file(
          db_session=async_session,
          file_content=content,
          filename=cast(str, file.filename),
          title=None,
          doi=None,
          group_ids=parsed_group_ids,
        )
        await async_session.commit()

        return cast(int, paper.id), cast(str, paper.file_path), None
      except DuplicatePaperError as e:
        await async_session.rollback()
        if e.existing_paper:
          return (
            cast(int, e.existing_paper.id),
            cast(str, e.existing_paper.file_path),
            None,
          )
        return (
          None,
          None,
          {"filename": file.filename or "unknown", "error": f"Duplicate paper: {e}"},
        )
      except Exception as e:
        await async_session.rollback()
        return (None, None, {"filename": file.filename or "unknown", "error": str(e)})
      finally:
        await async_session.close()
    except Exception as e:
      return (None, None, {"filename": file.filename or "unknown", "error": str(e)})

  # Process all files in parallel
  import asyncio

  if valid_files:
    results = await asyncio.gather(
      *[process_file(file) for file in valid_files], return_exceptions=True
    )

    celery_task_count = 0
    for result in results:
      if isinstance(result, Exception):
        errors.append({"filename": "unknown", "error": str(result)})
      elif isinstance(result, tuple):
        paper_id, file_path, error = result
        if paper_id:
          paper_ids.append(paper_id)
          # Dispatch Celery task for processing
          if file_path:
            task_id = _dispatch_paper_processing(paper_id, file_path)
            if task_id:
              celery_task_count += 1
        elif error:
          errors.append(error)

    # Generate message about background processing
    message = None
    if len(paper_ids) > 0:
      if len(paper_ids) == 1:
        if celery_task_count > 0:
          message = "Paper uploaded successfully. AI processing started (citations, summary, findings, reading guide)."
        else:
          message = "Paper uploaded successfully."
      else:
        if celery_task_count > 0:
          message = f"{len(paper_ids)} papers uploaded. AI processing started for {celery_task_count} paper(s) (citations, summary, findings, reading guide)."
        else:
          message = f"{len(paper_ids)} papers uploaded successfully."

  return PaperUploadResponse(paper_ids=paper_ids, errors=errors, message=message)


async def _ingest_single_url(
  url: str,
  group_ids: Optional[List[int]],
) -> tuple[Optional[int], Optional[str], Optional[dict]]:
  """Helper to ingest a single URL. Returns (paper_id, file_path, error_dict)."""
  try:
    async with AsyncSessionLocal() as session:
      try:
        paper = await ingestion_service.ingest_paper(
          db_session=session,
          url=url,
          title=None,
          doi=None,
          group_ids=group_ids,
        )
        await session.commit()

        return cast(int, paper.id), cast(str, paper.file_path), None
      except DuplicatePaperError as e:
        await session.rollback()
        if e.existing_paper:
          return (
            cast(int, e.existing_paper.id),
            cast(str, e.existing_paper.file_path),
            None,
          )
        return (None, None, {"url": url, "error": f"Duplicate paper: {e}"})
      except Exception as e:
        await session.rollback()
        return (None, None, {"url": url, "error": str(e)})
  except Exception as e:
    return (None, None, {"url": url, "error": str(e)})


@router.post("/ingest/batch", response_model=PaperUploadResponse, status_code=201)
async def ingest_batch_endpoint(
  batch: PaperBatchCreate,
  session: AsyncSession = Depends(get_db),
):
  """Ingest multiple papers from a list of URLs.

  Accepts a JSON body with:
  - urls: List of paper URLs (arXiv, ACM, OpenReview, PMLR, NeurIPS, etc.)
  - group_ids: Optional list of group IDs to assign to all papers
  """
  if not batch.urls:
    raise HTTPException(status_code=400, detail="At least one URL is required")

  if len(batch.urls) > 20:
    raise HTTPException(status_code=400, detail="Maximum 20 URLs per batch")

  paper_ids: List[int] = []
  errors: List[dict] = []

  # Process URLs in parallel
  results = await asyncio.gather(
    *[_ingest_single_url(str(url), batch.group_ids) for url in batch.urls],
    return_exceptions=True,
  )

  celery_task_count = 0
  for result in results:
    if isinstance(result, Exception):
      errors.append({"url": "unknown", "error": str(result)})

    elif isinstance(result, tuple):
      paper_id, file_path, error = result
      if paper_id:
        paper_ids.append(paper_id)
        if file_path:
          task_id = _dispatch_paper_processing(paper_id, file_path)
          if task_id:
            celery_task_count += 1
      elif error:
        errors.append(error)

  # Generate message
  message = None
  if paper_ids:
    count = len(paper_ids)
    if count == 1:
      message = "1 paper ingested successfully."
    else:
      message = f"{count} papers ingested successfully."
    if celery_task_count > 0:
      message += f" AI processing started for {celery_task_count} paper(s) (citations, summary, findings, reading guide)."

  return PaperUploadResponse(paper_ids=paper_ids, errors=errors, message=message)


@router.post("/ingest/urls", response_model=PaperUploadResponse, status_code=201)
async def ingest_urls_from_text_endpoint(
  text: str = Body(..., media_type="text/plain"),
  group_ids: Optional[List[int]] = None,
  session: AsyncSession = Depends(get_db),
):
  """Ingest papers from pasted text containing URLs.

  Paste multiple URLs (separated by newlines, spaces, or commas) and they will
  all be ingested. Supports various academic sites including arXiv, ACM, IEEE,
  OpenReview, PMLR, NeurIPS, Nature, bioRxiv, and direct PDF links.
  """
  # Extract URLs from pasted text
  urls = url_parser.extract_urls_from_text(text)

  if not urls:
    raise HTTPException(
      status_code=400, detail="No valid URLs found in the provided text"
    )

  if len(urls) > 20:
    raise HTTPException(
      status_code=400,
      detail=f"Found {len(urls)} URLs. Maximum 20 URLs per request. Please split into multiple requests.",
    )

  paper_ids: List[int] = []
  errors: List[dict] = []

  # Process URLs in parallel
  results = await asyncio.gather(
    *[_ingest_single_url(url, group_ids) for url in urls],
    return_exceptions=True,
  )

  celery_task_count = 0
  for result in results:
    if isinstance(result, Exception):
      errors.append({"url": "unknown", "error": str(result)})
    elif isinstance(result, tuple):
      paper_id, file_path, error = result
      if paper_id:
        paper_ids.append(paper_id)
        if file_path:
          task_id = _dispatch_paper_processing(paper_id, file_path)
          if task_id:
            celery_task_count += 1
      elif error:
        errors.append(error)

  # Generate message
  message = None
  if paper_ids:
    count = len(paper_ids)
    if count == 1:
      message = "1 paper ingested successfully."
    else:
      message = f"{count} papers ingested successfully."
    if celery_task_count > 0:
      message += f" AI processing started for {celery_task_count} paper(s) (citations, summary, findings, reading guide)."

  return PaperUploadResponse(paper_ids=paper_ids, errors=errors, message=message)
