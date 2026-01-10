from typing import Dict, Optional, cast

from google import genai
from google.genai import types

from app.core.config import settings
from app.utils.json_extractor import extract_json_from_text


class AISummarizerService:
  def __init__(self):
    self.client: Optional[genai.Client] = None
    self._last_api_key: Optional[str] = None
    self._initialize_client()

  def _initialize_client(self):
    """Initialize or refresh the Google API client with current settings."""
    current_key = settings.GOOGLE_API_KEY
    # Only recreate client if API key changed or client doesn't exist
    if current_key and (not self.client or self._last_api_key != current_key):
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key
    elif not current_key:
      self.client = None
      self._last_api_key = None

  def _get_client(self) -> Optional[genai.Client]:
    """Get the current client, refreshing if API key changed."""
    self._initialize_client()
    return self.client

  async def generate_summary(self, title: str, content: str) -> Optional[str]:
    """Generate AI summary for a paper."""
    client = self._get_client()
    if not client:
      return None

    prompt = f"""Generate a concise summary (2-3 paragraphs) of the following research paper:

Title: {title}

Content:
{content[:5000] if len(content) > 5000 else content}

Provide a clear, structured summary covering the main objectives, methodology, key findings, and conclusions."""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
      )
      return response.text if hasattr(response, "text") else str(response)
    except Exception as e:
      import logging
      logger = logging.getLogger(__name__)
      error_type = type(e).__name__
      error_str = str(e)
      logger.error(f"Error generating summary: {error_type}: {error_str}")
      
      # Check if it's an API key error
      if "API key" in error_str or "api_key" in error_str.lower() or "INVALID_ARGUMENT" in error_str:
        logger.error("Invalid or missing Google API key. Please check your GOOGLE_API_KEY configuration.")
      
      return None

  async def extract_findings(self, title: str, content: str) -> Optional[Dict]:
    """Extract key findings from a paper."""
    client = self._get_client()
    if not client:
      return None

    prompt = f"""Extract key findings from the following research paper in JSON format:

Title: {title}

Content:
{content[:5000] if len(content) > 5000 else content}

Return a JSON object with the following structure:
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

      # Use robust JSON extraction to handle markdown code blocks and extra text
      findings_data = extract_json_from_text(cast(str, text))
      
      # Validate that we got a dict
      if not isinstance(findings_data, dict):
        print(f"Error extracting findings: Expected dict, got {type(findings_data)}")
        return None

      return findings_data
    except Exception as e:
      import logging
      logger = logging.getLogger(__name__)
      logger.error(f"Error extracting findings: {type(e).__name__}: {e}", exc_info=True)
      return None

  async def generate_reading_guide(self, title: str, content: str) -> Optional[Dict]:
    """Generate reading guide with questions."""
    client = self._get_client()
    if not client:
      return None

    prompt = f"""Create a reading guide for the following research paper:

Title: {title}

Content:
{content[:5000] if len(content) > 5000 else content}

Return a JSON object with the following structure:
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

      # Use robust JSON extraction to handle markdown code blocks and extra text
      guide_data = extract_json_from_text(cast(str, text))
      
      # Validate that we got a dict
      if not isinstance(guide_data, dict):
        print(f"Error generating reading guide: Expected dict, got {type(guide_data)}")
        return None

      return guide_data
    except Exception as e:
      import logging
      logger = logging.getLogger(__name__)
      logger.error(f"Error generating reading guide: {type(e).__name__}: {e}", exc_info=True)
      return None


ai_summarizer_service = AISummarizerService()
