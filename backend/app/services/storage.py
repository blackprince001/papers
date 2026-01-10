import hashlib
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from app.core.config import settings


class StorageService:
  def __init__(self, base_path: Optional[str] = None):
    self.base_path = Path(base_path or settings.STORAGE_PATH)
    self.base_path.mkdir(parents=True, exist_ok=True)

  def _generate_file_name(self, url: str, doi: Optional[str] = None) -> str:
    if doi:
      safe_doi = doi.replace("/", "_").replace(":", "_")
      return f"{safe_doi}.pdf"

    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    parsed = urlparse(url)
    domain = parsed.netloc.replace(".", "_")
    return f"{domain}_{url_hash}.pdf"

  def get_file_path(self, filename: str) -> Path:
    return self.base_path / filename

  def save_file(self, content: bytes, url: str, doi: Optional[str] = None) -> str:
    filename = self._generate_file_name(url, doi)
    file_path = self.get_file_path(filename)
    file_path.write_bytes(content)

    return filename

  def file_exists(self, filename: str) -> bool:
    return self.get_file_path(filename).exists()

  def get_file(self, filename: str) -> bytes:
    file_path = self.get_file_path(filename)
    if not file_path.exists():
      raise FileNotFoundError(f"File not found: {filename}")
    return file_path.read_bytes()

  def delete_file(self, filename: str) -> None:
    file_path = self.get_file_path(filename)
    if file_path.exists():
      file_path.unlink()

  def get_file_url(self, filename: str) -> str:
    return f"/storage/{filename}"


storage_service = StorageService()
