from typing import cast

from google import genai
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import get_logger
from app.models.annotation import Annotation
from app.utils.json_extractor import extract_json_from_text

logger = get_logger(__name__)


class AIHighlighterService:
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

  async def generate_highlights(
    self, db_session: AsyncSession, paper_id: int, content: str
  ) -> list[Annotation]:
    """Generate auto-highlights for important sections."""
    client = self._get_client()
    if not client:
      return []

    content_preview = content[:8000] if len(content) > 8000 else content
    prompt = f"""Identify key sections in this research paper content:
- Methods section
- Results section  
- Conclusions section
- Key contributions

For each section, provide the exact text excerpt and its type.

Return a JSON array with this structure:
[
  {{"text": "exact excerpt", "type": "method"}},
  {{"text": "exact excerpt", "type": "result"}},
  ...
]

Content:
{content_preview}"""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
      )

      text = response.text if hasattr(response, "text") else str(response)
      return self._parse_highlights_response(cast(str, text), paper_id)

    except Exception as e:
      logger.error(
        "Error generating highlights", error_type=type(e).__name__, error=str(e)
      )
      return []


ai_highlighter_service = AIHighlighterService()
