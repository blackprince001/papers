import asyncio
import io
import json
import re
from typing import Any, cast

from google import genai
from google.genai import types
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import get_logger
from app.models.paper import Paper
from app.models.paper_citation import PaperCitation

logger = get_logger(__name__)

CITATION_EXTRACTION_PROMPT = """You are extracting citations from an academic paper. \
Identify and extract ONLY the citation entries from the text below.

Text from paper:
{text}

INSTRUCTIONS:
1. Identify citation entries - formatted bibliographic entries with authors, titles, etc.
2. Ignore body text, figures, tables, footnotes
3. Focus on entries following common citation formats (APA, MLA, Chicago, IEEE)
4. Extract ALL citations you find

For EACH citation entry, extract:
- title: The paper/article/book title (required)
- authors: List of author names as array
- year: Publication year as integer
- journal: Journal, conference, or venue name
- doi: DOI if mentioned (normalize by removing prefixes)
- pages: Page numbers or range
- volume: Volume number
- issue: Issue number

Return a JSON array of citations.

IMPORTANT: Return ONLY valid JSON array, no other text or markdown."""


REFERENCES_SECTION_PATTERNS = [
  r"(?i)^\s*references\s*$",
  r"(?i)^\s*bibliography\s*$",
  r"(?i)^\s*works\s+cited\s*$",
  r"(?i)^\s*literature\s+cited\s*$",
  r"(?i)^\s*citations\s*$",
  r"(?i)^\s*references\s+and\s+notes\s*$",
]


def _clean_json_response(response_text: str) -> str:
  """Remove markdown code blocks from response."""
  cleaned = response_text.strip()
  if not cleaned.startswith("```"):
    return cleaned

  first_newline = cleaned.find("\n")
  if first_newline != -1:
    cleaned = cleaned[first_newline + 1 :]

  if cleaned.endswith("```"):
    cleaned = cleaned[:-3]

  cleaned = cleaned.strip()
  if cleaned.startswith("json\n"):
    cleaned = cleaned[5:]

  return cleaned


def _normalize_doi(doi: str | None) -> str | None:
  """Normalize DOI by removing common prefixes."""
  if not doi:
    return None

  normalized = re.sub(
    r"^(doi:|DOI:|https?://(dx\.)?doi\.org/)",
    "",
    doi,
    flags=re.IGNORECASE,
  ).strip()

  return normalized if normalized else None


def _normalize_title(title: str) -> str:
  """Normalize title for comparison."""
  normalized = title.lower()
  normalized = re.sub(r"[^\w\s]", "", normalized)
  normalized = re.sub(r"\s+", " ", normalized)
  return normalized.strip()


def _calculate_jaccard_similarity(words1: set[str], words2: set[str]) -> float:
  """Calculate Jaccard similarity between two word sets."""
  if not words1 or not words2:
    return 0.0

  intersection = words1.intersection(words2)
  union = words1.union(words2)

  jaccard = len(intersection) / len(union) if union else 0.0

  if len(intersection) >= 3:
    jaccard = min(1.0, jaccard * 1.2)

  return jaccard


def _normalize_citation_field(value: Any) -> str | None:
  """Normalize a citation field to string or None."""
  if not value:
    return None
  result = str(value).strip()
  return result if result else None


def _parse_single_citation(raw_citation: dict[str, Any]) -> dict[str, Any] | None:
  """Parse and normalize a single citation dict."""
  if not isinstance(raw_citation, dict):
    return None

  title = _normalize_citation_field(raw_citation.get("title"))
  if not title:
    return None

  authors = raw_citation.get("authors", [])
  if not isinstance(authors, list):
    authors = []

  return {
    "title": title,
    "authors": authors,
    "year": raw_citation.get("year"),
    "journal": _normalize_citation_field(raw_citation.get("journal")),
    "doi": _normalize_doi(_normalize_citation_field(raw_citation.get("doi"))),
    "pages": _normalize_citation_field(raw_citation.get("pages")),
    "volume": _normalize_citation_field(raw_citation.get("volume")),
    "issue": _normalize_citation_field(raw_citation.get("issue")),
  }


def _build_citation_context(citation: dict[str, Any]) -> str:
  """Build a formatted context string from citation data."""
  parts = []

  if citation.get("authors"):
    parts.append(", ".join(citation["authors"][:3]))
  if citation.get("title"):
    parts.append(citation["title"])
  if citation.get("journal"):
    parts.append(citation["journal"])
  if citation.get("year"):
    parts.append(str(citation["year"]))

  return ". ".join(parts)[:500]


class CitationExtractor:
  @staticmethod
  def _find_references_start_position(full_text: str) -> int:
    """Find the start position of references section."""
    lines = full_text.split("\n")
    search_start = max(0, int(len(lines) * 0.6))

    for i in range(len(lines) - 1, search_start - 1, -1):
      line = lines[i].strip()
      for pattern in REFERENCES_SECTION_PATTERNS:
        if re.match(pattern, line):
          return sum(len(lines[j]) + 1 for j in range(i))

    return -1

  @staticmethod
  def _extract_all_text(reader: PdfReader) -> str | None:
    """Extract text from all pages of PDF."""
    text_parts = [page.extract_text() for page in reader.pages if page.extract_text()]
    return "\n\n".join(text_parts) if text_parts else None

  @staticmethod
  def _extract_fallback_text(reader: PdfReader) -> str | None:
    """Extract text from last half of document as fallback."""
    total_pages = len(reader.pages)
    start_page = 0 if total_pages < 10 else total_pages // 2

    text_parts = []
    for i in range(start_page, total_pages):
      text = reader.pages[i].extract_text()
      if text:
        text_parts.append(text)

    return "\n\n".join(text_parts) if text_parts else None

  @staticmethod
  def extract_references_section(pdf_content: bytes) -> str | None:
    """Extract text from PDF starting at the References section."""
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      if len(reader.pages) == 0:
        return None

      full_text = CitationExtractor._extract_all_text(reader)
      if not full_text:
        return None

      references_start = CitationExtractor._find_references_start_position(full_text)

      if references_start >= 0:
        return full_text[references_start:]

      return CitationExtractor._extract_fallback_text(reader)

    except Exception as e:
      logger.error("Error extracting references section", error=str(e))
      return None

  @staticmethod
  async def _call_citation_api(prompt: str) -> str | None:
    """Call GenAI API for citation extraction."""
    if not settings.GOOGLE_API_KEY:
      logger.warning("Google API key not available for citation parsing")
      return None

    try:
      client = genai.Client(api_key=settings.GOOGLE_API_KEY)
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
      logger.error("Error calling citation API", error=str(e))
      return None

  @staticmethod
  def _parse_citations_response(response_text: str) -> list[dict[str, Any]]:
    """Parse API response into list of citation dicts."""
    try:
      cleaned = _clean_json_response(response_text)
      citations_data = json.loads(cleaned)

      if not isinstance(citations_data, list):
        return []

      parsed = []
      for raw in citations_data:
        citation = _parse_single_citation(raw)
        if citation:
          parsed.append(citation)

      return parsed

    except (json.JSONDecodeError, ValueError, TypeError) as e:
      logger.warning("Error parsing citations JSON", error=str(e))
      return []

  @staticmethod
  async def parse_citations(references_text: str) -> list[dict[str, Any]]:
    """Parse individual citations from references text using AI."""
    if not references_text or not references_text.strip():
      return []

    max_chars = 20000
    text_to_parse = (
      references_text[-max_chars:]
      if len(references_text) > max_chars
      else references_text
    )

    prompt = CITATION_EXTRACTION_PROMPT.format(text=text_to_parse)
    response_text = await CitationExtractor._call_citation_api(prompt)

    if not response_text:
      return []

    return CitationExtractor._parse_citations_response(response_text)

  @staticmethod
  async def _match_by_doi(db_session: AsyncSession, doi: str | None) -> int | None:
    """Try to match citation by DOI."""
    if not doi:
      return None

    normalized_doi = re.sub(r"^(doi:|DOI:)", "", doi, flags=re.IGNORECASE).strip()

    query = select(Paper).where(Paper.doi == normalized_doi)
    result = await db_session.execute(query)
    paper = result.scalar_one_or_none()

    return cast(int, paper.id) if paper else None

  @staticmethod
  def _calculate_author_score(
    citation_authors: list[str], paper_metadata: dict[str, Any] | None
  ) -> float:
    """Calculate author matching score."""
    if not citation_authors or not paper_metadata:
      return 0.0

    paper_authors = paper_metadata.get("authors_list", [])
    if not isinstance(paper_authors, list) or not paper_authors:
      return 0.0

    citation_lastnames = {
      a.split()[-1].lower() for a in citation_authors[:3] if a.split()
    }
    paper_lastnames = {a.split()[-1].lower() for a in paper_authors[:3] if a.split()}

    if citation_lastnames.intersection(paper_lastnames):
      return 0.8

    return 0.0

  @staticmethod
  def _calculate_year_score(citation_year: int | None, paper: Paper) -> float:
    """Calculate year matching score."""
    if not citation_year:
      return 0.0

    paper_year = None
    if paper.metadata_json and paper.metadata_json.get("year"):
      try:
        paper_year = int(str(paper.metadata_json["year"])[:4])
      except (ValueError, TypeError):
        pass

    if not paper_year and paper.created_at:
      paper_year = paper.created_at.year

    if not paper_year:
      return 0.0

    year_diff = abs(citation_year - paper_year)
    if year_diff == 0:
      return 1.0
    if year_diff == 1:
      return 0.7
    if year_diff <= 3:
      return 0.4

    return 0.0

  @staticmethod
  def _calculate_title_similarity(title1: str, title2: str) -> float:
    """Calculate similarity between two titles."""
    if not title1 or not title2:
      return 0.0

    norm1 = _normalize_title(title1)
    norm2 = _normalize_title(title2)

    if norm1 == norm2:
      return 1.0

    if norm1 in norm2 or norm2 in norm1:
      return 0.85

    words1 = set(norm1.split())
    words2 = set(norm2.split())

    return _calculate_jaccard_similarity(words1, words2)

  @staticmethod
  def _compute_match_score(
    citation: dict[str, Any], paper: Paper, title_score: float
  ) -> float:
    """Compute composite match score for a paper."""
    author_score = CitationExtractor._calculate_author_score(
      citation.get("authors", []), cast(dict[str, Any], paper.metadata_json)
    )
    year_score = CitationExtractor._calculate_year_score(citation.get("year"), paper)

    composite = title_score * 0.6 + author_score * 0.25 + year_score * 0.15

    if title_score > 0.85:
      composite = max(composite, title_score * 0.9)

    return composite

  @staticmethod
  async def match_citation_to_paper(
    db_session: AsyncSession, citation: dict[str, Any]
  ) -> int | None:
    """Match a citation to an existing paper in the database."""
    if not citation:
      return None

    doi_match = await CitationExtractor._match_by_doi(db_session, citation.get("doi"))
    if doi_match:
      return doi_match

    title = citation.get("title")
    if not title or len(title.strip()) <= 5:
      return None

    query = select(Paper).where(Paper.title.ilike(f"%{title[:50]}%"))
    result = await db_session.execute(query)
    candidate_papers = result.scalars().all()

    if not candidate_papers:
      return None

    best_match = None
    best_score = 0.6

    for paper in candidate_papers:
      title_score = CitationExtractor._calculate_title_similarity(
        title.lower(), (paper.title or "").lower()
      )
      composite = CitationExtractor._compute_match_score(citation, paper, title_score)

      if composite > best_score:
        best_score = composite
        best_match = paper

    return cast(int, best_match.id) if best_match and best_score >= 0.6 else None

  @staticmethod
  async def _delete_existing_citations(db_session: AsyncSession, paper_id: int) -> None:
    """Delete existing citations for a paper."""
    query = select(PaperCitation).where(PaperCitation.paper_id == paper_id)
    result = await db_session.execute(query)
    existing = result.scalars().all()

    for citation in existing:
      await db_session.delete(citation)

    await db_session.flush()

  @staticmethod
  async def _store_single_citation(
    db_session: AsyncSession,
    paper_id: int,
    citation: dict[str, Any],
  ) -> bool:
    """Store a single citation. Returns True on success."""
    try:
      cited_paper_id = await CitationExtractor.match_citation_to_paper(
        db_session, citation
      )

      paper_citation = PaperCitation(
        paper_id=paper_id,
        cited_paper_id=cited_paper_id,
        citation_context=_build_citation_context(citation),
        external_paper_title=citation.get("title"),
        external_paper_doi=citation.get("doi"),
      )

      db_session.add(paper_citation)
      return True

    except Exception as e:
      logger.error(
        "Error storing citation",
        paper_id=paper_id,
        error=str(e),
      )
      return False

  @staticmethod
  async def extract_and_store_citations(
    db_session: AsyncSession, paper_id: int, pdf_content: bytes
  ) -> int:
    """Extract citations from PDF and store them in database."""
    try:
      paper_query = select(Paper).where(Paper.id == paper_id)
      paper_result = await db_session.execute(paper_query)
      paper = paper_result.scalar_one_or_none()

      if not paper:
        logger.warning("Paper not found for citation extraction", paper_id=paper_id)
        return 0

      await CitationExtractor._delete_existing_citations(db_session, paper_id)

      loop = asyncio.get_event_loop()
      references_text = await loop.run_in_executor(
        None, CitationExtractor.extract_references_section, pdf_content
      )

      if not references_text:
        logger.info("No references section found", paper_id=paper_id)
        return 0

      parsed_citations = await CitationExtractor.parse_citations(references_text)
      if not parsed_citations:
        logger.info("No citations parsed", paper_id=paper_id)
        return 0

      stored_count = 0
      for citation in parsed_citations:
        is_stored = await CitationExtractor._store_single_citation(
          db_session, paper_id, citation
        )
        if is_stored:
          stored_count += 1

      await db_session.commit()
      logger.info(
        "Citations extracted and stored",
        paper_id=paper_id,
        count=stored_count,
      )
      return stored_count

    except Exception as e:
      logger.error("Error extracting citations", paper_id=paper_id, error=str(e))
      await db_session.rollback()
      return 0


citation_extractor = CitationExtractor()
