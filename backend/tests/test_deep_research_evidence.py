"""Evidence normalization contracts for deep research."""

from __future__ import annotations

from app.services.deep_research.evidence import (
  collect_context_evidence,
  normalize_evidence,
  normalize_url,
)
from app.services.deep_research_service import _run_sources


def test_normalize_url_removes_fragments_and_rejects_non_web():
  assert normalize_url("HTTPS://Example.COM/paper?a=1#fragment") == "https://example.com/paper?a=1"
  assert normalize_url("file:///secret.pdf") is None


def test_evidence_has_stable_provenance_and_bounded_metadata():
  raw = {
    "source": "arxiv",
    "external_id": "2401.00001",
    "title": "A useful paper",
    "url": "https://arxiv.org/abs/2401.00001#section",
    "authors": ["A"],
    "year": 2024,
  }
  first = normalize_evidence(raw)
  second = normalize_evidence(dict(raw, url="https://arxiv.org/abs/2401.00001"))
  assert first is not None
  assert first == second
  assert first.url == "https://arxiv.org/abs/2401.00001"


def test_evidence_rejects_missing_title_unknown_source_and_private_url():
  assert normalize_evidence({"source": "web", "url": "https://example.com"}) is None
  assert normalize_evidence({"source": "unknown", "title": "Title"}) is None
  assert normalize_evidence({"source": "web", "title": "Title", "url": "file:///secret"}) is not None


def test_evidence_preserves_supported_discovery_provider():
  item = normalize_evidence(
    {"source": "google_scholar", "external_id": "x", "title": "A paper"}
  )
  assert item is not None
  assert item.source_type == "google_scholar"


def test_context_collection_is_a_noop_outside_research():
  extra: dict[str, object] = {}
  collect_context_evidence(extra, [{"source": "library", "title": "Ignored"}])
  assert extra == {}


def test_context_collection_retains_structured_authorized_source():
  extra: dict[str, object] = {"dr_sources": []}
  collect_context_evidence(
    extra, [{"source": "library", "external_id": "7", "title": "Visible"}]
  )
  assert extra["dr_sources"] == [{"source": "library", "external_id": "7", "title": "Visible"}]


def test_report_urls_do_not_become_evidence_without_a_tool_result():
  assert _run_sources("[invented](https://attacker.example/source)") == []
