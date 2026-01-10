import asyncio
import io
import json
import re
from typing import Optional

from google import genai
from google.genai import types
from pypdf import PdfReader

from app.core.config import settings
from app.schemas.paper import PaperMetadata


class PDFParser:
  @staticmethod
  def extract_text(pdf_content: bytes, max_pages: Optional[int] = None) -> str:
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      text_parts = []
      pages_to_process = reader.pages[:max_pages] if max_pages else reader.pages
      for page in pages_to_process:
        text = page.extract_text()
        if text:
          text_parts.append(text)

      return "\n\n".join(text_parts)
    except Exception as e:
      raise ValueError(f"Failed to parse PDF: {str(e)}") from e

  @staticmethod
  async def extract_metadata_structured(pdf_content: bytes) -> Optional[PaperMetadata]:
    """Extract metadata using structured output from genai SDK."""
    if not settings.GOOGLE_API_KEY:
      return None

    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      if len(reader.pages) == 0:
        return None

      # Extract text from first 2-3 pages (or first 5000 chars)
      text_parts = []
      char_count = 0
      max_chars = 5000

      for _, page in enumerate(reader.pages[:3]):  # First 3 pages max
        text = page.extract_text()
        if text:
          if char_count + len(text) > max_chars:
            # Add partial text to reach max_chars
            remaining = max_chars - char_count
            if remaining > 0:
              text_parts.append(text[:remaining])
            break
          text_parts.append(text)
          char_count += len(text)

      if not text_parts:
        return None

      first_pages_text = "\n\n".join(text_parts)
      if len(first_pages_text) > max_chars:
        first_pages_text = first_pages_text[:max_chars]

      client = genai.Client(api_key=settings.GOOGLE_API_KEY)

      prompt = f"""Extract metadata from this research paper. Analyze the following text from the first page(s) of the paper and extract all available metadata.

Text from first page(s):
{first_pages_text}

Extract the following information:
- Title: The exact paper title
- Authors: List of all author names (format: "First Last" for each author, separate multiple authors with commas in the list)
- Publication Date: Publication date in YYYY-MM-DD format if available, or YYYY if only year is available
- Journal: Journal or conference name if mentioned
- Volume: Journal volume number if available
- Issue: Journal issue number if available
- Pages: Page numbers (e.g., "1-10" or "123-145") if available
- DOI: Digital Object Identifier if mentioned
- Abstract: The abstract text if present
- Keywords: List of keywords if mentioned

Return the extracted metadata in the specified format. If any field is not found, leave it as null or empty list."""

      # Request JSON format in the prompt and parse response
      json_prompt = f"""{prompt}

IMPORTANT: Return ONLY a valid JSON object with the following structure. Do not include any other text, explanations, or markdown formatting. Just the raw JSON:
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

      try:
        # Run synchronous genai call in executor to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
          None,
          lambda: client.models.generate_content(
            model=settings.GENAI_MODEL,
            contents=types.Part.from_text(text=json_prompt),
          ),
        )
      except Exception as api_error:
        # Handle API errors (rate limits, network errors, etc.)
        error_str = str(api_error)
        if (
          "429" in error_str
          or "RESOURCE_EXHAUSTED" in error_str
          or "quota" in error_str.lower()
        ):
          print(
            f"Rate limit or quota exceeded in structured metadata extraction: {str(api_error)}"
          )
        else:
          print(f"API error in structured metadata extraction: {str(api_error)}")
        return None

      if hasattr(response, "text") and response.text:
        try:
          # Clean response text - remove markdown code blocks if present
          response_text = response.text.strip()
          # Remove markdown code blocks
          if response_text.startswith("```"):
            # Find the first newline after ```
            first_newline = response_text.find("\n")
            if first_newline != -1:
              response_text = response_text[first_newline + 1 :]
            # Remove closing ```
            if response_text.endswith("```"):
              response_text = response_text[:-3]
            response_text = response_text.strip()

          # Parse JSON response
          response_data = json.loads(response_text)

          # Create PaperMetadata instance
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

          # Validate that at least title or authors are present
          if metadata.title or metadata.authors:
            return metadata
        except (json.JSONDecodeError, ValueError, TypeError) as e:
          print(f"Error parsing structured metadata response: {str(e)}")
          return None

      return None

    except Exception as e:
      print(f"Error extracting metadata with structured output: {str(e)}")
      return None

  @staticmethod
  async def extract_metadata(pdf_content: bytes) -> dict:
    """Extract metadata from PDF using AI-structured extraction only."""
    metadata = {}

    # Get num_pages for basic info
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)
      metadata["num_pages"] = len(reader.pages)
    except Exception:
      pass

    # Use only AI-structured extraction
    structured_metadata = await PDFParser.extract_metadata_structured(pdf_content)

    if structured_metadata:
      # Convert Pydantic model to dict format compatible with existing code
      metadata["title"] = structured_metadata.title or ""
      # Convert authors list to string format for backward compatibility
      if structured_metadata.authors:
        # Join authors with comma for backward compatibility
        metadata["author"] = ", ".join(structured_metadata.authors)
      else:
        metadata["author"] = ""

      metadata["subject"] = structured_metadata.journal or ""
      metadata["publication_date"] = structured_metadata.publication_date or ""
      metadata["volume"] = structured_metadata.volume or ""
      metadata["issue"] = structured_metadata.issue or ""
      metadata["pages"] = structured_metadata.pages or ""
      metadata["doi"] = structured_metadata.doi or ""
      metadata["abstract"] = structured_metadata.abstract or ""
      metadata["keywords"] = structured_metadata.keywords or []

      # Also store structured data for easier access
      metadata["authors_list"] = structured_metadata.authors
      metadata["journal"] = structured_metadata.journal or ""

    # If structured extraction fails, return minimal metadata (just num_pages if available)
    # This allows papers to be created with minimal info for later regeneration

    return metadata

  @staticmethod
  def _extract_title_heuristic(first_pages_text: str) -> Optional[str]:
    """Extract title using heuristics from first page text."""
    if not first_pages_text:
      return None

    # Split into lines and clean
    lines = [line.strip() for line in first_pages_text.split("\n") if line.strip()]
    if not lines:
      return None

    # Find where abstract/introduction starts
    abstract_idx = None
    for i, line in enumerate(lines[:20]):  # Check first 20 lines
      line_lower = line.lower()
      if any(
        keyword in line_lower
        for keyword in ["abstract", "introduction", "keywords", "1. introduction"]
      ):
        abstract_idx = i
        break

    # If we found abstract/intro, title should be before it
    if abstract_idx is not None and abstract_idx > 0:
      # Collect consecutive lines before abstract that look like a title
      title_lines = []
      for i in range(abstract_idx):
        line = lines[i]
        line_lower = line.lower()

        # Skip author names (First Last format)
        if re.match(r"^[A-Z][a-z]+\s+[A-Z][a-z]+", line) and len(line.split()) <= 4:
          # Might be author name, but could also be part of title
          # Check if next line is also author-like or affiliation
          if i + 1 < abstract_idx:
            next_line = lines[i + 1].lower()
            if re.search(r"@|\.edu|\.com|university|department|institute", next_line):
              # This is likely author section, stop collecting
              break

        # Skip affiliations
        if re.search(r"@|\.edu|\.com|university|department|institute", line_lower):
          # If we already have title lines, stop here
          if title_lines:
            break
          continue

        # Add line to title if it looks reasonable
        word_count = len(line.split())
        if word_count >= 2:  # At least 2 words
          title_lines.append(line)
        elif title_lines:
          # Short line might be continuation of title (e.g., "and" or single word)
          title_lines.append(line)

      # Combine title lines
      if title_lines:
        candidate = " ".join(title_lines)
        word_count = len(candidate.split())
        # Titles are typically 3-30 words
        if 3 <= word_count <= 50:  # Allow up to 50 for multi-line titles
          return candidate

    # Fallback: look for first substantial text block (2-4 consecutive lines)
    for i in range(min(10, len(lines) - 2)):
      # Try combining 2-4 consecutive lines
      for num_lines in [4, 3, 2]:
        if i + num_lines <= len(lines):
          candidate_lines = lines[i : i + num_lines]
          # Skip if any line looks like author/affiliation
          if any(
            re.search(r"@|\.edu|\.com|university|department|institute", line.lower())
            for line in candidate_lines
          ):
            continue
          if any(
            re.match(r"^[A-Z][a-z]+\s+[A-Z][a-z]+$", line) and len(line.split()) <= 3
            for line in candidate_lines
          ):
            continue

          candidate = " ".join(candidate_lines)
          word_count = len(candidate.split())
          if 3 <= word_count <= 50:
            return candidate

    # Last resort: use first substantial single line
    for line in lines[:10]:
      word_count = len(line.split())
      if 3 <= word_count <= 30:
        if not re.search(r"@|\.edu|\.com|university|department", line.lower()):
          return line

    return None

  @staticmethod
  def _extract_title_llm(first_pages_text: str) -> Optional[str]:
    """Extract title using LLM from first page text."""
    if not settings.GOOGLE_API_KEY:
      return None

    try:
      client = genai.Client(api_key=settings.GOOGLE_API_KEY)

      # Limit text to first 2000 characters for efficiency
      text_preview = first_pages_text[:2000]
      if len(first_pages_text) > 2000:
        text_preview += "..."

      prompt = f"""Extract the exact title of this research paper from the following text from the first page(s).

Text from first page(s):
{text_preview}

Extract ONLY the paper title. Do not include authors, affiliations, abstract, or any other text. Return just the title as it appears in the paper, nothing else."""

      response = client.models.generate_content(
        model=settings.GENAI_MODEL, contents=types.Part.from_text(text=prompt)
      )

      if hasattr(response, "text") and response.text:
        title = response.text.strip()
        # Clean up common LLM artifacts
        title = re.sub(r'^["\']|["\']$', "", title)  # Remove quotes
        title = title.strip()
        if title and 3 <= len(title.split()) <= 50:  # Reasonable title
          return title

      return None

    except Exception as e:
      print(f"Error extracting title with LLM: {str(e)}")
      return None

  @staticmethod
  def extract_title_from_content(pdf_content: bytes) -> Optional[str]:
    """Extract paper title from PDF content using heuristics and LLM fallback."""
    try:
      pdf_file = io.BytesIO(pdf_content)
      reader = PdfReader(pdf_file)

      if len(reader.pages) == 0:
        return None

      # Extract text from first 1-2 pages
      text_parts = []
      for _, page in enumerate(reader.pages[:2]):  # First 2 pages max
        text = page.extract_text()
        if text:
          text_parts.append(text)

      if not text_parts:
        return None

      first_pages_text = "\n\n".join(text_parts)

      # Try heuristic first
      title = PDFParser._extract_title_heuristic(first_pages_text)

      # If heuristic failed or produced a poor result, try LLM
      if not title or len(title.split()) < 3:
        llm_title = PDFParser._extract_title_llm(first_pages_text)
        if llm_title:
          title = llm_title

      return title if title else None

    except Exception as e:
      print(f"Error extracting title from PDF content: {str(e)}")
      return None


pdf_parser = PDFParser()
