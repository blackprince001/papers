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


class AISummarizerService(BaseGoogleAIService):
  def _build_contents(
    self, content_parts: list[types.Part], prompt: str
  ) -> list[types.Part]:
    contents: list[types.Part] = []
    contents.extend(content_parts)
    contents.append(types.Part.from_text(text=prompt))
    return contents

  async def _generate_content(self, paper: Paper, prompt: str) -> str | None:
    client = self._get_client()
    if not client:
      return None

    content_parts = await content_provider.get_content_parts(paper)
    contents = self._build_contents(content_parts, prompt)

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL, contents=contents
      )
      return response.text if hasattr(response, "text") else str(response)
    except genai_errors.APIError as e:
      logger.error("API error generating content", paper_id=paper.id, error=str(e))
      return None

  async def _generate_json_content(
    self, paper: Paper, prompt: str
  ) -> dict[str, Any] | None:
    text = await self._generate_content(paper, prompt)
    if not text:
      return None

    parsed = extract_json_from_text(cast(str, text))
    if not isinstance(parsed, dict):
      logger.warning(
        "Invalid response type", expected="dict", actual=type(parsed).__name__
      )
      return None

    return parsed

  async def generate_summary(self, paper: Paper) -> str | None:
    prompt = SUMMARY_PROMPT.format(title=paper.title)
    return await self._generate_content(paper, prompt)

  async def extract_findings(self, paper: Paper) -> dict[str, Any] | None:
    prompt = FINDINGS_PROMPT.format(title=paper.title)
    return await self._generate_json_content(paper, prompt)

  async def generate_reading_guide(self, paper: Paper) -> dict[str, Any] | None:
    prompt = READING_GUIDE_PROMPT.format(title=paper.title)
    return await self._generate_json_content(paper, prompt)


ai_summarizer_service = AISummarizerService()
