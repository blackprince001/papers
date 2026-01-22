"""AI Highlighter service for auto-highlighting key sections."""

from typing import cast

from google.genai import errors as genai_errors
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import get_logger
from app.models.annotation import Annotation
from app.models.paper import Paper
from app.services.base_ai_service import BaseGoogleAIService
from app.services.content_provider import content_provider
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)


class AIHighlighterService(BaseGoogleAIService):
  """Service for auto-highlighting key sections in research papers."""

  # Valid highlight types that match the database enum
  VALID_HIGHLIGHT_TYPES = {"method", "result", "conclusion", "key_contribution"}

  # Map common AI variations to valid enum values
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

  def _normalize_highlight_type(self, raw_type: str | None) -> str | None:
    """Normalize highlight type to valid enum value."""
    if not raw_type:
      return None

    normalized = raw_type.lower().strip()

    # Check if it's already valid
    if normalized in self.VALID_HIGHLIGHT_TYPES:
      return normalized

    # Check aliases
    if normalized in self.HIGHLIGHT_TYPE_ALIASES:
      return self.HIGHLIGHT_TYPE_ALIASES[normalized]

    # Unknown type - log and skip
    logger.warning(
      "Unknown highlight type from AI",
      raw_type=raw_type,
      valid_types=list(self.VALID_HIGHLIGHT_TYPES),
    )
    return None

  def _parse_highlights_response(
    self, response_text: str, paper_id: int
  ) -> list[Annotation]:
    """Parse AI response into annotation objects."""
    highlights_data = extract_json_from_text(response_text)

    if not isinstance(highlights_data, list):
      logger.warning(
        "Invalid highlights response type",
        expected="list",
        actual=type(highlights_data).__name__,
      )
      return []

    annotations = []
    for highlight in highlights_data:
      if not isinstance(highlight, dict):
        continue

      # Normalize the highlight type to valid enum value
      highlight_type = self._normalize_highlight_type(highlight.get("type"))
      if not highlight_type:
        continue  # Skip highlights with invalid types

      annotation = Annotation(
        paper_id=paper_id,
        content=highlight.get("text", ""),
        highlighted_text=highlight.get("text", ""),
        type="annotation",
        auto_highlighted=True,
        highlight_type=highlight_type,
      )
      annotations.append(annotation)

    return annotations

  async def generate_highlights(
    self, db_session: AsyncSession, paper: Paper
  ) -> list[Annotation]:
    """Generate auto-highlights for important sections using full document context.

    Args:
        db_session: Database session for saving annotations
        paper: The paper to generate highlights for

    Returns:
        List of Annotation objects for key sections
    """
    client = self._get_client()
    if not client:
      return []

    # Get content parts (file, URL, or text fallback)
    content_parts = await content_provider.get_content_parts(paper)

    prompt = f"""Identify key sections in this research paper:
- Methods (type: "method")
- Results (type: "result")
- Conclusions (type: "conclusion")
- Key contributions (type: "key_contribution")

Paper Title: {paper.title}

For each section, provide the exact text excerpt and its type.
IMPORTANT: Use exactly these type values: "method", "result", "conclusion", "key_contribution"

Return a JSON array with this structure:
[
  {{"text": "exact excerpt", "type": "method"}},
  {{"text": "exact excerpt", "type": "result"}},
  {{"text": "exact excerpt", "type": "conclusion"}},
  {{"text": "exact excerpt", "type": "key_contribution"}}
]"""

    try:
      # Build contents list: file parts first, then text prompt
      contents: list[types.Part] = []
      contents.extend(content_parts)
      contents.append(types.Part.from_text(text=prompt))

      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=contents,
      )

      text = response.text if hasattr(response, "text") else str(response)
      return self._parse_highlights_response(cast(str, text), cast(int, paper.id))

    except genai_errors.ClientError as e:
      logger.error(
        "Client error generating highlights",
        paper_id=paper.id,
        error=str(e),
      )
      return []

    except genai_errors.ServerError as e:
      logger.error(
        "Server error generating highlights",
        paper_id=paper.id,
        error=str(e),
      )
      return []

    except genai_errors.APIError as e:
      logger.error(
        "API error generating highlights",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return []

    except Exception as e:
      logger.error(
        "Unexpected error generating highlights",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return []


ai_highlighter_service = AIHighlighterService()
