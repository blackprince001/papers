import asyncio
import io
import json
import re
from typing import Any

from google import genai
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


def _clean_json_response(response_text: str) -> str:
  """Remove markdown code blocks from JSON response."""
  cleaned = response_text.strip()
  if not cleaned.startswith("```"):
    return cleaned

  first_newline = cleaned.find("\n")
  if first_newline != -1:
    cleaned = cleaned[first_newline + 1 :]

  if cleaned.endswith("```"):
    cleaned = cleaned[:-3]

  return cleaned.strip()


def _parse_metadata_response(response_text: str) -> PaperMetadata | None:
  """Parse JSON response into PaperMetadata object."""
  try:
    cleaned_text = _clean_json_response(response_text)
    response_data = json.loads(cleaned_text)

    metadata = PaperMetadata(
      title=response_data.get("title"),
      authors=response_data.get("authors", []),
      publication_date=response_data.get("publication_date"),
      journal=response_data.get("journal"),
      volume=response_data.get("volume"),
      issue=response_data.get("issue"),
      pages=response_data.get("pages"),
      doi=response_data.get("doi"),
      abstract=response_data.get("abstract"),
      keywords=response_data.get("keywords"),
    )

    has_title_or_authors = metadata.title or metadata.authors
    return metadata if has_title_or_authors else None

  except (json.JSONDecodeError, ValueError, TypeError) as e:
    logger.warning("Failed to parse metadata response", error=str(e))
    return None


def _is_author_line(line: str) -> bool:
  """Check if line looks like an author name."""
  pattern = r"^[A-Z][a-z]+\s+[A-Z][a-z]+"
  return bool(re.match(pattern, line)) and len(line.split()) <= 4


def _is_affiliation_line(line: str) -> bool:
  """Check if line looks like institutional affiliation."""
  affiliation_markers = ["@", ".edu", ".com", "university", "department", "institute"]
  return any(marker in line.lower() for marker in affiliation_markers)


def _find_abstract_index(lines: list[str]) -> int | None:
  """Find the line index where abstract/introduction starts."""
  section_markers = ["abstract", "introduction", "keywords", "1. introduction"]

  for i, line in enumerate(lines[:20]):
    line_lower = line.lower()
    if any(keyword in line_lower for keyword in section_markers):
      return i

  return None


class PDFParser:
  @staticmethod
  def _extract_text_sync(pdf_content: bytes, max_pages: int | None = None) -> str:
    """Synchronously extract text from PDF."""
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      pages_to_process = reader.pages[:max_pages] if max_pages else reader.pages
      text_parts = [
        page.extract_text() for page in pages_to_process if page.extract_text()
      ]

      return "\n\n".join(text_parts)
    except Exception as e:
      raise ValueError(f"Failed to parse PDF: {str(e)}") from e

  @staticmethod
  async def extract_text(pdf_content: bytes, max_pages: int | None = None) -> str:
    """Async wrapper for text extraction."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
      None, PDFParser._extract_text_sync, pdf_content, max_pages
    )

  @staticmethod
  def _read_first_pages_text(pdf_content: bytes, max_chars: int = 5000) -> str | None:
    """Extract limited text from first pages for metadata extraction."""
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

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

      result = "\n\n".join(text_parts)
      return result[:max_chars]
    except Exception:
      return None

  @staticmethod
  async def _call_metadata_api(client: genai.Client, prompt: str) -> str | None:
    """Call GenAI API for metadata extraction."""
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

    except Exception as e:
      error_str = str(e)
      is_rate_limited = (
        "429" in error_str
        or "RESOURCE_EXHAUSTED" in error_str
        or "quota" in error_str.lower()
      )

      if is_rate_limited:
        logger.warning("Rate limit in metadata extraction", error=error_str)
      else:
        logger.error("API error in metadata extraction", error=error_str)

      return None

  @staticmethod
  async def extract_metadata_structured(
    pdf_content: bytes,
  ) -> PaperMetadata | None:
    """Extract metadata using structured output from GenAI."""
    if not settings.GOOGLE_API_KEY:
      return None

    try:
      loop = asyncio.get_event_loop()
      first_pages_text = await loop.run_in_executor(
        None, PDFParser._read_first_pages_text, pdf_content
      )

      if not first_pages_text:
        return None

      client = genai.Client(api_key=settings.GOOGLE_API_KEY)
      prompt = METADATA_EXTRACTION_PROMPT.format(text=first_pages_text)

      response_text = await PDFParser._call_metadata_api(client, prompt)
      if not response_text:
        return None

      return _parse_metadata_response(response_text)

    except Exception as e:
      logger.error("Error in structured metadata extraction", error=str(e))
      return None

  @staticmethod
  async def extract_metadata(pdf_content: bytes) -> dict[str, Any]:
    """Extract metadata from PDF using AI-structured extraction."""
    extracted_metadata: dict[str, Any] = {}

    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)
      extracted_metadata["num_pages"] = len(reader.pages)
    except Exception:
      pass

    structured = await PDFParser.extract_metadata_structured(pdf_content)

    if not structured:
      return extracted_metadata

    extracted_metadata["title"] = structured.title or ""
    extracted_metadata["author"] = (
      ", ".join(structured.authors) if structured.authors else ""
    )
    extracted_metadata["subject"] = structured.journal or ""
    extracted_metadata["publication_date"] = structured.publication_date or ""
    extracted_metadata["volume"] = structured.volume or ""
    extracted_metadata["issue"] = structured.issue or ""
    extracted_metadata["pages"] = structured.pages or ""
    extracted_metadata["doi"] = structured.doi or ""
    extracted_metadata["abstract"] = structured.abstract or ""
    extracted_metadata["keywords"] = structured.keywords or []
    extracted_metadata["authors_list"] = structured.authors
    extracted_metadata["journal"] = structured.journal or ""

    return extracted_metadata

  @staticmethod
  def _extract_title_before_abstract(lines: list[str], abstract_idx: int) -> str | None:
    """Extract title from lines before abstract section."""
    title_lines = []

    for i in range(abstract_idx):
      line = lines[i]

      if _is_author_line(line) and i + 1 < abstract_idx:
        next_line = lines[i + 1].lower()
        if _is_affiliation_line(next_line):
          break

      if _is_affiliation_line(line):
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

  @staticmethod
  def _extract_title_fallback(lines: list[str]) -> str | None:
    """Fallback title extraction using heuristics."""
    for i in range(min(10, len(lines) - 2)):
      for num_lines in [4, 3, 2]:
        if i + num_lines > len(lines):
          continue

        candidate_lines = lines[i : i + num_lines]

        has_affiliations = any(_is_affiliation_line(line) for line in candidate_lines)
        if has_affiliations:
          continue

        has_author_only = any(
          _is_author_line(line) and len(line.split()) <= 3 for line in candidate_lines
        )
        if has_author_only:
          continue

        candidate = " ".join(candidate_lines)
        word_count = len(candidate.split())
        if 3 <= word_count <= 50:
          return candidate

    for line in lines[:10]:
      word_count = len(line.split())
      if 3 <= word_count <= 30 and not _is_affiliation_line(line):
        return line

    return None

  @staticmethod
  def _extract_title_heuristic(first_pages_text: str) -> str | None:
    """Extract title using heuristics from first page text."""
    if not first_pages_text:
      return None

    lines = [line.strip() for line in first_pages_text.split("\n") if line.strip()]
    if not lines:
      return None

    abstract_idx = _find_abstract_index(lines)

    if abstract_idx is not None and abstract_idx > 0:
      title = PDFParser._extract_title_before_abstract(lines, abstract_idx)
      if title:
        return title

    return PDFParser._extract_title_fallback(lines)

  @staticmethod
  def _extract_title_llm(first_pages_text: str) -> str | None:
    """Extract title using LLM from first page text."""
    if not settings.GOOGLE_API_KEY:
      return None

    try:
      client = genai.Client(api_key=settings.GOOGLE_API_KEY)

      text_preview = first_pages_text[:2000]
      if len(first_pages_text) > 2000:
        text_preview += "..."

      prompt = f"""Extract the exact title of this research paper.

Text from first page(s):
{text_preview}

Extract ONLY the paper title. Return just the title, nothing else."""

      response = client.models.generate_content(
        model=settings.GENAI_MODEL, contents=types.Part.from_text(text=prompt)
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

  @staticmethod
  def extract_title_from_content(pdf_content: bytes) -> str | None:
    """Extract paper title from PDF content."""
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      if len(reader.pages) == 0:
        return None

      text_parts = [
        page.extract_text() for page in reader.pages[:2] if page.extract_text()
      ]

      if not text_parts:
        return None

      first_pages_text = "\n\n".join(text_parts)

      title = PDFParser._extract_title_heuristic(first_pages_text)

      if not title or len(title.split()) < 3:
        llm_title = PDFParser._extract_title_llm(first_pages_text)
        if llm_title:
          title = llm_title

      return title

    except Exception as e:
      logger.error("Error extracting title from PDF", error=str(e))
      return None


pdf_parser = PDFParser()
