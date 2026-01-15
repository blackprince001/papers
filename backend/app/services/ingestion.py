from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper import Paper
from app.services.embeddings import embedding_service
from app.services.pdf_parser import pdf_parser
from app.services.storage import storage_service
from app.services.url_parser import url_parser


class IngestionService:
  @staticmethod
  def sanitize_text(text: str) -> str:
    if not text:
      return text

    text = text.replace("\x00", "")
    text = text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")

    return text

  @staticmethod
  async def download_pdf(url: str) -> bytes:
    """Download PDF from URL, handling various academic sites."""
    # Use URL parser to get the actual PDF URL
    parsed = url_parser.parse_url(url)
    pdf_url = parsed.pdf_url or url
    headers = parsed.headers or {}

    async with httpx.AsyncClient(timeout=60.0) as client:
      response = await client.get(pdf_url, follow_redirects=True, headers=headers)
      response.raise_for_status()

      content_type = response.headers.get("content-type", "").lower()
      if "pdf" not in content_type and not pdf_url.endswith(".pdf"):
        if "html" in content_type:
          raise ValueError(f"URL does not point to a PDF: {url}")

      return response.content

  @staticmethod
  async def extract_doi_from_url(url: str) -> Optional[str]:
    """Extract DOI or identifier from URL using the URL parser."""
    import re

    # First try the URL parser for site-specific extraction
    parsed = url_parser.parse_url(url)
    if parsed.doi:
      return parsed.doi
    if parsed.arxiv_id:
      return f"arxiv:{parsed.arxiv_id.split('v')[0]}"  # Remove version

    # Fallback to generic DOI pattern
    doi_pattern = r"10\.\d+/[^\s/]+"
    match = re.search(doi_pattern, url)
    if match:
      return match.group(0)

    return None

  @staticmethod
  async def ingest_paper(
    session: AsyncSession,
    url: str,
    title: Optional[str] = None,
    doi: Optional[str] = None,
    group_ids: Optional[list[int]] = None,
  ) -> Paper:
    if doi:
      existing = await session.execute(select(Paper).where(Paper.doi == doi))
      existing_paper = existing.scalar_one_or_none()
      if existing_paper:
        return existing_paper

    if not doi:
      doi = await IngestionService.extract_doi_from_url(url)

    pdf_content = await IngestionService.download_pdf(url)
    filename = storage_service.save_file(pdf_content, url, doi)
    file_path = str(storage_service.get_file_path(filename))

    # Extract text (limited to first 5 pages initially for speed)
    # Full text can be extracted later if needed
    text_content = await pdf_parser.extract_text(pdf_content, max_pages=5)
    metadata = await pdf_parser.extract_metadata(pdf_content)
    text_content = IngestionService.sanitize_text(text_content)

    if metadata:
      sanitized_metadata = {}
      for key, value in metadata.items():
        if isinstance(value, str):
          sanitized_metadata[key] = IngestionService.sanitize_text(value)
        elif isinstance(value, list):
          # Sanitize list items if they're strings
          sanitized_metadata[key] = [
            IngestionService.sanitize_text(item) if isinstance(item, str) else item
            for item in value
          ]
        else:
          sanitized_metadata[key] = value
      metadata = sanitized_metadata

    # Extract title: prioritize structured metadata title, fallback to filename/URL
    if not title:
      # First try structured metadata title (most accurate)
      if (
        metadata
        and metadata.get("title")
        and len(metadata.get("title", "").strip()) > 0
      ):
        t = metadata.get("title")
        title = t.strip() if t else ""
      else:
        # If AI extraction failed, use filename from URL as minimal fallback
        title = url.split("/")[-1]
        # Remove .pdf extension if present
        if title.endswith(".pdf"):
          title = title[:-4]
    # If title was provided but seems like a filename/URL, use structured metadata if available
    elif title and (title.endswith(".pdf") or "/" in title or len(title.split()) < 3):
      # Check if structured metadata has a better title
      if (
        metadata
        and metadata.get("title")
        and len(metadata.get("title", "").strip()) > 3
      ):
        t = metadata.get("title")
        title = t.strip() if t else ""

    title = IngestionService.sanitize_text(title)

    # Generate embedding asynchronously
    embedding_text = f"{title}\n\n{text_content[:1000]}"
    embedding_list = await embedding_service.generate_embedding_async(embedding_text)

    # Extract fields from metadata if available (from structured extraction)
    # These are direct columns in the Paper model
    volume = metadata.get("volume") if metadata else None
    issue = metadata.get("issue") if metadata else None
    pages = metadata.get("pages") if metadata else None

    # Use DOI from metadata if not already set
    if not doi and metadata and metadata.get("doi"):
      doi = metadata.get("doi")

    # Ensure empty strings are converted to None for consistency
    volume = volume if volume and volume.strip() else None
    issue = issue if issue and issue.strip() else None
    pages = pages if pages and pages.strip() else None
    doi = doi if doi and doi.strip() else None

    paper = Paper(
      title=title,
      doi=doi,
      url=url,
      file_path=file_path,
      content_text=text_content,
      embedding=embedding_list,
      metadata_json=metadata,
      volume=volume,
      issue=issue,
      pages=pages,
    )

    if group_ids:
      from app.models.group import Group

      groups = await session.execute(select(Group).where(Group.id.in_(group_ids)))
      paper.groups = groups.scalars().all()

    session.add(paper)
    await session.flush()

    return paper

  @staticmethod
  async def ingest_paper_background(
    session: AsyncSession,
    url: str,
    title: Optional[str] = None,
    doi: Optional[str] = None,
    group_ids: Optional[list[int]] = None,
  ) -> Paper:
    return await IngestionService.ingest_paper(session, url, title, doi, group_ids)

  @staticmethod
  async def ingest_paper_from_file(
    session: AsyncSession,
    file_content: bytes,
    filename: str,
    title: Optional[str] = None,
    doi: Optional[str] = None,
    group_ids: Optional[list[int]] = None,
  ) -> Paper:
    existing = None
    if doi:
      existing = await session.execute(select(Paper).where(Paper.doi == doi))
      existing_paper = existing.scalar_one_or_none()
      if existing_paper:
        return existing_paper

    url = f"file://{filename}"

    filename_stored = storage_service.save_file(file_content, url, doi)
    file_path = str(storage_service.get_file_path(filename_stored))

    # Extract text (limited to first 5 pages initially for speed)
    # Full text can be extracted later if needed
    text_content = await pdf_parser.extract_text(file_content, max_pages=5)
    metadata = await pdf_parser.extract_metadata(file_content)
    text_content = IngestionService.sanitize_text(text_content)

    if metadata:
      sanitized_metadata = {}
      for key, value in metadata.items():
        if isinstance(value, str):
          sanitized_metadata[key] = IngestionService.sanitize_text(value)
        elif isinstance(value, list):
          # Sanitize list items if they're strings
          sanitized_metadata[key] = [
            IngestionService.sanitize_text(item) if isinstance(item, str) else item
            for item in value
          ]
        else:
          sanitized_metadata[key] = value
      metadata = sanitized_metadata

    # Extract title: prioritize structured metadata title, fallback to filename
    if not title:
      # First try structured metadata title (most accurate)
      if (
        metadata
        and metadata.get("title")
        and len(metadata.get("title", "").strip()) > 0
      ):
        t = metadata.get("title")
        title = t.strip() if t else ""
      else:
        # If AI extraction failed, use filename as minimal fallback
        title = filename.rsplit(".", 1)[0] if "." in filename else filename
    # If title was provided but seems like a filename, use structured metadata if available
    elif title and (title.endswith(".pdf") or len(title.split()) < 3):
      # Check if structured metadata has a better title
      if (
        metadata
        and metadata.get("title")
        and len(metadata.get("title", "").strip()) > 3
      ):
        t = metadata.get("title")
        title = t.strip() if t else ""

    title = IngestionService.sanitize_text(title)

    # Generate embedding asynchronously
    embedding_text = f"{title}\n\n{text_content[:1000]}"
    embedding_list = await embedding_service.generate_embedding_async(embedding_text)

    # Extract fields from metadata if available (from structured extraction)
    # These are direct columns in the Paper model
    volume = metadata.get("volume") if metadata else None
    issue = metadata.get("issue") if metadata else None
    pages = metadata.get("pages") if metadata else None

    # Use DOI from metadata if not already set
    if not doi and metadata and metadata.get("doi"):
      doi = metadata.get("doi")

    # Ensure empty strings are converted to None for consistency
    volume = volume if volume and volume.strip() else None
    issue = issue if issue and issue.strip() else None
    pages = pages if pages and pages.strip() else None
    doi = doi if doi and doi.strip() else None

    paper = Paper(
      title=title,
      doi=doi,
      url=url,
      file_path=file_path,
      content_text=text_content,
      embedding=embedding_list,
      metadata_json=metadata,
      volume=volume,
      issue=issue,
      pages=pages,
    )

    if group_ids:
      from app.models.group import Group

      groups = await session.execute(select(Group).where(Group.id.in_(group_ids)))
      paper.groups = groups.scalars().all()

    session.add(paper)
    await session.flush()

    return paper


ingestion_service = IngestionService()
