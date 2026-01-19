from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.models.paper import Paper
from app.services.embeddings import embedding_service
from app.services.pdf_parser import pdf_parser
from app.services.storage import storage_service
from app.services.url_parser import url_parser

logger = get_logger(__name__)


def sanitize_text(text: str) -> str:
  """Remove null bytes and fix encoding issues in text."""
  if not text:
    return text

  text = text.replace("\x00", "")
  text = text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
  return text


def sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
  """Sanitize all string values in metadata dict."""
  if not metadata:
    return {}

  sanitized: dict[str, Any] = {}
  for key, value in metadata.items():
    if isinstance(value, str):
      sanitized[key] = sanitize_text(value)
    elif isinstance(value, list):
      sanitized[key] = [
        sanitize_text(item) if isinstance(item, str) else item for item in value
      ]
    else:
      sanitized[key] = value

  return sanitized


def _extract_title_from_metadata(metadata: dict[str, Any] | None, fallback: str) -> str:
  """Extract title from metadata or use fallback."""
  if metadata is None:
    return fallback

  title = metadata.get("title")
  if title and isinstance(title, str) and len(title.strip()) > 0:
    return title.strip()

  return fallback


def _should_use_metadata_title(
  provided_title: str, metadata: dict[str, Any] | None
) -> bool:
  """Check if we should prefer metadata title over provided one."""
  is_filename_like = (
    provided_title.endswith(".pdf")
    or "/" in provided_title
    or len(provided_title.split()) < 3
  )

  if not is_filename_like:
    return False

  if metadata is None:
    return False

  title = metadata.get("title")
  has_better_metadata = title and isinstance(title, str) and len(title.strip()) > 3

  return bool(has_better_metadata)


def _normalize_optional_field(value: str | None) -> str | None:
  """Convert empty strings to None for optional fields."""
  if value and value.strip():
    return value.strip()
  return None


class IngestionService:
  @staticmethod
  async def download_pdf(url: str) -> bytes:
    """Download PDF from URL, handling various academic sites."""
    parsed = url_parser.parse_url(url)
    pdf_url = parsed.pdf_url or url
    headers = parsed.headers or {}

    async with httpx.AsyncClient(timeout=60.0) as client:
      response = await client.get(pdf_url, follow_redirects=True, headers=headers)
      response.raise_for_status()

      content_type = response.headers.get("content-type", "").lower()
      is_not_pdf = "pdf" not in content_type and not pdf_url.endswith(".pdf")
      is_html = "html" in content_type

      if is_not_pdf and is_html:
        raise ValueError(f"URL does not point to a PDF: {url}")

      return response.content

  @staticmethod
  async def extract_doi_from_url(url: str) -> str | None:
    """Extract DOI or identifier from URL using the URL parser."""
    import re

    parsed = url_parser.parse_url(url)
    if parsed.doi:
      return parsed.doi
    if parsed.arxiv_id:
      arxiv_base = parsed.arxiv_id.split("v")[0]
      return f"arxiv:{arxiv_base}"

    doi_pattern = r"10\.\d+/[^\s/]+"
    match = re.search(doi_pattern, url)
    return match.group(0) if match else None

  @staticmethod
  async def _check_existing_paper(
    db_session: AsyncSession, doi: str | None
  ) -> Paper | None:
    """Check if paper with given DOI already exists."""
    if not doi:
      return None

    result = await db_session.execute(select(Paper).where(Paper.doi == doi))
    return result.scalar_one_or_none()

  @staticmethod
  async def _generate_embedding(title: str, content: str) -> list[float]:
    """Generate embedding for paper."""
    embedding_text = f"{title}\n\n{content[:1000]}"
    return await embedding_service.generate_embedding_async(embedding_text)

  @staticmethod
  async def _assign_groups(
    db_session: AsyncSession, paper: Paper, group_ids: list[int] | None
  ) -> None:
    """Assign paper to groups if specified."""
    if not group_ids:
      return

    from app.models.group import Group

    groups = await db_session.execute(select(Group).where(Group.id.in_(group_ids)))
    paper.groups = groups.scalars().all()

  @staticmethod
  def _create_paper_from_data(
    title: str,
    doi: str | None,
    url: str,
    file_path: str,
    text_content: str,
    embedding: list[float],
    metadata: dict[str, Any] | None,
  ) -> Paper:
    """Create Paper object from extracted data."""
    volume = _normalize_optional_field(metadata.get("volume") if metadata else None)
    issue = _normalize_optional_field(metadata.get("issue") if metadata else None)
    pages = _normalize_optional_field(metadata.get("pages") if metadata else None)

    return Paper(
      title=title,
      doi=doi,
      url=url,
      file_path=file_path,
      content_text=text_content,
      embedding=embedding,
      metadata_json=metadata,
      volume=volume,
      issue=issue,
      pages=pages,
    )

  @staticmethod
  async def ingest_paper(
    db_session: AsyncSession,
    url: str,
    title: str | None = None,
    doi: str | None = None,
    group_ids: list[int] | None = None,
  ) -> Paper:
    """Ingest paper from URL."""
    existing = await IngestionService._check_existing_paper(db_session, doi)
    if existing:
      return existing

    if not doi:
      doi = await IngestionService.extract_doi_from_url(url)

    pdf_content = await IngestionService.download_pdf(url)
    filename = storage_service.save_file(pdf_content, url, doi)
    file_path = str(storage_service.get_file_path(filename))

    text_content = await pdf_parser.extract_text(pdf_content, max_pages=5)
    metadata = await pdf_parser.extract_metadata(pdf_content)

    text_content = sanitize_text(text_content)
    metadata = sanitize_metadata(metadata)

    if not title:
      fallback = url.split("/")[-1]
      if fallback.endswith(".pdf"):
        fallback = fallback[:-4]
      title = _extract_title_from_metadata(metadata, fallback)
    elif _should_use_metadata_title(title, metadata):
      title = metadata["title"].strip()

    title = sanitize_text(title)

    if not doi and metadata and metadata.get("doi"):
      doi = _normalize_optional_field(metadata.get("doi"))

    embedding = await IngestionService._generate_embedding(title, text_content)

    paper = IngestionService._create_paper_from_data(
      title=title,
      doi=doi,
      url=url,
      file_path=file_path,
      text_content=text_content,
      embedding=embedding,
      metadata=metadata,
    )

    await IngestionService._assign_groups(db_session, paper, group_ids)

    db_session.add(paper)
    await db_session.flush()

    return paper

  @staticmethod
  async def ingest_paper_background(
    db_session: AsyncSession,
    url: str,
    title: str | None = None,
    doi: str | None = None,
    group_ids: list[int] | None = None,
  ) -> Paper:
    """Ingest paper in background task."""
    return await IngestionService.ingest_paper(db_session, url, title, doi, group_ids)

  @staticmethod
  async def ingest_paper_from_file(
    db_session: AsyncSession,
    file_content: bytes,
    filename: str,
    title: str | None = None,
    doi: str | None = None,
    group_ids: list[int] | None = None,
  ) -> Paper:
    """Ingest paper from uploaded file."""
    existing = await IngestionService._check_existing_paper(db_session, doi)
    if existing:
      return existing

    url = f"file://{filename}"

    filename_stored = storage_service.save_file(file_content, url, doi)
    file_path = str(storage_service.get_file_path(filename_stored))

    text_content = await pdf_parser.extract_text(file_content, max_pages=5)
    metadata = await pdf_parser.extract_metadata(file_content)

    text_content = sanitize_text(text_content)
    metadata = sanitize_metadata(metadata)

    if not title:
      fallback = filename.rsplit(".", 1)[0] if "." in filename else filename
      title = _extract_title_from_metadata(metadata, fallback)
    elif _should_use_metadata_title(title, metadata):
      title = metadata["title"].strip()

    title = sanitize_text(title)

    if not doi and metadata and metadata.get("doi"):
      doi = _normalize_optional_field(metadata.get("doi"))

    embedding = await IngestionService._generate_embedding(title, text_content)

    paper = IngestionService._create_paper_from_data(
      title=title,
      doi=doi,
      url=url,
      file_path=file_path,
      text_content=text_content,
      embedding=embedding,
      metadata=metadata,
    )

    await IngestionService._assign_groups(db_session, paper, group_ids)

    db_session.add(paper)
    await db_session.flush()

    return paper


ingestion_service = IngestionService()
