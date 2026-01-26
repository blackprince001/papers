from pathlib import Path
from typing import Any, cast

from google.genai import types

from app.celery_app import celery_app
from app.core.config import settings
from app.core.logger import get_logger
from app.models.annotation import Annotation
from app.models.paper import Paper
from app.tasks.base import BaseAITask, get_sync_session
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)

SUMMARY_PROMPT = """Generate a concise summary (2-3 paragraphs) of this research paper.

Paper Title: {title}

Provide a clear, structured summary covering the main objectives, methodology, key findings, and conclusions."""

FINDINGS_PROMPT = """Extract key findings from this research paper in JSON format.

Paper Title: {title}

Return a JSON object with this structure:
{{
  "key_findings": ["finding1", "finding2", ...],
  "conclusions": ["conclusion1", "conclusion2", ...],
  "methodology": "brief methodology description",
  "limitations": ["limitation1", "limitation2", ...],
  "future_work": ["future work item1", "future work item2", ...]
}}"""

READING_GUIDE_PROMPT = """Create a reading guide for this research paper.

Paper Title: {title}

Return a JSON object with this structure:
{{
  "pre_reading": ["question1", "question2", ...],
  "during_reading": ["question1", "question2", ...],
  "post_reading": ["question1", "question2", ...]
}}"""

HIGHLIGHTS_PROMPT = """Identify key sections in this research paper:
- Methods (type: "method")
- Results (type: "result")
- Conclusions (type: "conclusion")
- Key contributions (type: "key_contribution")

Paper Title: {title}

For each section, provide the exact text excerpt and its type.
IMPORTANT: Use exactly these type values: "method", "result", "conclusion", "key_contribution"

Return a JSON array with this structure:
[
  {{"text": "exact excerpt", "type": "method"}},
  {{"text": "exact excerpt", "type": "result"}},
  {{"text": "exact excerpt", "type": "conclusion"}},
  {{"text": "exact excerpt", "type": "key_contribution"}}
]"""

# Valid highlight types matching DB enum
VALID_HIGHLIGHT_TYPES = {"method", "result", "conclusion", "key_contribution"}
HIGHLIGHT_TYPE_ALIASES = {
  "contribution": "key_contribution",
  "contributions": "key_contribution",
  "key_contributions": "key_contribution",
  "methods": "method",
  "results": "result",
  "conclusions": "conclusion",
  "finding": "result",
  "findings": "result",
}


def _get_content_parts_sync(paper: Paper) -> list[types.Part]:
  """Get content parts for a paper synchronously."""
  if paper.file_path:
    file_path = Path(cast(str, paper.file_path))
    if not file_path.is_absolute():
      file_path = Path(settings.STORAGE_PATH) / file_path
    if file_path.exists():
      return [
        types.Part.from_bytes(data=file_path.read_bytes(), mime_type="application/pdf")
      ]

  if paper.content_text:
    return [types.Part.from_text(text=cast(str, paper.content_text))]

  return []


def _normalize_highlight_type(raw_type: str | None) -> str | None:
  if not raw_type:
    return None
  normalized = raw_type.lower().strip()
  if normalized in VALID_HIGHLIGHT_TYPES:
    return normalized
  return HIGHLIGHT_TYPE_ALIASES.get(normalized)


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_summary")
def generate_summary_task(self, paper_id: int) -> dict[str, Any]:
  """Generate AI summary for a paper."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    client = self.client
    if not client:
      return {
        "status": "error",
        "error": "No AI client available",
        "paper_id": paper_id,
      }

    content_parts = _get_content_parts_sync(paper)
    if not content_parts:
      return {"status": "error", "error": "No content available", "paper_id": paper_id}

    prompt = SUMMARY_PROMPT.format(title=paper.title or "Unknown")
    contents = content_parts + [types.Part.from_text(text=prompt)]

    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=contents,
    )
    summary = response.text if hasattr(response, "text") else str(response)

    paper.ai_summary = summary
    from datetime import datetime, timezone

    paper.summary_generated_at = datetime.now(timezone.utc)
    session.commit()

    logger.info("Generated summary", paper_id=paper_id)
    return {"status": "success", "paper_id": paper_id, "summary_length": len(summary)}

  except Exception as e:
    session.rollback()
    logger.error("Error generating summary", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.extract_findings")
def extract_findings_task(self, paper_id: int) -> dict[str, Any]:
  """Extract key findings from a paper."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    client = self.client
    if not client:
      return {
        "status": "error",
        "error": "No AI client available",
        "paper_id": paper_id,
      }

    content_parts = _get_content_parts_sync(paper)
    if not content_parts:
      return {"status": "error", "error": "No content available", "paper_id": paper_id}

    prompt = FINDINGS_PROMPT.format(title=paper.title or "Unknown")
    contents = content_parts + [types.Part.from_text(text=prompt)]

    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=contents,
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      paper.key_findings = parsed
      from datetime import datetime, timezone

      paper.findings_extracted_at = datetime.now(timezone.utc)
      session.commit()
      logger.info("Extracted findings", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id, "findings": parsed}

    return {"status": "error", "error": "Invalid response format", "paper_id": paper_id}

  except Exception as e:
    session.rollback()
    logger.error("Error extracting findings", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_reading_guide")
def generate_reading_guide_task(self, paper_id: int) -> dict[str, Any]:
  """Generate reading guide for a paper."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    client = self.client
    if not client:
      return {
        "status": "error",
        "error": "No AI client available",
        "paper_id": paper_id,
      }

    content_parts = _get_content_parts_sync(paper)
    if not content_parts:
      return {"status": "error", "error": "No content available", "paper_id": paper_id}

    prompt = READING_GUIDE_PROMPT.format(title=paper.title or "Unknown")
    contents = content_parts + [types.Part.from_text(text=prompt)]

    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=contents,
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      paper.reading_guide = parsed
      from datetime import datetime, timezone

      paper.guide_generated_at = datetime.now(timezone.utc)
      session.commit()
      logger.info("Generated reading guide", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id, "guide": parsed}

    return {"status": "error", "error": "Invalid response format", "paper_id": paper_id}

  except Exception as e:
    session.rollback()
    logger.error("Error generating reading guide", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_highlights")
def generate_highlights_task(self, paper_id: int) -> dict[str, Any]:
  """Generate auto-highlights for a paper."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    client = self.client
    if not client:
      return {
        "status": "error",
        "error": "No AI client available",
        "paper_id": paper_id,
      }

    content_parts = _get_content_parts_sync(paper)
    if not content_parts:
      return {"status": "error", "error": "No content available", "paper_id": paper_id}

    prompt = HIGHLIGHTS_PROMPT.format(title=paper.title or "Unknown")
    contents = content_parts + [types.Part.from_text(text=prompt)]

    response = client.models.generate_content(
      model=settings.GENAI_MODEL,
      contents=contents,
    )
    text = response.text if hasattr(response, "text") else str(response)

    parsed = extract_json_from_text(text)
    if isinstance(parsed, list):
      count = 0
      for item in parsed:
        if not isinstance(item, dict):
          continue

        h_type = _normalize_highlight_type(item.get("type"))
        if not h_type:
          continue

        annotation = Annotation(
          paper_id=paper_id,
          content=item.get("text", ""),
          highlighted_text=item.get("text", ""),
          type="annotation",
          auto_highlighted=True,
          highlight_type=h_type,
        )
        session.add(annotation)
        count += 1

      session.commit()
      logger.info(f"Generated {count} highlights", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id, "count": count}

    return {"status": "error", "error": "Invalid response format", "paper_id": paper_id}

  except Exception as e:
    session.rollback()
    logger.error("Error generating highlights", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_embedding")
def generate_embedding_task(self, paper_id: int) -> dict[str, Any]:
  """Generate embedding for a paper."""
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    client = self.client
    if not client:
      return {
        "status": "error",
        "error": "No AI client available",
        "paper_id": paper_id,
      }

    text_to_embed = paper.content_text or paper.title or ""
    if not text_to_embed:
      return {"status": "error", "error": "No text to embed", "paper_id": paper_id}

    # Truncate to reasonable length for embedding model to check cost/time
    # Models have limits, e.g. 8k tokens.
    max_chars = 20000

    result = client.models.embed_content(
      model=settings.EMBEDDING_MODEL,
      contents=text_to_embed[:max_chars],
      config=types.EmbedContentConfig(
        task_type="RETRIEVAL_DOCUMENT",
        output_dimensionality=settings.EMBEDDING_DIMENSION,
      ),
    )

    if result.embeddings and len(result.embeddings) > 0:
      embedding = list(result.embeddings[0].values)
      paper.embedding = embedding
      session.commit()
      logger.info("Generated embedding", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id, "dimension": len(embedding)}

    return {"status": "error", "error": "No embedding returned", "paper_id": paper_id}

  except Exception as e:
    session.rollback()
    logger.error("Error generating embedding", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()
