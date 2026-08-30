"""Regression tests for discovery provider clients across worker event loops."""

from __future__ import annotations

import asyncio

from app.services.discovery.arxiv_provider import ArxivProvider


def test_provider_does_not_reuse_http_client_across_event_loops():
  """Celery's per-task asyncio loops must not inherit a live old-loop client."""
  provider = ArxivProvider()

  first_client = asyncio.run(provider._get_client())
  second_client = asyncio.run(provider._get_client())

  try:
    assert first_client is not second_client
  finally:
    asyncio.run(provider.close())
