from typing import Optional

from google import genai
from google.genai import types

from app.core.config import settings


class PaperClassifier:
  # List of paper types to classify
  PAPER_TYPES = [
    "Analytical Paper",
    "Argumentative/Persuasive Paper",
    "Compare and Contrast Paper",
    "Cause and Effect Paper",
    "Descriptive Paper",
    "Experimental Paper",
    "Interpretative Paper",
    "Review Paper (Literature Review)",
    "Survey Paper",
    "Case Study",
    "Theoretical/Conceptual Paper",
  ]

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

  def classify_paper(
    self, title: str, content: Optional[str] = None, metadata: Optional[dict] = None
  ) -> Optional[str]:
    client = self._get_client()
    if not client:
      return None

    paper_types_list = "\n".join(f"- {pt}" for pt in self.PAPER_TYPES)

    content_preview = ""
    if content:
      content_preview = content[:2000]
      if len(content) > 2000:
        content_preview += "..."

    author_info = ""
    subject_info = ""
    if metadata:
      if metadata.get("author"):
        author_info = f"\nAuthor(s): {metadata.get('author')}"
      if metadata.get("subject"):
        subject_info = f"\nSubject: {metadata.get('subject')}"

    prompt = f"""Classify the following research paper into one of these types:

{paper_types_list}

Paper Information:
Title: {title}{author_info}{subject_info}

Content Preview:
{content_preview if content_preview else "No content available"}

Based on the title, author information, subject, and content preview, classify this paper into exactly one of the types listed above. 
Respond with ONLY the paper type name exactly as it appears in the list above, nothing else."""

    try:
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
      )

      if hasattr(response, "text") and response.text:
        classification = response.text.strip()

        for paper_type in self.PAPER_TYPES:
          if (
            paper_type.lower() in classification.lower()
            or classification.lower() in paper_type.lower()
          ):
            return paper_type

        return classification

      return None

    except Exception as e:
      import logging
      logger = logging.getLogger(__name__)
      logger.error(f"Error classifying paper: {type(e).__name__}: {e}")
      return None


paper_classifier = PaperClassifier()
