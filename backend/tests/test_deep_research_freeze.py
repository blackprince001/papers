"""Safety freeze for the legacy deep-research mutation endpoints."""

import pytest
from app.api.deep_research import _ensure_mutations_enabled
from app.core.config import settings
from fastapi import HTTPException


def test_deep_research_mutations_are_disabled_by_default(monkeypatch):
  monkeypatch.setattr(settings, "DEEP_RESEARCH_MUTATIONS_ENABLED", False)

  with pytest.raises(HTTPException) as exc_info:
    _ensure_mutations_enabled()

  assert exc_info.value.status_code == 503
  assert "temporarily disabled" in str(exc_info.value.detail)


def test_deep_research_mutations_can_be_enabled_for_a_reviewed_local_override(monkeypatch):
  monkeypatch.setattr(settings, "DEEP_RESEARCH_MUTATIONS_ENABLED", True)

  _ensure_mutations_enabled()
