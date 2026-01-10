import asyncio
import io
import json
import re
from typing import Dict, List, Optional, cast

from google import genai
from google.genai import types
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.paper import Paper
from app.models.paper_citation import PaperCitation


class CitationExtractor:
  @staticmethod
  def _find_references_start_position(full_text: str) -> int:
    """Find the start position of references section by looking for section headers."""
    # Look for common references section headers
    patterns = [
      r"(?i)^\s*references\s*$",
      r"(?i)^\s*bibliography\s*$",
      r"(?i)^\s*works\s+cited\s*$",
      r"(?i)^\s*literature\s+cited\s*$",
      r"(?i)^\s*citations\s*$",
      r"(?i)^\s*references\s+and\s+notes\s*$",
    ]

    lines = full_text.split("\n")
    # Check from end backwards (references are usually at the end)
    # Search in last 40% of document for efficiency
    search_start = max(0, int(len(lines) * 0.6))
    for i in range(len(lines) - 1, search_start - 1, -1):
      line = lines[i].strip()
      for pattern in patterns:
        if re.match(pattern, line):
          # Found references section start, return character position
          return sum(len(lines[j]) + 1 for j in range(i))  # +1 for newline

    return -1

  @staticmethod
  def extract_references_section(pdf_content: bytes) -> Optional[str]:
    """Extract text from PDF starting at the References section marker.
    
    Uses heuristics to find the "References" header, then extracts text from that point.
    Falls back to last 50% of pages if no marker is found.
    """
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      if len(reader.pages) == 0:
        return None

      # Extract full text from all pages
      text_parts = []
      for page in reader.pages:
        text = page.extract_text()
        if text:
          text_parts.append(text)

      if not text_parts:
        return None

      full_text = "\n\n".join(text_parts)

      # Try to find References section marker
      references_start = CitationExtractor._find_references_start_position(full_text)
      
      if references_start >= 0:
        # Found references marker, extract from that point
        return full_text[references_start:]
      else:
        # No marker found, fallback to last 50% of pages
        total_pages = len(reader.pages)
        if total_pages < 10:
          start_page = 0
        else:
          start_page = total_pages // 2

        # Extract text from selected pages
        fallback_text_parts = []
        for i in range(start_page, total_pages):
          page = reader.pages[i]
          text = page.extract_text()
          if text:
            fallback_text_parts.append(text)

        if not fallback_text_parts:
          return None

        return "\n\n".join(fallback_text_parts)

    except Exception as e:
      print(f"Error extracting references section: {str(e)}")
      return None

  @staticmethod
  async def parse_citations(references_text: str) -> List[Dict]:
    """Parse individual citations from references text using AI."""
    if not references_text or not references_text.strip():
      return []

    if not settings.GOOGLE_API_KEY:
      print("Google API key not available for citation parsing")
      return []

    try:
      client = genai.Client(api_key=settings.GOOGLE_API_KEY)

      # Limit text to avoid token limits (process in chunks if needed)
      max_chars = 20000
      text_to_parse = references_text
      if len(references_text) > max_chars:
        text_to_parse = references_text[
          -max_chars:
        ]  # Use last portion (most citations)

      prompt = f"""You are extracting citations from an academic paper. The text below may contain citation entries mixed with other content (body text, figures, tables, etc.). Your task is to identify and extract ONLY the citation entries.

Text from paper:
{text_to_parse}

INSTRUCTIONS:
1. Identify citation entries in the text - these typically appear as formatted bibliographic entries with authors, titles, publication information
2. Ignore body text, figures, tables, footnotes, and other non-citation content
3. Focus on entries that follow common citation formats (APA, MLA, Chicago, IEEE, etc.)
4. Each citation entry usually appears on one or more lines and contains bibliographic information
5. Extract ALL citations you find - do not skip any

For EACH citation entry, extract:
- title: The paper/article/book title (required)
- authors: List of author names as array (e.g., ["Author1", "Author2"])
- year: Publication year as integer (if available)
- journal: Journal, conference, or venue name (if applicable)
- doi: DOI if mentioned (format: 10.xxxx/xxxx, normalize by removing "doi:" or URL prefixes)
- pages: Page numbers or page range (e.g., "123-145" or "pp. 123-145")
- volume: Volume number (if applicable)
- issue: Issue number (if applicable)

Return a JSON array of citations. Each citation should be a JSON object with these fields.
Handle various citation formats and be flexible with parsing.
Extract ALL citations - do not skip any valid citation entries.

Example output format:
[
  {{
    "title": "Paper Title",
    "authors": ["Author One", "Author Two"],
    "year": 2023,
    "journal": "Journal Name",
    "doi": "10.1234/example",
    "pages": "123-145",
    "volume": "42",
    "issue": "3"
  }},
  ...
]

IMPORTANT: Return ONLY valid JSON array, no other text, explanations, or markdown formatting."""

      # Use run_in_executor to run synchronous genai call in executor
      loop = asyncio.get_event_loop()
      response = await loop.run_in_executor(
        None,
        lambda: client.models.generate_content(
          model=settings.GENAI_MODEL,
          contents=types.Part.from_text(text=prompt),
        ),
      )

      if hasattr(response, "text") and response.text:
        try:
          # Clean response text - remove markdown code blocks if present
          response_text = response.text.strip()
          if response_text.startswith("```"):
            # Find the first newline after ```
            first_newline = response_text.find("\n")
            if first_newline != -1:
              response_text = response_text[first_newline + 1 :]
            # Remove closing ```
            if response_text.endswith("```"):
              response_text = response_text[:-3]
            response_text = response_text.strip()
            # Also remove language specifier like ```json
            if response_text.startswith("json\n"):
              response_text = response_text[5:]

          # Parse JSON response
          citations_data = json.loads(response_text)

          # Validate and normalize citations
          parsed_citations = []
          if isinstance(citations_data, list):
            for citation in citations_data:
              if isinstance(citation, dict) and citation.get("title"):
                # Normalize fields
                parsed_citation = {
                  "title": str(citation.get("title", "")).strip(),
                  "authors": (
                    citation.get("authors", [])
                    if isinstance(citation.get("authors"), list)
                    else []
                  ),
                  "year": citation.get("year"),
                  "journal": str(citation.get("journal", "")).strip() or None,
                  "doi": str(citation.get("doi", "")).strip() or None,
                  "pages": str(citation.get("pages", "")).strip() or None,
                  "volume": str(citation.get("volume", "")).strip() or None,
                  "issue": str(citation.get("issue", "")).strip() or None,
                }
                # Clean DOI format
                if parsed_citation["doi"]:
                  doi = str(parsed_citation["doi"])
                  # Remove common prefixes
                  doi = re.sub(
                    r"^(doi:|DOI:|https?://(dx\.)?doi\.org/)",
                    "",
                    doi,
                    flags=re.IGNORECASE,
                  )
                  parsed_citation["doi"] = doi.strip()
                  if not parsed_citation["doi"]:
                    parsed_citation["doi"] = None

                parsed_citations.append(parsed_citation)

          return parsed_citations
        except (json.JSONDecodeError, ValueError, TypeError) as e:
          print(f"Error parsing citations JSON: {str(e)}")
          print(f"Response text: {response_text[:500]}")
          return []

      return []
    except Exception as e:
      print(f"Error parsing citations with AI: {str(e)}")
      return []

  @staticmethod
  async def match_citation_to_paper(
    session: AsyncSession, citation: Dict
  ) -> Optional[int]:
    """Match a citation to an existing paper in the database using multiple criteria."""
    if not citation:
      return None

    # Primary: Try DOI match (most reliable)
    if citation.get("doi"):
      doi = citation["doi"]
      # Normalize DOI
      doi = re.sub(r"^(doi:|DOI:)", "", doi, flags=re.IGNORECASE).strip()

      query = select(Paper).where(Paper.doi == doi)
      result = await session.execute(query)
      paper = result.scalar_one_or_none()
      if paper:
        return cast(int, paper.id)

    # Secondary: Try title + author + year matching (high confidence)
    title = citation.get("title")
    authors = citation.get("authors", [])
    year = citation.get("year")

    if title and len(title.strip()) > 5:
      # Get papers with similar titles
      query = select(Paper).where(Paper.title.ilike(f"%{title[:50]}%"))
      result = await session.execute(query)
      papers = result.scalars().all()

      if papers:
        best_match = None
        best_score = 0.6  # Lower threshold when using multiple criteria

        for paper in papers:
          # Calculate composite score using multiple criteria
          title_score = CitationExtractor._calculate_title_similarity(
            title.lower(), (paper.title or "").lower()
          )

          # Author matching
          author_score = 0.0
          if authors and paper.metadata_json:
            paper_authors = paper.metadata_json.get("authors_list", [])
            if isinstance(paper_authors, list) and len(paper_authors) > 0:
              # Check if any author from citation matches any author in paper
              citation_author_lastnames = {
                a.split()[-1].lower() if len(a.split()) > 0 else "" for a in authors[:3]
              }
              paper_author_lastnames = {
                a.split()[-1].lower() if len(a.split()) > 0 else ""
                for a in paper_authors[:3]
              }
              if citation_author_lastnames.intersection(paper_author_lastnames):
                author_score = 0.8

          # Year matching (exact match gets bonus, ±1 year gets partial)
          year_score = 0.0
          if year and paper.metadata_json:
            paper_year = None
            # Try to extract year from metadata
            if paper.metadata_json.get("year"):
              try:
                paper_year = int(str(paper.metadata_json["year"])[:4])
              except (ValueError, TypeError):
                pass
            # Fallback to created_at year
            if not paper_year and paper.created_at:
              paper_year = paper.created_at.year

            if paper_year:
              year_diff = abs(year - paper_year)
              if year_diff == 0:
                year_score = 1.0
              elif year_diff == 1:
                year_score = 0.7
              elif year_diff <= 3:
                year_score = 0.4

          # Composite score: weighted combination
          # Title is most important, then authors, then year
          composite_score = title_score * 0.6 + author_score * 0.25 + year_score * 0.15

          # Boost score if title similarity is very high (>0.85)
          if title_score > 0.85:
            composite_score = max(composite_score, title_score * 0.9)

          if composite_score > best_score:
            best_score = composite_score
            best_match = paper

        if best_match and best_score >= 0.6:
          return cast(int, best_match.id)

    return None

  @staticmethod
  def _calculate_title_similarity(title1: str, title2: str) -> float:
    """Calculate similarity between two titles using simple string matching."""
    if not title1 or not title2:
      return 0.0

    # Normalize titles: lowercase, remove punctuation, extra spaces
    def normalize(s: str) -> str:
      s = s.lower()
      s = re.sub(r"[^\w\s]", "", s)
      s = re.sub(r"\s+", " ", s)
      return s.strip()

    norm1 = normalize(title1)
    norm2 = normalize(title2)

    if norm1 == norm2:
      return 1.0

    # Check if one title contains the other
    if norm1 in norm2 or norm2 in norm1:
      return 0.85

    # Calculate word overlap
    words1 = set(norm1.split())
    words2 = set(norm2.split())

    if not words1 or not words2:
      return 0.0

    intersection = words1.intersection(words2)
    union = words1.union(words2)

    jaccard = len(intersection) / len(union) if union else 0.0

    # Boost score if significant overlap
    if len(intersection) >= 3:
      jaccard = min(1.0, jaccard * 1.2)

    return jaccard

  @staticmethod
  async def extract_and_store_citations(
    session: AsyncSession, paper_id: int, pdf_content: bytes
  ) -> int:
    """Extract citations from PDF and store them in database."""
    try:
      # Delete existing citations for this paper (idempotent operation)
      delete_query = select(PaperCitation).where(PaperCitation.paper_id == paper_id)
      result = await session.execute(delete_query)
      existing_citations = result.scalars().all()
      for citation in existing_citations:
        await session.delete(citation)
      await session.flush()

      # Extract references section
      references_text = CitationExtractor.extract_references_section(pdf_content)
      if not references_text:
        print(f"No references section found for paper {paper_id}")
        return 0

      # Parse citations
      citations = await CitationExtractor.parse_citations(references_text)
      if not citations:
        print(f"No citations parsed for paper {paper_id}")
        return 0

      # Match and store citations
      stored_count = 0
      for citation in citations:
        try:
          # Match citation to existing paper
          cited_paper_id = await CitationExtractor.match_citation_to_paper(
            session, citation
          )

          # Build citation context (first 500 chars of formatted citation)
          citation_context_parts = []
          if citation.get("authors"):
            citation_context_parts.append(", ".join(citation["authors"][:3]))
          if citation.get("title"):
            citation_context_parts.append(citation["title"])
          if citation.get("journal"):
            citation_context_parts.append(citation["journal"])
          if citation.get("year"):
            citation_context_parts.append(str(citation["year"]))
          citation_context = ". ".join(citation_context_parts)[:500]

          # Create PaperCitation record
          paper_citation = PaperCitation(
            paper_id=paper_id,
            cited_paper_id=cited_paper_id,
            citation_context=citation_context,
            external_paper_title=citation.get("title"),
            external_paper_doi=citation.get("doi"),
          )

          session.add(paper_citation)
          stored_count += 1
        except Exception as e:
          print(f"Error storing citation for paper {paper_id}: {str(e)}")
          continue

      # Commit all citations
      await session.commit()
      print(f"Stored {stored_count} citations for paper {paper_id}")
      return stored_count

    except Exception as e:
      print(f"Error extracting citations for paper {paper_id}: {str(e)}")
      await session.rollback()
      return 0


citation_extractor = CitationExtractor()
