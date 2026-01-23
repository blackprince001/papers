import io
import json
import re
from pathlib import Path
from typing import Any

from google.genai import types
from pypdf import PdfReader

from app.celery_app import celery_app
from app.core.config import settings
from app.core.logger import get_logger
from app.models.paper import Paper
from app.models.paper_citation import PaperCitation
from app.tasks.ai_tasks import (
  extract_findings_task,
  generate_reading_guide_task,
  generate_summary_task,
)
from app.tasks.base import BaseAITask, BaseTask, get_sync_session

logger = get_logger(__name__)

CITATION_EXTRACTION_PROMPT = """You are extracting citations from an academic paper. \
Identify and extract ONLY the citation entries from the text below.

Text from paper:
{text}

INSTRUCTIONS:
1. Identify citation entries - formatted bibliographic entries with authors, titles, etc.
2. Ignore body text, figures, tables, footnotes
3. Focus on entries following common citation formats (APA, MLA, Chicago, IEEE)
4. Extract ALL citations you find

For EACH citation entry, extract:
- title: The paper/article/book title (required)
- authors: List of author names as array
- year: Publication year as integer
- journal: Journal, conference, or venue name
- doi: DOI if mentioned (normalize by removing prefixes)
- pages: Page numbers or range
- volume: Volume number
- issue: Issue number

Return a JSON array of citations.

IMPORTANT: Return ONLY valid JSON array, no other text or markdown."""

REFERENCES_SECTION_PATTERNS = [
  r"(?i)^\s*references\s*$",
  r"(?i)^\s*bibliography\s*$",
  r"(?i)^\s*works\s+cited\s*$",
  r"(?i)^\s*literature\s+cited\s*$",
  r"(?i)^\s*citations\s*$",
]


def _extract_references_section(pdf_content: bytes) -> str | None:
  """Extract references section from PDF."""
  try:
    pdf_file = io.BytesIO(pdf_content)
    reader = PdfReader(pdf_file)

    if len(reader.pages) == 0:
      return None

    # Extract all text
    text_parts = [page.extract_text() for page in reader.pages if page.extract_text()]
    full_text = "\n\n".join(text_parts) if text_parts else None

    if not full_text:
      return None

    # Find references section
    lines = full_text.split("\n")
    search_start = max(0, int(len(lines) * 0.6))

    for i in range(len(lines) - 1, search_start - 1, -1):
      line = lines[i].strip()
      for pattern in REFERENCES_SECTION_PATTERNS:
        if re.match(pattern, line):
          return full_text[sum(len(lines[j]) + 1 for j in range(i)) :]

    # Fallback: return last half of document
    total_pages = len(reader.pages)
    start_page = 0 if total_pages < 10 else total_pages // 2
    fallback_parts = []
    for i in range(start_page, total_pages):
      text = reader.pages[i].extract_text()
      if text:
        fallback_parts.append(text)
    return "\n\n".join(fallback_parts) if fallback_parts else None

  except Exception as e:
    logger.error("Error extracting references", error=str(e))
    return None


def _clean_json_response(response_text: str) -> str:
  """Remove markdown code blocks from response."""
  cleaned = response_text.strip()
  if not cleaned.startswith("```"):
    return cleaned

  first_newline = cleaned.find("\n")
  if first_newline != -1:
    cleaned = cleaned[first_newline + 1 :]

  if cleaned.endswith("```"):
    cleaned = cleaned[:-3]

  cleaned = cleaned.strip()
  if cleaned.startswith("json\n"):
    cleaned = cleaned[5:]

  return cleaned


def _build_citation_context(citation: dict[str, Any]) -> str:
  """Build context string from citation data."""
  parts = []
  if citation.get("authors"):
    parts.append(", ".join(citation["authors"][:3]))
  if citation.get("title"):
    parts.append(citation["title"])
  if citation.get("journal"):
    parts.append(citation["journal"])
  if citation.get("year"):
    parts.append(str(citation["year"]))
  return ". ".join(parts)[:500]


@celery_app.task(bind=True, base=BaseAITask, name="processing.extract_citations")
def extract_citations_task(self, paper_id: int, file_path: str) -> dict[str, Any]:
  """Extract citations from a paper's PDF."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Resolve file path
    path = Path(file_path)
    if not path.is_absolute():
      path = Path(settings.STORAGE_PATH) / path
    if not path.exists():
      return {"status": "error", "error": "File not found", "paper_id": paper_id}

    pdf_content = path.read_bytes()

    # Delete existing citations
    session.query(PaperCitation).filter(PaperCitation.paper_id == paper_id).delete()
    session.flush()

    # Extract references section
    references_text = _extract_references_section(pdf_content)
    if not references_text:
      logger.info("No references section found", paper_id=paper_id)
      session.commit()
      return {"status": "success", "paper_id": paper_id, "citations_count": 0}

    # Call AI to parse citations
    client = self.client
    if not client:
      return {
        "status": "error",
        "error": "No AI client available",
        "paper_id": paper_id,
      }

    max_chars = 20000
    text_to_parse = (
      references_text[-max_chars:]
      if len(references_text) > max_chars
      else references_text
    )

    prompt = CITATION_EXTRACTION_PROMPT.format(text=text_to_parse)
    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=types.Part.from_text(text=prompt),
    )

    response_text = response.text if hasattr(response, "text") else str(response)
    if not response_text:
      session.commit()
      return {"status": "success", "paper_id": paper_id, "citations_count": 0}

    # Parse response
    try:
      cleaned = _clean_json_response(response_text)
      citations_data = json.loads(cleaned)
      if not isinstance(citations_data, list):
        citations_data = []
    except (json.JSONDecodeError, ValueError):
      citations_data = []

    # Store citations
    stored_count = 0
    for raw in citations_data:
      if not isinstance(raw, dict):
        continue
      title = raw.get("title")
      if not title:
        continue

      doi = raw.get("doi")
      if doi:
        doi = re.sub(r"^(doi:|DOI:|https?://(dx\.)?doi\.org/)", "", doi).strip()

      citation = PaperCitation(
        paper_id=paper_id,
        citation_context=_build_citation_context(raw),
        external_paper_title=title,
        external_paper_doi=doi if doi else None,
      )
      session.add(citation)
      stored_count += 1

    session.commit()
    logger.info("Extracted citations", paper_id=paper_id, count=stored_count)
    return {"status": "success", "paper_id": paper_id, "citations_count": stored_count}

  except Exception as e:
    session.rollback()
    logger.error("Error extracting citations", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseTask, name="processing.process_paper_full")
def process_paper_full(self, paper_id: int, file_path: str) -> dict[str, Any]:
  """
  Process a paper fully: extract citations, then generate AI content.

  Uses Celery chain to dispatch subtasks properly (with rate limiting, retries, etc).
  Each subtask runs independently and can be distributed across workers.
  """
  from celery import chain as celery_chain

  logger.info("Starting full paper processing", paper_id=paper_id)

  # Set initial processing status
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if paper:
      paper.processing_status = "processing"
      paper.processing_error = None
      session.commit()
  except Exception as e:
    session.rollback()
    logger.warning("Could not set processing status", paper_id=paper_id, error=str(e))
  finally:
    session.close()

  # Create a proper chain that dispatches tasks to the queue
  # Each task ignores the result from previous (they all use paper_id)
  workflow = celery_chain(
    extract_citations_task.si(paper_id, file_path),  # .si() ignores previous result
    generate_summary_task.si(paper_id),
    extract_findings_task.si(paper_id),
    generate_reading_guide_task.si(paper_id),
    _finalize_paper_processing.si(paper_id),  # Final task to mark complete
  )

  # Dispatch the chain asynchronously with error callback
  result = workflow.apply_async(link_error=_mark_paper_failed.s(paper_id))

  return {
    "status": "dispatched",
    "paper_id": paper_id,
    "chain_id": result.id,
    "message": "Processing chain dispatched",
  }


@celery_app.task(base=BaseTask, name="processing.mark_paper_failed")
def _mark_paper_failed(task_id: str, paper_id: int) -> dict[str, Any]:
  """Mark paper processing as failed when any task in the chain fails.

  Called as an error callback (link_error). Receives the failed task's ID.
  """
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if paper:
      paper.processing_status = "failed"
      paper.processing_error = f"Task {task_id} failed during processing"
      session.commit()
      logger.error("Paper processing failed", paper_id=paper_id, task_id=task_id)
      return {"status": "failed", "paper_id": paper_id, "task_id": task_id}
    return {"status": "error", "error": "Paper not found", "paper_id": paper_id}
  except Exception as e:
    session.rollback()
    logger.error("Error marking paper as failed", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseTask, name="processing.finalize_paper")
def _finalize_paper_processing(self, paper_id: int) -> dict[str, Any]:
  """Mark paper processing as complete."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if paper:
      paper.processing_status = "completed"
      session.commit()
      logger.info("Paper processing finalized", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id}
    return {"status": "error", "error": "Paper not found", "paper_id": paper_id}
  except Exception as e:
    session.rollback()
    logger.error("Error finalizing paper", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()
