"""Schema for the inline reference manifest.

Shared contract between the backend resolver and frontend chips.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class ReferenceManifestEntry(BaseModel):
  kind: str
  id: str
  label: str
  title: str
  subtitle: str = ""
  snippet: str = ""
  thumbnail_url: Optional[str] = None
  internal: bool = False
  target: Optional[str] = None


class ReferenceManifest(BaseModel):
  entries: List[ReferenceManifestEntry] = []


class BatchResolveRequest(BaseModel):
  refs: List[Dict[str, str]]


class BatchResolveResponse(BaseModel):
  entries: List[ReferenceManifestEntry] = []
