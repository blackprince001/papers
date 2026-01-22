import asyncio
import io
import json
import re
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pypdf import PdfReader

from app.core.config import settings
from app.core.logger import get_logger
from app.schemas.paper import PaperMetadata

logger = get_logger(__name__)

METADATA_EXTRACTION_PROMPT = """Extract metadata from this research paper. \
Analyze the following text from the first page(s) of the paper and extract \
all available metadata.

Text from first page(s):
{text}

Extract the following information:
- Title: The exact paper title
- Authors: List of all author names (format: "First Last" for each author)
- Publication Date: Publication date in YYYY-MM-DD format if available
- Journal: Journal or conference name if mentioned
- Volume: Journal volume number if available
- Issue: Journal issue number if available
- Pages: Page numbers (e.g., "1-10" or "123-145") if available
- DOI: Digital Object Identifier if mentioned
- Abstract: The abstract text if present
- Keywords: List of keywords if mentioned

IMPORTANT: Return ONLY a valid JSON object with this structure:
{{
  "title": "paper title here",
  "authors": ["Author One", "Author Two"],
  "publication_date": "YYYY-MM-DD or YYYY",
  "journal": "journal name",
  "volume": "volume number",
  "issue": "issue number",
  "pages": "page range",
  "doi": "doi identifier",
  "abstract": "abstract text",
  "keywords": ["keyword1", "keyword2"]
}}"""

TITLE_EXTRACTION_PROMPT = """Extract the exact title of this research paper.

Text from first page(s):
{text}

Extract ONLY the paper title. Return just the title, nothing else."""

AFFILIATION_MARKERS = ["@", ".edu", ".com", "university", "department", "institute"]
SECTION_MARKERS = ["abstract", "introduction", "keywords", "1. introduction"]


def clean_json_response(response_text: str) -> str:
  cleaned = response_text.strip()
  if not cleaned.startswith("```"):
    return cleaned

  first_newline = cleaned.find("\n")
  if first_newline != -1:
    cleaned = cleaned[first_newline + 1 :]

  if cleaned.endswith("```"):
    cleaned = cleaned[:-3]

  return cleaned.strip()


def parse_metadata_response(response_text: str) -> PaperMetadata | None:
  try:
    cleaned_text = clean_json_response(response_text)
    data = json.loads(cleaned_text)

    metadata = PaperMetadata(
      title=data.get("title"),
      authors=data.get("authors", []),
      publication_date=data.get("publication_date"),
      journal=data.get("journal"),
      volume=data.get("volume"),
      issue=data.get("issue"),
      pages=data.get("pages"),
      doi=data.get("doi"),
      abstract=data.get("abstract"),
      keywords=data.get("keywords"),
    )

    if metadata.title or metadata.authors:
      return metadata
    return None
  except (json.JSONDecodeError, ValueError, TypeError) as e:
    logger.warning("Failed to parse metadata response", error=str(e))
    return None


def is_author_line(line: str) -> bool:
  pattern = r"^[A-Z][a-z]+\s+[A-Z][a-z]+"
  return bool(re.match(pattern, line)) and len(line.split()) <= 4


def is_affiliation_line(line: str) -> bool:
  line_lower = line.lower()
  return any(marker in line_lower for marker in AFFILIATION_MARKERS)


def find_abstract_index(lines: list[str]) -> int | None:
  for i, line in enumerate(lines[:20]):
    line_lower = line.lower()
    if any(keyword in line_lower for keyword in SECTION_MARKERS):
      return i
  return None


class PDFParser:
  def _extract_text_sync(self, pdf_content: bytes, max_pages: int | None = None) -> str:
    try:
      reader = PdfReader(io.BytesIO(pdf_content))
      pages = reader.pages[:max_pages] if max_pages else reader.pages
      text_parts = [page.extract_text() for page in pages if page.extract_text()]
      return "\n\n".join(text_parts)
    except Exception as e:
      raise ValueError(f"Failed to parse PDF: {str(e)}") from e

  async def extract_text(self, pdf_content: bytes, max_pages: int | None = None) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
      None, self._extract_text_sync, pdf_content, max_pages
    )

  def _read_first_pages_text(
    self, pdf_content: bytes, max_chars: int = 5000
  ) -> str | None:
    try:
      reader = PdfReader(io.BytesIO(pdf_content))
      if len(reader.pages) == 0:
        return None

      text_parts = []
      char_count = 0

      for page in reader.pages[:3]:
        text = page.extract_text()
        if not text:
          continue

        remaining = max_chars - char_count
        if remaining <= 0:
          break

        if len(text) > remaining:
          text_parts.append(text[:remaining])
          break

        text_parts.append(text)
        char_count += len(text)

      if not text_parts:
        return None
      return "\n\n".join(text_parts)[:max_chars]
    except Exception:
      return None

  async def _call_metadata_api(self, client: genai.Client, prompt: str) -> str | None:
    try:
      loop = asyncio.get_event_loop()
      response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
          model=settings.GENAI_MODEL,
          contents=types.Part.from_text(text=prompt),
        ),
      )
      if hasattr(response, "text") and response.text:
        return response.text
      return None
    except genai_errors.APIError as e:
      logger.warning("API error in metadata extraction", error=str(e))
      return None

  async def extract_metadata_structured(
    self, pdf_content: bytes
  ) -> PaperMetadata | None:
    if not settings.GOOGLE_API_KEY:
      return None

    try:
      loop = asyncio.get_event_loop()
      first_pages_text = await loop.run_in_executor(
        None, self._read_first_pages_text, pdf_content
      )
      if not first_pages_text:
        return None

      client = genai.Client(api_key=settings.GOOGLE_API_KEY)
      prompt = METADATA_EXTRACTION_PROMPT.format(text=first_pages_text)
      response_text = await self._call_metadata_api(client, prompt)

      if not response_text:
        return None
      return parse_metadata_response(response_text)
    except Exception as e:
      logger.error("Error in structured metadata extraction", error=str(e))
      return None

  async def extract_metadata(self, pdf_content: bytes) -> dict[str, Any]:
    extracted: dict[str, Any] = {}

    try:
      reader = PdfReader(io.BytesIO(pdf_content))
      extracted["num_pages"] = len(reader.pages)
    except Exception:
      pass

    structured = await self.extract_metadata_structured(pdf_content)
    if not structured:
      return extracted

    extracted["title"] = structured.title or ""
    extracted["author"] = ", ".join(structured.authors) if structured.authors else ""
    extracted["subject"] = structured.journal or ""
    extracted["publication_date"] = structured.publication_date or ""
    extracted["volume"] = structured.volume or ""
    extracted["issue"] = structured.issue or ""
    extracted["pages"] = structured.pages or ""
    extracted["doi"] = structured.doi or ""
    extracted["abstract"] = structured.abstract or ""
    extracted["keywords"] = structured.keywords or []
    extracted["authors_list"] = structured.authors
    extracted["journal"] = structured.journal or ""

    return extracted

  def _extract_title_before_abstract(
    self, lines: list[str], abstract_idx: int
  ) -> str | None:
    title_lines = []

    for i in range(abstract_idx):
      line = lines[i]

      if is_author_line(line) and i + 1 < abstract_idx:
        if is_affiliation_line(lines[i + 1].lower()):
          break

      if is_affiliation_line(line):
        if title_lines:
          break
        continue

      word_count = len(line.split())
      if word_count >= 2:
        title_lines.append(line)
      elif title_lines:
        title_lines.append(line)

    if not title_lines:
      return None

    candidate = " ".join(title_lines)
    word_count = len(candidate.split())
    return candidate if 3 <= word_count <= 50 else None

  def _extract_title_fallback(self, lines: list[str]) -> str | None:
    for i in range(min(10, len(lines) - 2)):
      for num_lines in [4, 3, 2]:
        if i + num_lines > len(lines):
          continue

        candidate_lines = lines[i : i + num_lines]

        has_affiliations = any(is_affiliation_line(line) for line in candidate_lines)
        if has_affiliations:
          continue

        has_author_only = any(
          is_author_line(line) and len(line.split()) <= 3 for line in candidate_lines
        )
        if has_author_only:
          continue

        candidate = " ".join(candidate_lines)
        word_count = len(candidate.split())
        if 3 <= word_count <= 50:
          return candidate

    for line in lines[:10]:
      word_count = len(line.split())
      if 3 <= word_count <= 30 and not is_affiliation_line(line):
        return line

    return None

  def _extract_title_heuristic(self, first_pages_text: str) -> str | None:
    if not first_pages_text:
      return None

    lines = [line.strip() for line in first_pages_text.split("\n") if line.strip()]
    if not lines:
      return None

    abstract_idx = find_abstract_index(lines)

    if abstract_idx is not None and abstract_idx > 0:
      title = self._extract_title_before_abstract(lines, abstract_idx)
      if title:
        return title

    return self._extract_title_fallback(lines)

  def _extract_title_llm(self, first_pages_text: str) -> str | None:
    if not settings.GOOGLE_API_KEY:
      return None

    try:
      client = genai.Client(api_key=settings.GOOGLE_API_KEY)
      text_preview = first_pages_text[:2000]
      if len(first_pages_text) > 2000:
        text_preview += "..."

      prompt = TITLE_EXTRACTION_PROMPT.format(text=text_preview)
      response = client.models.generate_content(
        model=settings.GENAI_MODEL,
        contents=types.Part.from_text(text=prompt),
      )

      if not (hasattr(response, "text") and response.text):
        return None

      title = response.text.strip()
      title = re.sub(r'^["\']|["\']$', "", title).strip()

      word_count = len(title.split())
      return title if 3 <= word_count <= 50 else None
    except Exception as e:
      logger.error("Error extracting title with LLM", error=str(e))
      return None

  def extract_title_from_content(self, pdf_content: bytes) -> str | None:
    try:
      reader = PdfReader(io.BytesIO(pdf_content))
      if len(reader.pages) == 0:
        return None

      text_parts = [
        page.extract_text() for page in reader.pages[:2] if page.extract_text()
      ]
      if not text_parts:
        return None

      first_pages_text = "\n\n".join(text_parts)
      title = self._extract_title_heuristic(first_pages_text)

      if not title or len(title.split()) < 3:
        llm_title = self._extract_title_llm(first_pages_text)
        if llm_title:
          title = llm_title

      return title
    except Exception as e:
      logger.error("Error extracting title from PDF", error=str(e))
      return None


pdf_parser = PDFParser()
