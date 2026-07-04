"""Celery tasks for AI operations — provider-agnostic.

Uses BaseAITask.provider instead of a hardcoded Gemini client.
"""

from typing import Any, cast

from app.celery_app import celery_app
from app.core.config import settings
from app.core.logger import get_logger
from app.models.annotation import Annotation
from app.models.paper import Paper
from app.services.ai.helpers import ProviderLookupError, get_provider_for_user_sync
from app.services.ai.providers.base import (
  EmbeddingConfig,
  GenerateConfig,
  ProviderConfig,
)
from app.tasks.base import (
  BaseAITask,
  RateLimitExceeded,
  check_ai_rate_limit,
  get_sync_session,
  push_paper_progress,
)
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

The paper's text is provided below as numbered layout blocks in the form
`[block_id] (p<page>) <text>`. For each key section, name the block it comes
from and give a short verbatim quote from that block, so the highlight can be
anchored to the block's position on the page.

IMPORTANT:
- Use exactly these type values: "method", "result", "conclusion", "key_contribution"
- "block_id" must be one of the provided block ids
- "quote" must be copied verbatim from that block's text

Return a JSON array with this structure:
[
  {{"type": "method", "block_id": "b3-2", "quote": "exact words from the block"}},
  ...
]

Layout blocks:
{blocks}"""

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


def _build_prompt_with_content(
  prompt_template: str, paper: Paper, title: str | None = None
) -> str:
  """Build a prompt with paper title and content.

  Includes paper content as context for the AI model.
  """
  paper_title = title or paper.title or "Unknown"
  content = ""
  if paper.content_text:
    content = cast(str, paper.content_text)
    max_content_length = 80000
    if len(content) > max_content_length:
      content = content[:max_content_length]

  system = f"Paper Context:\n{paper_title}\n\n"
  if content:
    system += f"Paper Content:\n{content}\n\n"

  prompt = prompt_template.format(title=paper_title or "Unknown")
  return f"{system}\n\n{prompt}"


def _normalize_highlight_type(raw_type: str | None) -> str | None:
  if not raw_type:
    return None
  normalized = raw_type.lower().strip()
  if normalized in VALID_HIGHLIGHT_TYPES:
    return normalized
  return HIGHLIGHT_TYPE_ALIASES.get(normalized)


# ── Layout-anchored highlight helpers ───────────────────────────────────────
# Layout blocks (see app/services/layout_extractor.py) carry absolute
# page-unit bounding boxes; annotations store normalized 0-1 rects, so the
# conversion happens here at annotation-write time.

LAYOUT_DIGEST_MAX_CHARS = 80000
LAYOUT_BLOCK_SNIPPET_CHARS = 2000
FUZZY_MATCH_THRESHOLD = 0.6


def _layout_digest(blocks: list[dict[str, Any]]) -> str:
  """Numbered text-block digest for the highlights prompt."""
  lines: list[str] = []
  total = 0
  for block in blocks:
    if block.get("type") not in ("text", "heading"):
      continue
    page = block["metadata"]["page"]["number"]
    snippet = block["content"][:LAYOUT_BLOCK_SNIPPET_CHARS].replace("\n", " ")
    line = f"[{block['id']}] (p{page}) {snippet}"
    total += len(line) + 1
    if total > LAYOUT_DIGEST_MAX_CHARS:
      break
    lines.append(line)
  return "\n".join(lines)


def _block_geometry(block: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
  """Normalized (selection_data, coordinate_data) for a layout block."""
  bb = block["boundingBox"]
  page = block["metadata"]["page"]
  w, h = float(page["width"]), float(page["height"])
  rect = {
    "left": bb["left"] / w,
    "top": bb["top"] / h,
    "width": (bb["right"] - bb["left"]) / w,
    "height": (bb["bottom"] - bb["top"]) / h,
  }
  selection_data = {"rects": [rect], "boundingBox": rect, "source": "layout_block"}
  coordinate_data = {
    "page": page["number"],
    "x": rect["left"] + rect["width"] / 2,
    "y": rect["top"],
  }
  return selection_data, coordinate_data


def _anchor_quote_to_block(
  quote: str, block_id: str | None, blocks: list[dict[str, Any]]
) -> dict[str, Any] | None:
  """Find the layout block a quote belongs to.

  Exact substring match on the named block first; otherwise fuzzy-match
  across blocks near the named block's page (all blocks when the id is
  unknown). Returns None when nothing clears the threshold.
  """
  import difflib

  by_id = {b["id"]: b for b in blocks}
  named = by_id.get(block_id or "")
  text_blocks = [b for b in blocks if b.get("type") in ("text", "heading")]
  quote_norm = " ".join(quote.split()).lower()
  if not quote_norm:
    return None

  if named and quote_norm in " ".join(named["content"].split()).lower():
    return named

  candidates = text_blocks
  if named:
    page = named["metadata"]["page"]["number"]
    nearby = [
      b for b in text_blocks if abs(b["metadata"]["page"]["number"] - page) <= 1
    ]
    candidates = nearby or text_blocks

  best: dict[str, Any] | None = None
  best_ratio = 0.0
  for block in candidates:
    content_norm = " ".join(block["content"].split()).lower()
    if quote_norm in content_norm:
      return block
    ratio = difflib.SequenceMatcher(
      None, quote_norm, content_norm[: max(len(quote_norm) * 3, 600)]
    ).ratio()
    if ratio > best_ratio:
      best_ratio = ratio
      best = block

  return best if best_ratio > FUZZY_MATCH_THRESHOLD else None


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_summary")
def generate_summary_task(self, paper_id: int) -> dict[str, Any]:
  """Generate AI summary for a paper."""
  push_paper_progress(paper_id, {"step": "summary", "status": "running"})
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Use the paper owner's configured provider (BYO key). There is no
    # environment fallback: with no provider the step is skipped and the
    # retry sweep leaves it to run once one is configured.
    user_id = cast(int | None, paper.uploaded_by_id)
    p = get_provider_for_user_sync(user_id)
    if not p:
      return {
        "status": "skipped",
        "reason": "no provider configured",
        "paper_id": paper_id,
      }
    check_ai_rate_limit(user_id)

    import asyncio

    full_prompt = _build_prompt_with_content(SUMMARY_PROMPT, paper)
    config = GenerateConfig(
      model=p.config.model,
      temperature=0.3,
    )
    summary = asyncio.run(p.generate(full_prompt, config))

    paper.ai_summary = summary
    from datetime import datetime, timezone

    paper.summary_generated_at = datetime.now(timezone.utc)
    session.commit()

    logger.info("Generated summary", paper_id=paper_id)
    return {"status": "success", "paper_id": paper_id, "summary_length": len(summary)}

  except ProviderLookupError:
    # Transient lookup failure — retry rather than skip as "no provider".
    session.rollback()
    raise
  except RateLimitExceeded:
    session.rollback()
    raise
  except Exception as e:
    session.rollback()
    logger.error("Error generating summary", paper_id=paper_id, error=str(e))
    # Don't raise: let the processing chord complete with partial results.
    # The retry sweep re-runs this step later (field stays NULL).
    return {"status": "failed", "error": str(e)[:200], "paper_id": paper_id}
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.extract_findings")
def extract_findings_task(self, paper_id: int) -> dict[str, Any]:
  """Extract key findings from a paper."""
  push_paper_progress(paper_id, {"step": "findings", "status": "running"})
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Use the paper owner's configured provider (BYO key). There is no
    # environment fallback: with no provider the step is skipped and the
    # retry sweep leaves it to run once one is configured.
    user_id = cast(int | None, paper.uploaded_by_id)
    p = get_provider_for_user_sync(user_id)
    if not p:
      return {
        "status": "skipped",
        "reason": "no provider configured",
        "paper_id": paper_id,
      }
    check_ai_rate_limit(user_id)

    import asyncio

    full_prompt = _build_prompt_with_content(FINDINGS_PROMPT, paper)
    config = GenerateConfig(model=p.config.model, temperature=0.3)
    text = asyncio.run(p.generate(full_prompt, config))

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      paper.key_findings = parsed
      from datetime import datetime, timezone

      paper.findings_extracted_at = datetime.now(timezone.utc)
      session.commit()
      logger.info("Extracted findings", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id, "findings": parsed}

    return {"status": "error", "error": "Invalid response format", "paper_id": paper_id}

  except ProviderLookupError:
    session.rollback()
    raise
  except RateLimitExceeded:
    session.rollback()
    raise
  except Exception as e:
    session.rollback()
    logger.error("Error extracting findings", paper_id=paper_id, error=str(e))
    return {"status": "failed", "error": str(e)[:200], "paper_id": paper_id}
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_reading_guide")
def generate_reading_guide_task(self, paper_id: int) -> dict[str, Any]:
  """Generate reading guide for a paper."""
  push_paper_progress(paper_id, {"step": "reading_guide", "status": "running"})
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Use the paper owner's configured provider (BYO key). There is no
    # environment fallback: with no provider the step is skipped and the
    # retry sweep leaves it to run once one is configured.
    user_id = cast(int | None, paper.uploaded_by_id)
    p = get_provider_for_user_sync(user_id)
    if not p:
      return {
        "status": "skipped",
        "reason": "no provider configured",
        "paper_id": paper_id,
      }
    check_ai_rate_limit(user_id)

    import asyncio

    full_prompt = _build_prompt_with_content(READING_GUIDE_PROMPT, paper)
    config = GenerateConfig(model=p.config.model, temperature=0.3)
    text = asyncio.run(p.generate(full_prompt, config))

    parsed = extract_json_from_text(text)
    if isinstance(parsed, dict):
      paper.reading_guide = parsed
      from datetime import datetime, timezone

      paper.guide_generated_at = datetime.now(timezone.utc)
      session.commit()
      logger.info("Generated reading guide", paper_id=paper_id)
      return {"status": "success", "paper_id": paper_id, "guide": parsed}

    return {"status": "error", "error": "Invalid response format", "paper_id": paper_id}

  except ProviderLookupError:
    session.rollback()
    raise
  except RateLimitExceeded:
    session.rollback()
    raise
  except Exception as e:
    session.rollback()
    logger.error("Error generating reading guide", paper_id=paper_id, error=str(e))
    return {"status": "failed", "error": str(e)[:200], "paper_id": paper_id}
  finally:
    session.close()


@celery_app.task(bind=True, base=BaseAITask, name="ai.generate_highlights")
def generate_highlights_task(self, paper_id: int) -> dict[str, Any]:
  """Generate auto-highlights for a paper."""
  push_paper_progress(paper_id, {"step": "highlights", "status": "running"})
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Use the paper owner's configured provider (BYO key). There is no
    # environment fallback: with no provider the step is skipped and the
    # retry sweep leaves it to run once one is configured.
    user_id = cast(int | None, paper.uploaded_by_id)
    p = get_provider_for_user_sync(user_id)
    if not p:
      return {
        "status": "skipped",
        "reason": "no provider configured",
        "paper_id": paper_id,
      }
    check_ai_rate_limit(user_id)

    import asyncio

    # Layout blocks let the model name real page geometry instead of
    # guessing positions; extract inline for papers ingested before the
    # layout task joined the chain.
    blocks: list[dict[str, Any]] = paper.layout_blocks or []
    if not blocks and paper.file_path:
      from datetime import datetime, timezone
      from pathlib import Path

      from app.services.layout_extractor import extract_layout

      path = Path(cast(str, paper.file_path))
      if not path.is_absolute():
        path = Path(settings.STORAGE_PATH) / path
      if path.exists():
        blocks = extract_layout(path.read_bytes())
        paper.layout_blocks = blocks
        paper.layout_extracted_at = datetime.now(timezone.utc)
        session.commit()

    if blocks:
      prompt = HIGHLIGHTS_PROMPT.format(
        title=paper.title or "Unknown", blocks=_layout_digest(blocks)
      )
    else:
      # No geometry available (e.g. URL-only papers): fall back to plain
      # content context; highlights save without positions.
      prompt = _build_prompt_with_content(
        HIGHLIGHTS_PROMPT.replace("{blocks}", "(no layout blocks available)"),
        paper,
      )

    config = GenerateConfig(model=p.config.model, temperature=0.3)
    text = asyncio.run(p.generate(prompt, config))

    parsed = extract_json_from_text(text)
    if isinstance(parsed, list):
      # Regeneration replaces previous auto-highlights instead of stacking.
      session.query(Annotation).filter(
        Annotation.paper_id == paper_id,
        Annotation.auto_highlighted.is_(True),
      ).delete(synchronize_session=False)

      count = 0
      anchored = 0
      for item in parsed:
        if not isinstance(item, dict):
          continue
        h_type = _normalize_highlight_type(item.get("type"))
        if not h_type:
          continue

        quote = item.get("quote") or item.get("text") or ""
        selection_data = None
        coordinate_data: dict[str, Any] = {}
        block = (
          _anchor_quote_to_block(quote, item.get("block_id"), blocks)
          if blocks and quote
          else None
        )
        if block is not None:
          selection_data, coordinate_data = _block_geometry(block)
          anchored += 1

        annotation = Annotation(
          paper_id=paper_id,
          content=quote,
          highlighted_text=quote,
          type="annotation",
          auto_highlighted=True,
          highlight_type=h_type,
          selection_data=selection_data,
          coordinate_data=coordinate_data,
        )
        session.add(annotation)
        count += 1
      session.commit()
      logger.info(
        f"Generated {count} highlights ({anchored} anchored)", paper_id=paper_id
      )
      return {
        "status": "success",
        "paper_id": paper_id,
        "count": count,
        "anchored": anchored,
      }

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
  push_paper_progress(paper_id, {"step": "embedding", "status": "running"})
  session = get_sync_session()
  try:
    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
      return {"status": "error", "error": "Paper not found", "paper_id": paper_id}

    # Embeddings always use Google's models via GOOGLE_API_KEY env var,
    # regardless of the user's configured chat provider.
    if not settings.GOOGLE_API_KEY:
      return {
        "status": "error",
        "error": "GOOGLE_API_KEY not set — cannot generate embeddings. Set it in your environment.",
        "paper_id": paper_id,
      }

    from app.services.ai.providers.gemini import GeminiProvider

    p = GeminiProvider(
      ProviderConfig(
        provider="gemini",
        api_key=settings.GOOGLE_API_KEY,
        embedding_model=settings.EMBEDDING_MODEL,
        embedding_dimension=settings.EMBEDDING_DIMENSION,
      )
    )

    text_to_embed = paper.content_text or paper.title or ""
    if not text_to_embed:
      return {"status": "error", "error": "No text to embed", "paper_id": paper_id}

    max_chars = 80000
    import asyncio

    config = EmbeddingConfig(
      model=p.config.embedding_model or settings.EMBEDDING_MODEL,
      task_type="RETRIEVAL_DOCUMENT",
      dimensions=p.config.embedding_dimension or settings.EMBEDDING_DIMENSION,
    )
    embeddings = asyncio.run(p.embed([text_to_embed[:max_chars]], config))

    if embeddings and len(embeddings) > 0:
      paper.embedding = embeddings[0]
      session.commit()
      logger.info("Generated embedding", paper_id=paper_id)
      return {
        "status": "success",
        "paper_id": paper_id,
        "dimension": len(embeddings[0]),
      }

    return {"status": "error", "error": "No embedding returned", "paper_id": paper_id}

  except Exception as e:
    session.rollback()
    if (
      isinstance(e, (ConnectionError, TimeoutError, OSError))
      and self.request.retries < self.max_retries
    ):
      logger.warning(
        "Transient embedding error, retrying", paper_id=paper_id, error=str(e)
      )
      raise self.retry(exc=e)
    logger.warning(
      "Skipping embedding — generation failed", paper_id=paper_id, error=str(e)
    )
    return {"status": "skipped", "error": str(e), "paper_id": paper_id}
  finally:
    session.close()
