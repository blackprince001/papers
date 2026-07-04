import asyncio
import json
import re
from pathlib import Path
from typing import Any, cast

from app.celery_app import celery_app
from app.core.config import settings
from app.core.logger import get_logger
from app.models.paper import Paper
from app.models.paper_citation import PaperCitation
from app.services.ai.helpers import ProviderLookupError, get_provider_for_user_sync
from app.services.citation_extractor import CitationExtractor
from app.tasks.ai_tasks import (
  extract_findings_task,
  generate_reading_guide_task,
  generate_summary_task,
)
from app.tasks.base import (
  BaseAITask,
  BaseTask,
  RateLimitExceeded,
  check_ai_rate_limit,
  get_sync_session,
  push_paper_progress,
)

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


def _extract_references_section(pdf_content: bytes) -> str | None:
  """Extract references section from PDF (legacy fallback)."""
  return CitationExtractor.extract_references_section(pdf_content)


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
  """Extract citations from a paper's layout blocks (or PDF fallback)."""
  push_paper_progress(paper_id, {"step": "citations", "status": "running"})
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Delete existing citations
    session.query(PaperCitation).filter(PaperCitation.paper_id == paper_id).delete()
    session.flush()

    # Extract references section — layout blocks preferred
    references_text = CitationExtractor._extract_references_from_layout(
      cast("list[dict[str, Any]] | None", paper.layout_blocks)
    )

    # Fallback: read the PDF directly
    if not references_text:
      path = Path(file_path)
      if not path.is_absolute():
        path = Path(settings.STORAGE_PATH) / path
      if path.exists():
        pdf_content = path.read_bytes()
        references_text = _extract_references_section(pdf_content)

    if not references_text:
      logger.info("No references section found", paper_id=paper_id)
      session.commit()
      return {"status": "success", "paper_id": paper_id, "citations_count": 0}

    # Call AI to parse citations
    from app.services.ai.providers.base import GenerateConfig

    user_id = cast(int | None, paper.uploaded_by_id)
    provider = get_provider_for_user_sync(user_id)
    if not provider:
      return {
        "status": "skipped",
        "reason": "no provider configured",
        "paper_id": paper_id,
      }
    check_ai_rate_limit(user_id)

    prompt = CITATION_EXTRACTION_PROMPT.format(text=references_text)
    config = GenerateConfig(
      model=provider.config.model,
      temperature=0.1,
      max_output_tokens=32768,
    )
    response_text = asyncio.run(provider.generate(prompt, config))
    if not response_text:
      logger.warning(
        "Empty response from provider for citation extraction", paper_id=paper_id
      )
      session.commit()
      return {"status": "success", "paper_id": paper_id, "citations_count": 0}

    # Parse response using the robust extractor
    from app.utils.json_extractor import extract_json_from_text

    try:
      citations_data = extract_json_from_text(response_text)
      if not isinstance(citations_data, list):
        logger.warning(
          "Citation extraction returned non-list",
          paper_id=paper_id,
          type=type(citations_data).__name__,
        )
        citations_data = []
    except (ValueError, json.JSONDecodeError) as e:
      logger.warning(
        "Failed to parse citation JSON",
        paper_id=paper_id,
        error=str(e),
        preview=response_text[:300],
      )
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

  except ProviderLookupError:
    session.rollback()
    raise
  except RateLimitExceeded:
    session.rollback()
    raise
  except Exception as e:
    session.rollback()
    logger.error("Error extracting citations", paper_id=paper_id, error=str(e))
    return {"status": "failed", "error": str(e)[:200], "paper_id": paper_id}
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseTask, name="processing.process_paper_full")
def process_paper_full(self, paper_id: int, file_path: str) -> dict[str, Any]:
  """Run the AI processing steps for a freshly ingested paper.

  The steps — citations, summary, findings, reading guide — are independent,
  so they run as a parallel Celery ``chord`` rather than a serial chain: one
  failing step no longer aborts the others. Each step swallows its own error
  and returns a status dict; ``_finalize_paper_processing`` aggregates them.

  Layout and embeddings are produced inline at ingest, so they are not part
  of this workflow. Highlights run later (manually), once layout exists.
  """
  from celery import chord, group

  logger.info("Starting full paper processing", paper_id=paper_id)

  # Mark the paper as processing up front.
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

  workflow = chord(
    group(
      extract_citations_task.si(paper_id, file_path),
      generate_summary_task.si(paper_id),
      extract_findings_task.si(paper_id),
      generate_reading_guide_task.si(paper_id),
    ),
    _finalize_paper_processing.s(paper_id),
  )

  result = workflow.apply_async()

  return {
    "status": "dispatched",
    "paper_id": paper_id,
    "chord_id": result.id,
    "message": "Processing chord dispatched",
  }


@celery_app.task(bind=True, base=BaseTask, name="processing.backfill_layouts")
def backfill_layouts_task(self, paper_ids: list[int]) -> dict[str, Any]:
  """Bulk backfill layout blocks for papers that are missing them."""
  from datetime import datetime, timezone

  from app.services.layout_extractor import extract_layout

  session = get_sync_session()
  results: list[dict[str, Any]] = []
  try:
    papers = (
      session.query(Paper)
      .filter(Paper.id.in_(paper_ids))
      .filter(Paper.layout_blocks.is_(None))
      .filter(Paper.file_path.isnot(None))
      .all()
    )

    for paper in papers:
      try:
        path = Path(paper.file_path)
        if not path.is_absolute():
          path = Path(settings.STORAGE_PATH) / path
        if not path.exists():
          results.append(
            {"paper_id": paper.id, "status": "skipped", "reason": "File not found"}
          )
          continue

        blocks = extract_layout(path.read_bytes())
        paper.layout_blocks = blocks
        paper.layout_extracted_at = datetime.now(timezone.utc)
        results.append(
          {"paper_id": paper.id, "status": "success", "count": len(blocks)}
        )
      except Exception as e:
        results.append({"paper_id": paper.id, "status": "error", "error": str(e)})
        logger.warning("Layout backfill failed", paper_id=paper.id, error=str(e))

    session.commit()
    return {"status": "completed", "total": len(papers), "results": results}
  except Exception as e:
    session.rollback()
    logger.error("Layout backfill task failed", error=str(e))
    raise
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseTask, name="processing.finalize_paper")
def _finalize_paper_processing(
  self, results: list[Any], paper_id: int
) -> dict[str, Any]:
  """Aggregate the chord's step results and set the paper's final status.

  ``results`` is the list of status dicts from the parallel steps. If at
  least one step succeeded the paper is ``completed`` (steps that failed or
  were skipped are picked up by the retry sweep). Only when *every* step
  failed — and none merely skipped for lack of a provider — do we mark the
  paper ``failed`` with no further retries.
  """
  push_paper_progress(paper_id, {"step": "finalize", "status": "running"})
  statuses = [r.get("status") for r in results if isinstance(r, dict)]
  succeeded = [s for s in statuses if s == "success"]
  skipped = [s for s in statuses if s == "skipped"]

  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    if succeeded or skipped:
      paper.processing_status = "completed"
      paper.processing_error = None
      processing_status = "completed"
    else:
      paper.processing_status = "failed"
      paper.processing_error = "All AI processing steps failed"
      processing_status = "failed"
    session.commit()
    logger.info(
      "Paper processing finalized",
      paper_id=paper_id,
      status=paper.processing_status,
      succeeded=len(succeeded),
      skipped=len(skipped),
      total=len(statuses),
    )
    push_paper_progress(
      paper_id,
      {
        "step": "finalize",
        "status": processing_status,
        "succeeded": len(succeeded),
        "skipped": len(skipped),
        "total": len(statuses),
      },
    )
    return {
      "status": "success",
      "paper_id": paper_id,
      "processing_status": paper.processing_status,
      "succeeded": len(succeeded),
      "skipped": len(skipped),
      "total": len(statuses),
    }
  except Exception as e:
    session.rollback()
    logger.error("Error finalizing paper", paper_id=paper_id, error=str(e))
    raise
  finally:
    session.close()


RETRY_LOCK_TTL = 900

STALE_PROCESSING_SECONDS = 1800


def _acquire_retry_lock(r, key: str) -> bool:
  """Best-effort NX lock so a (paper, step) retry is dispatched once.

  Returns ``True`` when the caller won the lock (nothing else has this retry
  in flight). On any Redis error we return ``True`` and fall back to the
  status/NULL filters below — correctness never depends on Redis being up.
  """
  try:
    return bool(r.set(f"airetry:{key}", "1", nx=True, ex=RETRY_LOCK_TTL))
  except Exception as e:  # noqa: BLE001 — Redis is an optimization here
    logger.warning("Retry lock unavailable; proceeding", key=key, error=str(e))
    return True


@celery_app.task(bind=True, base=BaseTask, name="processing.retry_incomplete_ai")
def retry_incomplete_ai(self, limit: int = 50) -> dict[str, Any]:
  """Retry sweep ("retry pool"): re-run AI steps that didn't produce output.

  Runs periodically (Celery beat). It deliberately **only touches papers in
  the terminal ``completed`` state**, never ``processing`` — so it can never
  race the in-flight chord that ``process_paper_full`` is running for a paper
  (which keeps the paper ``processing`` until its callback finalizes). A
  per-(paper, step) Redis lock additionally prevents one sweep cycle from
  re-dispatching a retry that a previous cycle already queued.

  Papers stuck in ``processing`` (chord crashed before finalizing) are
  recovered separately once they go stale, by reprocessing them from scratch.
  ``failed`` papers are permanent and never retried.
  """
  from datetime import datetime, timedelta, timezone

  from app.tasks.ai_tasks import (
    extract_findings_task,
    generate_embedding_task,
    generate_reading_guide_task,
    generate_summary_task,
  )
  from app.tasks.base import get_redis

  r = get_redis()
  session = get_sync_session()
  dispatched: dict[str, int] = {}
  try:

    def _requeue(column, task, key: str) -> None:
      rows = (
        session.query(Paper.id)
        # Terminal state only — an in-flight chord keeps the paper "processing".
        .filter(Paper.processing_status == "completed")
        .filter(column.is_(None))
        .limit(limit)
        .all()
      )
      count = 0
      for (pid,) in rows:
        if _acquire_retry_lock(r, f"{key}:{pid}"):
          task.delay(pid)
          count += 1
      if count:
        dispatched[key] = count

    _requeue(Paper.ai_summary, generate_summary_task, "summary")
    _requeue(Paper.key_findings, extract_findings_task, "findings")
    _requeue(Paper.reading_guide, generate_reading_guide_task, "reading_guide")
    _requeue(Paper.embedding, generate_embedding_task, "embedding")

    # Layout is deterministic; backfill completed papers still missing it.
    layout_ids = [
      pid
      for (pid,) in (
        session.query(Paper.id)
        .filter(Paper.processing_status == "completed")
        .filter(Paper.layout_blocks.is_(None))
        .filter(Paper.file_path.isnot(None))
        .limit(limit)
        .all()
      )
      if _acquire_retry_lock(r, f"layout:{pid}")
    ]
    if layout_ids:
      backfill_layouts_task.delay(layout_ids)
      dispatched["layout"] = len(layout_ids)

    # Recover papers that never finished a chord: stuck in "processing" (chord
    # crashed before finalizing) or still "pending" (its dispatch never landed,
    # e.g. Celery was down at ingest). The stale window keeps us clear of the
    # brief pending→processing window right after a normal ingest. Reprocess
    # from scratch — steps are idempotent (citations delete-then-insert; the
    # rest overwrite their column).
    stale_before = datetime.now(timezone.utc) - timedelta(
      seconds=STALE_PROCESSING_SECONDS
    )
    stuck = (
      session.query(Paper.id, Paper.file_path)
      .filter(Paper.processing_status.in_(("pending", "processing")))
      .filter(Paper.updated_at < stale_before)
      .filter(Paper.file_path.isnot(None))
      .limit(limit)
      .all()
    )
    reprocessed = 0
    for pid, fpath in stuck:
      if _acquire_retry_lock(r, f"reprocess:{pid}"):
        process_paper_full.delay(pid, fpath)
        reprocessed += 1
    if reprocessed:
      dispatched["reprocess_stuck"] = reprocessed

    logger.info("Retry sweep dispatched", **dispatched)
    return {"status": "success", "dispatched": dispatched}
  except Exception as e:
    logger.error("Retry sweep failed", error=str(e))
    raise
  finally:
    session.close()
