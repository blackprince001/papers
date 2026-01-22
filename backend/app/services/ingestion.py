import re
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import get_logger
from app.models.group import Group
from app.models.paper import Paper
from app.services.embeddings import embedding_service
from app.services.pdf_parser import pdf_parser
from app.services.storage import storage_service
from app.services.url_parser import url_parser

logger = get_logger(__name__)

DOI_PATTERN = r"10\.\d+/[^\s/]+"


def sanitize_text(text: str) -> str:
  if not text:
    return text
  text = text.replace("\x00", "")
  return text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")


def sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
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


def normalize_optional_field(value: str | None) -> str | None:
  if value and value.strip():
    return value.strip()
  return None


def is_filename_like(title: str) -> bool:
  return title.endswith(".pdf") or "/" in title or len(title.split()) < 3


def extract_title_from_metadata(metadata: dict[str, Any] | None, fallback: str) -> str:
  if metadata is None:
    return fallback
  title = metadata.get("title")
  if title and isinstance(title, str) and len(title.strip()) > 0:
    return title.strip()
  return fallback


def should_use_metadata_title(
  provided_title: str, metadata: dict[str, Any] | None
) -> bool:
  if not is_filename_like(provided_title):
    return False
  if metadata is None:
    return False
  title = metadata.get("title")
  return bool(title and isinstance(title, str) and len(title.strip()) > 3)


class IngestionService:
  async def download_pdf(self, url: str) -> bytes:
    parsed = url_parser.parse_url(url)
    pdf_url = parsed.pdf_url or url
    headers = parsed.headers or {}

    async with httpx.AsyncClient(timeout=60.0) as client:
      response = await client.get(pdf_url, follow_redirects=True, headers=headers)
      response.raise_for_status()

      content_type = response.headers.get("content-type", "").lower()
      is_html = "html" in content_type
      is_not_pdf = "pdf" not in content_type and not pdf_url.endswith(".pdf")

      if is_not_pdf and is_html:
        raise ValueError(f"URL does not point to a PDF: {url}")

      return response.content

  async def extract_doi_from_url(self, url: str) -> str | None:
    parsed = url_parser.parse_url(url)
    if parsed.doi:
      return parsed.doi
    if parsed.arxiv_id:
      return f"arxiv:{parsed.arxiv_id.split('v')[0]}"

    match = re.search(DOI_PATTERN, url)
    return match.group(0) if match else None

  async def check_existing_paper(
    self, db_session: AsyncSession, doi: str | None
  ) -> Paper | None:
    if not doi:
      return None
    result = await db_session.execute(select(Paper).where(Paper.doi == doi))
    return result.scalar_one_or_none()

  async def generate_embedding(self, title: str, content: str) -> list[float]:
    embedding_text = f"{title}\n\n{content[:1000]}"
    return await embedding_service.generate_embedding_async(embedding_text)

  async def assign_groups(
    self, db_session: AsyncSession, paper: Paper, group_ids: list[int] | None
  ) -> None:
    if not group_ids:
      return
    groups = await db_session.execute(select(Group).where(Group.id.in_(group_ids)))
    paper.groups = groups.scalars().all()

  def create_paper(
    self,
    title: str,
    doi: str | None,
    url: str,
    file_path: str,
    text_content: str,
    embedding: list[float],
    metadata: dict[str, Any] | None,
  ) -> Paper:
    return Paper(
      title=title,
      doi=doi,
      url=url,
      file_path=file_path,
      content_text=text_content,
      embedding=embedding,
      metadata_json=metadata,
      volume=normalize_optional_field(metadata.get("volume") if metadata else None),
      issue=normalize_optional_field(metadata.get("issue") if metadata else None),
      pages=normalize_optional_field(metadata.get("pages") if metadata else None),
    )

  def resolve_title(self, title: str | None, url: str, metadata: dict[str, Any]) -> str:
    if not title:
      fallback = url.split("/")[-1]
      if fallback.endswith(".pdf"):
        fallback = fallback[:-4]
      return sanitize_text(extract_title_from_metadata(metadata, fallback))

    if should_use_metadata_title(title, metadata):
      return sanitize_text(metadata["title"].strip())

    return sanitize_text(title)

  def resolve_doi(self, doi: str | None, metadata: dict[str, Any]) -> str | None:
    if doi:
      return doi
    if metadata and metadata.get("doi"):
      return normalize_optional_field(metadata.get("doi"))
    return None

  async def ingest_paper(
    self,
    db_session: AsyncSession,
    url: str,
    title: str | None = None,
    doi: str | None = None,
    group_ids: list[int] | None = None,
  ) -> Paper:
    existing = await self.check_existing_paper(db_session, doi)
    if existing:
      return existing

    if not doi:
      doi = await self.extract_doi_from_url(url)

    pdf_content = await self.download_pdf(url)
    filename = storage_service.save_file(pdf_content, url, doi)
    file_path = str(storage_service.get_file_path(filename))

    text_content = sanitize_text(
      await pdf_parser.extract_text(pdf_content, max_pages=5)
    )
    metadata = sanitize_metadata(await pdf_parser.extract_metadata(pdf_content))

    title = self.resolve_title(title, url, metadata)
    doi = self.resolve_doi(doi, metadata)
    embedding = await self.generate_embedding(title, text_content)

    paper = self.create_paper(
      title, doi, url, file_path, text_content, embedding, metadata
    )
    await self.assign_groups(db_session, paper, group_ids)

    db_session.add(paper)
    await db_session.flush()
    return paper

  async def ingest_paper_from_file(
    self,
    db_session: AsyncSession,
    file_content: bytes,
    filename: str,
    title: str | None = None,
    doi: str | None = None,
    group_ids: list[int] | None = None,
  ) -> Paper:
    existing = await self.check_existing_paper(db_session, doi)
    if existing:
      return existing

    url = f"file://{filename}"
    stored_filename = storage_service.save_file(file_content, url, doi)
    file_path = str(storage_service.get_file_path(stored_filename))

    text_content = sanitize_text(
      await pdf_parser.extract_text(file_content, max_pages=5)
    )
    metadata = sanitize_metadata(await pdf_parser.extract_metadata(file_content))

    if not title:
      fallback = filename.rsplit(".", 1)[0] if "." in filename else filename
      title = sanitize_text(extract_title_from_metadata(metadata, fallback))
    elif should_use_metadata_title(title, metadata):
      title = sanitize_text(metadata["title"].strip())
    else:
      title = sanitize_text(title)

    doi = self.resolve_doi(doi, metadata)
    embedding = await self.generate_embedding(title, text_content)

    paper = self.create_paper(
      title, doi, url, file_path, text_content, embedding, metadata
    )
    await self.assign_groups(db_session, paper, group_ids)

    db_session.add(paper)
    await db_session.flush()
    return paper


ingestion_service = IngestionService()
