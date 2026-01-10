import json
from typing import List, Optional, cast

from fastapi import (
  APIRouter,
  BackgroundTasks,
  Depends,
  File,
  Form,
  HTTPException,
  UploadFile,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.dependencies import get_db
from app.models.paper import Paper as PaperModel
from app.schemas.paper import Paper, PaperCreate, PaperUploadResponse
from app.services.citation_extractor import citation_extractor
from app.services.duplicate_detection import duplicate_detection_service
from app.services.ingestion import ingestion_service

router = APIRouter()


async def extract_citations_background_task(paper_id: int, file_path: str):
  """Background task to extract citations from a paper's PDF."""
  try:
    # Create a new session for background task
    async with AsyncSessionLocal() as session:
      # Verify paper still exists before processing
      paper_query = select(PaperModel).where(PaperModel.id == paper_id)
      paper_result = await session.execute(paper_query)
      paper = paper_result.scalar_one_or_none()
      
      if not paper:
        print(f"Paper {paper_id} not found, skipping citation extraction")
        return
      
      # Load PDF file from storage
      # file_path is stored as full path string
      from pathlib import Path

      path_obj = Path(file_path)
      if path_obj.exists():
        pdf_content = path_obj.read_bytes()
      else:
        print(f"PDF file not found at path: {file_path} for paper {paper_id}")
        return

      # Extract and store citations
      await citation_extractor.extract_and_store_citations(
        session, paper_id, pdf_content
      )
      print(f"Successfully extracted citations for paper {paper_id}")
  except FileNotFoundError:
    print(f"PDF file not found for paper {paper_id} at path: {file_path}")
  except Exception as e:
    print(f"Error in background citation extraction for paper {paper_id}: {str(e)}")
    import traceback
    traceback.print_exc()


@router.post("/ingest", response_model=Paper, status_code=201)
async def ingest_paper_endpoint(
  paper_in: PaperCreate,
  background_tasks: BackgroundTasks,
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
        existing_title = await session.execute(
          select(PaperModel).where(PaperModel.title.ilike(f"%{paper_in.title[:50]}%"))
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
      session=session,
      url=str(paper_in.url),
      title=paper_in.title,
      doi=paper_in.doi,
      group_ids=paper_in.group_ids,
    )

    # Re-fetch paper with all relationships eagerly loaded
    query = (
      select(PaperModel)
      .options(selectinload(PaperModel.groups), selectinload(PaperModel.tags))
      .where(PaperModel.id == paper.id)
    )
    result = await session.execute(query)
    paper = result.scalar_one()

    # Ensure relationships are loaded by accessing them while session is active
    _ = list(paper.groups) if hasattr(paper, "groups") else []
    _ = list(paper.tags) if hasattr(paper, "tags") else []

    # Add background task for citation extraction
    paper_response = Paper.model_validate(paper)
    if paper.file_path:
      background_tasks.add_task(
        extract_citations_background_task,
        cast(int, paper.id),
        cast(str, paper.file_path),
      )
      paper_response.background_processing_message = "Citation extraction started in the background."

    return paper_response
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
  background_tasks: BackgroundTasks = BackgroundTasks(),
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
          session=async_session,
          file_content=content,
          filename=cast(str, file.filename),
          title=None,
          doi=None,
          group_ids=parsed_group_ids,
        )
        await async_session.commit()

        # Re-fetch paper with all relationships eagerly loaded
        query = (
          select(PaperModel)
          .options(selectinload(PaperModel.groups), selectinload(PaperModel.tags))
          .where(PaperModel.id == paper.id)
        )
        result = await async_session.execute(query)
        paper = result.scalar_one()

        # Ensure relationships are loaded
        _ = list(paper.groups) if hasattr(paper, "groups") else []
        _ = list(paper.tags) if hasattr(paper, "tags") else []

        # Store paper_id and file_path for background citation extraction
        # We'll add it to background tasks after all files are processed
        return cast(int, paper.id), cast(str, paper.file_path), None
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

    citation_extraction_count = 0
    for result in results:
      if isinstance(result, Exception):
        errors.append({"filename": "unknown", "error": str(result)})
      elif isinstance(result, tuple):
        paper_id, file_path, error = result
        if paper_id:
          paper_ids.append(paper_id)
          # Add background task for citation extraction
          if file_path:
            citation_extraction_count += 1
            background_tasks.add_task(
              extract_citations_background_task, paper_id, file_path
            )
        elif error:
          errors.append(error)

    # Generate message about background processing
    message = None
    if len(paper_ids) > 0:
      if len(paper_ids) == 1:
        if citation_extraction_count > 0:
          message = "Paper uploaded successfully. Citations are being extracted in the background."
        else:
          message = "Paper uploaded successfully."
      else:
        if citation_extraction_count > 0:
          message = f"{len(paper_ids)} papers uploaded successfully. Citations are being extracted in the background for {citation_extraction_count} paper(s)."
        else:
          message = f"{len(paper_ids)} papers uploaded successfully."

  return PaperUploadResponse(
    paper_ids=paper_ids, 
    errors=errors,
    message=message
  )
