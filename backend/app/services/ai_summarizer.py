"""AI Summarizer service for generating paper summaries and insights."""

from typing import Any, cast

from google.genai import errors as genai_errors
from google.genai import types

from app.core.config import settings
from app.core.logger import get_logger
from app.models.paper import Paper
from app.services.base_ai_service import BaseGoogleAIService
from app.services.content_provider import content_provider
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)


class AISummarizerService(BaseGoogleAIService):
  """Service for generating AI summaries and extracting insights from papers."""

  def _build_contents(
    self, content_parts: list[types.Part], prompt: str
  ) -> list[types.Part]:
    """Build the contents list with file parts and prompt."""
    contents: list[types.Part] = []
    contents.extend(content_parts)
    contents.append(types.Part.from_text(text=prompt))
    return contents

  async def generate_summary(self, paper: Paper) -> str | None:
    """Generate AI summary for a paper using full document context.

    Args:
        paper: The paper to summarize (uses file/URL if available)

    Returns:
        Generated summary text or None if failed
    """
    client = self._get_client()
    if not client:
      return None

    # Get content parts (file, URL, or text fallback)
    content_parts = await content_provider.get_content_parts(paper)

    prompt = f"""Generate a concise summary (2-3 paragraphs) of this research paper.

Paper Title: {paper.title}

Provide a clear, structured summary covering the main objectives, methodology, key findings, and conclusions."""

    try:
      contents = self._build_contents(content_parts, prompt)
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=contents,
      )
      return response.text if hasattr(response, "text") else str(response)

    except genai_errors.ClientError as e:
      # Client errors (4xx) - invalid request, bad API key, etc.
      logger.error(
        "Client error generating summary - check API key or request",
        paper_id=paper.id,
        error=str(e),
      )
      return None

    except genai_errors.ServerError as e:
      # Server errors (5xx) - temporary issues, rate limits
      logger.error(
        "Server error generating summary - may be temporary",
        paper_id=paper.id,
        error=str(e),
      )
      return None

    except genai_errors.APIError as e:
      # General API errors
      logger.error(
        "API error generating summary",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return None

    except Exception as e:
      # Unexpected errors (network issues, etc.)
      logger.error(
        "Unexpected error generating summary",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return None

  async def extract_findings(self, paper: Paper) -> dict[str, Any] | None:
    """Extract key findings from a paper using full document context.

    Args:
        paper: The paper to extract findings from

    Returns:
        Dictionary with key_findings, conclusions, methodology, etc.
    """
    client = self._get_client()
    if not client:
      return None

    # Get content parts (file, URL, or text fallback)
    content_parts = await content_provider.get_content_parts(paper)

    prompt = f"""Extract key findings from this research paper in JSON format.

Paper Title: {paper.title}

Return a JSON object with this structure:
{{
  "key_findings": ["finding1", "finding2", ...],
  "conclusions": ["conclusion1", "conclusion2", ...],
  "methodology": "brief methodology description",
  "limitations": ["limitation1", "limitation2", ...],
  "future_work": ["future work item1", "future work item2", ...]
}}"""

    try:
      contents = self._build_contents(content_parts, prompt)
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=contents,
      )

      text = response.text if hasattr(response, "text") else str(response)
      findings_data = extract_json_from_text(cast(str, text))

      if not isinstance(findings_data, dict):
        logger.warning(
          "Invalid findings response type",
          expected="dict",
          actual=type(findings_data).__name__,
        )
        return None

      return findings_data

    except genai_errors.ClientError as e:
      logger.error(
        "Client error extracting findings",
        paper_id=paper.id,
        error=str(e),
      )
      return None

    except genai_errors.ServerError as e:
      logger.error(
        "Server error extracting findings",
        paper_id=paper.id,
        error=str(e),
      )
      return None

    except genai_errors.APIError as e:
      logger.error(
        "API error extracting findings",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return None

    except Exception as e:
      logger.error(
        "Unexpected error extracting findings",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return None

  async def generate_reading_guide(self, paper: Paper) -> dict[str, Any] | None:
    """Generate reading guide with questions using full document context.

    Args:
        paper: The paper to generate a reading guide for

    Returns:
        Dictionary with pre_reading, during_reading, post_reading questions
    """
    client = self._get_client()
    if not client:
      return None

    # Get content parts (file, URL, or text fallback)
    content_parts = await content_provider.get_content_parts(paper)

    prompt = f"""Create a reading guide for this research paper.

Paper Title: {paper.title}

Return a JSON object with this structure:
{{
  "pre_reading": ["question1", "question2", ...],
  "during_reading": ["question1", "question2", ...],
  "post_reading": ["question1", "question2", ...]
}}"""

    try:
      contents = self._build_contents(content_parts, prompt)
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=contents,
      )

      text = response.text if hasattr(response, "text") else str(response)
      guide_data = extract_json_from_text(cast(str, text))

      if not isinstance(guide_data, dict):
        logger.warning(
          "Invalid reading guide response type",
          expected="dict",
          actual=type(guide_data).__name__,
        )
        return None

      return guide_data

    except genai_errors.ClientError as e:
      logger.error(
        "Client error generating reading guide",
        paper_id=paper.id,
        error=str(e),
      )
      return None

    except genai_errors.ServerError as e:
      logger.error(
        "Server error generating reading guide",
        paper_id=paper.id,
        error=str(e),
      )
      return None

    except genai_errors.APIError as e:
      logger.error(
        "API error generating reading guide",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return None

    except Exception as e:
      logger.error(
        "Unexpected error generating reading guide",
        paper_id=paper.id,
        error_type=type(e).__name__,
        error=str(e),
      )
      return None


ai_summarizer_service = AISummarizerService()
