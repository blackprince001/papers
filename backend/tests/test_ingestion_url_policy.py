"""SSRF and download-boundary tests for paper ingestion."""

from __future__ import annotations

import socket

import pytest
from app.services import url_policy
from app.services.ingestion import IngestionService


@pytest.mark.asyncio
@pytest.mark.parametrize(
  "url",
  [
    "file:///etc/passwd",
    "http://127.0.0.1/paper.pdf",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/paper.pdf",
    "https://user:password@example.com/paper.pdf",
    "http://example.com:bad/paper.pdf",
    "http://[bad/paper.pdf",
  ],
)
async def test_private_and_non_http_targets_are_rejected(url):
  with pytest.raises(ValueError, match="URL target is not allowed"):
    await url_policy.validate_public_url(url)


@pytest.mark.asyncio
async def test_dns_rebinding_to_private_address_is_rejected(monkeypatch):
  resolutions = iter(["93.184.216.34", "10.0.0.8"])

  def getaddrinfo(host, port, type):
    address = next(resolutions)
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

  monkeypatch.setattr(url_policy.socket, "getaddrinfo", getaddrinfo)
  await url_policy.validate_public_url("https://example.com/paper.pdf")
  with pytest.raises(ValueError, match="URL target is not allowed"):
    await url_policy.validate_public_url("https://example.com/paper.pdf")


@pytest.mark.asyncio
async def test_redirect_to_private_target_is_rejected(monkeypatch):
  seen = []

  async def validate(url):
    seen.append(url)
    if "private" in url:
      raise ValueError("URL target is not allowed")
    return ["93.184.216.34"]

  def fetch(url, addresses, headers, max_bytes):
    return 302, {"location": "http://private/paper.pdf"}, b""

  monkeypatch.setattr("app.services.ingestion.validate_public_url", validate)
  monkeypatch.setattr("app.services.ingestion.fetch_pinned_url", fetch)

  with pytest.raises(ValueError, match="URL target is not allowed"):
    await IngestionService().download_pdf("https://example.com/paper.pdf")
  assert seen[-1] == "http://private/paper.pdf"


@pytest.mark.asyncio
async def test_download_size_is_bounded(monkeypatch):
  async def validate(url):
    return ["93.184.216.34"]

  def fetch(url, addresses, headers, max_bytes):
    return 200, {"content-type": "application/pdf"}, b"x" * (max_bytes + 1)

  monkeypatch.setattr("app.services.ingestion.validate_public_url", validate)
  monkeypatch.setattr(
    "app.services.ingestion.settings.INGESTION_MAX_DOWNLOAD_BYTES", 3,
  )
  monkeypatch.setattr("app.services.ingestion.fetch_pinned_url", fetch)

  with pytest.raises(ValueError, match="Downloaded paper exceeds the size limit"):
    await IngestionService().download_pdf("https://example.com/paper.pdf")


@pytest.mark.asyncio
@pytest.mark.parametrize("headers, body", [
  ({"content-type": "application/pdf"}, b"not-a-pdf"),
  ({}, b"<html>not a pdf</html>"),
])
async def test_download_rejects_non_pdf_body(monkeypatch, headers, body):
  async def validate(url):
    return ["93.184.216.34"]

  def fetch(url, addresses, request_headers, max_bytes):
    return 200, headers, body

  monkeypatch.setattr("app.services.ingestion.validate_public_url", validate)
  monkeypatch.setattr("app.services.ingestion.fetch_pinned_url", fetch)

  with pytest.raises(ValueError, match="Downloaded content is not a PDF"):
    await IngestionService().download_pdf("https://example.com/paper.pdf")
