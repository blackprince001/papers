"""Pure checks for durable deep-research lifecycle state."""

from __future__ import annotations

import pytest
from app.services.deep_research.state import (
  InvalidTransition,
  PayloadLimitExceeded,
  ResearchStatus,
  check_transition,
  payload_bytes,
  require_bounded_payload,
)


def test_happy_path_is_checked():
  statuses = [
    ResearchStatus.QUEUED,
    ResearchStatus.PLANNING,
    ResearchStatus.SEARCHING,
    ResearchStatus.READING,
    ResearchStatus.SYNTHESIZING,
    ResearchStatus.VERIFYING,
    ResearchStatus.COMPLETED,
  ]
  for current, target in zip(statuses, statuses[1:], strict=False):
    check_transition(current, target)


def test_terminal_and_skipping_transitions_are_rejected():
  with pytest.raises(InvalidTransition):
    check_transition("completed", "queued")
  with pytest.raises(InvalidTransition):
    check_transition("planning", "completed")


def test_pause_resume_and_cancel_are_explicit():
  check_transition("running", "paused")
  check_transition("paused", "queued")
  check_transition("searching", "cancel_requested")
  check_transition("cancel_requested", "cancelled")


def test_payload_budget_counts_utf8_bytes():
  payload = {"text": "é"}
  assert payload_bytes(payload) > len("é")
  assert require_bounded_payload(payload, payload_bytes(payload)) == payload_bytes(payload)
  with pytest.raises(PayloadLimitExceeded):
    require_bounded_payload(payload, payload_bytes(payload) - 1)


def test_session_owner_matches_non_null_cascade_migration():
  from app.models.deep_research import DeepResearchSession

  column = DeepResearchSession.__table__.c.user_id
  assert column.nullable is False
  assert next(iter(column.foreign_keys)).ondelete == "CASCADE"


def test_session_idempotency_is_unique_per_owner():
  from app.models.deep_research import DeepResearchSession

  assert any(
    constraint.name == "uq_dr_session_user_idempotency"
    for constraint in DeepResearchSession.__table__.constraints
  )
