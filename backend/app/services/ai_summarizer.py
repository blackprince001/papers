from typing import Any, cast

from google import genai
from google.genai import types

from app.core.config import settings
from app.core.logger import get_logger
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)


class AISummarizerService:
  def __init__(self) -> None:
    self.client: genai.Client | None = None
    self._last_api_key: str | None = None
    self._initialize_client()

  def _initialize_client(self) -> None:
    """Initialize or refresh the Google API client with current settings."""
    current_key = settings.GOOGLE_API_KEY
    has_key_changed = self._last_api_key != current_key
    should_recreate = not self.client or has_key_changed

    if current_key and should_recreate:
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key
    elif not current_key:
      self.client = None
      self._last_api_key = None

  def _get_client(self) -> genai.Client | None:
    """Get the current client, refreshing if API key changed."""
    self._initialize_client()
    return self.client

  async def generate_summary(self, title: str, content: str) -> str | None:
    """Generate AI summary for a paper."""
    client = self._get_client()
    if not client:
      return None

    content_preview = content[:5000] if len(content) > 5000 else content
    prompt = f"""Generate a concise summary (2-3 paragraphs) of this research paper:

Title: {title}

Content:
{content_preview}

Provide a clear, structured summary covering the main objectives, methodology, key findings, and conclusions."""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
      )
      return response.text if hasattr(response, "text") else str(response)

    except Exception as e:
      error_str = str(e)
      logger.error(
        "Error generating summary", error_type=type(e).__name__, error=error_str
      )

      is_api_key_error = (
        "API key" in error_str
        or "api_key" in error_str.lower()
        or "INVALID_ARGUMENT" in error_str
      )
      if is_api_key_error:
        logger.error("Invalid or missing Google API key")

      return None

  async def extract_findings(self, title: str, content: str) -> dict[str, Any] | None:
    """Extract key findings from a paper."""
    client = self._get_client()
    if not client:
      return None

    content_preview = content[:5000] if len(content) > 5000 else content
    prompt = f"""Extract key findings from this research paper in JSON format:

Title: {title}

Content:
{content_preview}

Return a JSON object with this structure:
{{
  "key_findings": ["finding1", "finding2", ...],
  "conclusions": ["conclusion1", "conclusion2", ...],
  "methodology": "brief methodology description",
  "limitations": ["limitation1", "limitation2", ...],
  "future_work": ["future work item1", "future work item2", ...]
}}"""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
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

    except Exception as e:
      logger.error(
        "Error extracting findings", error_type=type(e).__name__, error=str(e)
      )
      return None

  async def generate_reading_guide(
    self, title: str, content: str
  ) -> dict[str, Any] | None:
    """Generate reading guide with questions."""
    client = self._get_client()
    if not client:
      return None

    content_preview = content[:5000] if len(content) > 5000 else content
    prompt = f"""Create a reading guide for this research paper:

Title: {title}

Content:
{content_preview}

Return a JSON object with this structure:
{{
  "pre_reading": ["question1", "question2", ...],
  "during_reading": ["question1", "question2", ...],
  "post_reading": ["question1", "question2", ...]
}}"""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
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

    except Exception as e:
      logger.error(
        "Error generating reading guide", error_type=type(e).__name__, error=str(e)
      )
      return None


ai_summarizer_service = AISummarizerService()
