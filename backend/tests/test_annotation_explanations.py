from datetime import datetime, timedelta, timezone

import pytest
from app.main import app
from app.models.annotation import AnnotationExplanation
from app.schemas.annotation import SemanticAnchor
from app.services.annotation_grounding import (
  EXPLANATION_PROMPT_VERSION,
  explanation_input_hash,
  explanation_retention_until,
  normalize_idempotency_key,
)
from pydantic import ValidationError


def _anchor(**overrides) -> SemanticAnchor:
  values = {
    "page": 2,
    "quoted_text": "The result is statistically significant.",
    "rects": [{"left": 0.1, "top": 0.2, "width": 0.4, "height": 0.05}],
  }
  values.update(overrides)
  return SemanticAnchor.model_validate(values)


def test_semantic_anchor_bounds_and_blank_quotes_are_rejected():
  assert _anchor().page == 2

  with pytest.raises(ValidationError):
    _anchor(rects=[{"left": 0.8, "top": 0.2, "width": 0.3, "height": 0.05}])

  with pytest.raises(ValidationError):
    _anchor(quoted_text="   ")


def test_explanation_fingerprint_is_scoped_to_paper_action_visibility_and_anchor():
  anchor = _anchor()
  base = explanation_input_hash(
    paper_id=1, action="explain", visibility="private", anchor=anchor
  )

  assert base == explanation_input_hash(
    paper_id=1,
    action="explain",
    visibility="private",
    anchor=SemanticAnchor.model_validate(anchor.model_dump()),
  )
  assert base != explanation_input_hash(
    paper_id=2, action="explain", visibility="private", anchor=anchor
  )
  assert base != explanation_input_hash(
    paper_id=1, action="why", visibility="private", anchor=anchor
  )
  assert base != explanation_input_hash(
    paper_id=1, action="explain", visibility="paper", anchor=anchor
  )


def test_retention_is_timezone_aware_and_bounded():
  now = datetime(2026, 8, 29, tzinfo=timezone.utc)
  assert explanation_retention_until(now=now) == now + timedelta(days=30)

  with pytest.raises(ValueError):
    explanation_retention_until(retention_days=0)
  with pytest.raises(ValueError):
    explanation_retention_until(retention_days=366)


def test_idempotency_keys_are_trimmed_and_bounded():
  assert normalize_idempotency_key("  reader-turn-1  ") == "reader-turn-1"
  assert normalize_idempotency_key("   ") is None
  with pytest.raises(ValueError):
    normalize_idempotency_key("x" * 256)


def test_cache_model_has_explicit_owner_retention_and_no_passage_foreign_key():
  columns = AnnotationExplanation.__table__.c
  assert columns.owner_user_id.nullable is False
  assert columns.retention_until.nullable is False
  assert columns.annotation_id.nullable is False
  assert "passage_id" not in columns
  assert {
    constraint.name for constraint in AnnotationExplanation.__table__.constraints
  } >= {
    "uq_annotation_explanation_generation",
    "uq_annotation_explanation_idempotency",
    "ck_annotation_explanation_action",
    "ck_annotation_explanation_visibility",
  }


def test_explanation_routes_are_present_in_the_authenticated_api():
  paths = app.openapi()["paths"]
  assert "/api/v1/annotations/{annotation_id}/explanations" in paths
  assert "/api/v1/papers/{paper_id}/explanations" in paths
  assert "get" in paths["/api/v1/annotations/{annotation_id}/explanations"]
  assert EXPLANATION_PROMPT_VERSION == "reader-explanation-v1"
