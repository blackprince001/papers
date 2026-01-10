from typing import List, Optional, cast

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.annotation import Annotation
from app.utils.json_extractor import extract_json_from_text


class AIHighlighterService:
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

  async def generate_highlights(
    self, session: AsyncSession, paper_id: int, content: str
  ) -> List[Annotation]:
    """Generate auto-highlights for important sections."""
    client = self._get_client()
    if not client:
      return []

    prompt = f"""Identify the key sections in the following research paper content:
- Methods section
- Results section  
- Conclusions section
- Key contributions

For each section, provide the exact text excerpt that should be highlighted and its type (method, result, conclusion, or key_contribution).

Return a JSON array with this structure:
[
  {{"text": "exact excerpt", "type": "method"}},
  {{"text": "exact excerpt", "type": "result"}},
  ...
]

Content:
{content[:8000] if len(content) > 8000 else content}"""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
      )

      text = response.text if hasattr(response, "text") else str(response)

      # Use robust JSON extraction to handle markdown code blocks and extra text
      highlights_data = extract_json_from_text(cast(str, text))

      # Validate that we got a list
      if not isinstance(highlights_data, list):
        print(
          f"Error generating highlights: Expected list, got {type(highlights_data)}"
        )
        return []

      annotations = []
      for highlight in highlights_data:
        if not isinstance(highlight, dict):
          continue
        annotation = Annotation(
          paper_id=paper_id,
          content=highlight.get("text", ""),
          highlighted_text=highlight.get("text", ""),
          type="annotation",
          auto_highlighted=True,
          highlight_type=highlight.get("type"),
        )
        annotations.append(annotation)

      return annotations
    except Exception as e:
      import logging
      logger = logging.getLogger(__name__)
      logger.error(f"Error generating highlights: {type(e).__name__}: {e}", exc_info=True)

    return []


ai_highlighter_service = AIHighlighterService()
