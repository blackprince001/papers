"""Unit contracts for research outbox and cooperative lifecycle handling."""

from __future__ import annotations

import pytest
from app.services.deep_research.orchestrator import (
  GenerationNotRunnable,
  dispatch_key,
  verify_report,
)
from app.services.deep_research.state import InvalidTransition, check_transition


def test_dispatch_key_is_idempotent_per_generation():
  assert dispatch_key(3, 7) == dispatch_key(3, 7)
  assert dispatch_key(3, 7) != dispatch_key(3, 8)


def test_cancellation_transition_is_available_before_completion():
  for status in ("queued", "planning", "searching", "reading", "synthesizing", "verifying", "running", "paused"):
    check_transition(status, "cancel_requested")
  check_transition("cancel_requested", "cancelled")


def test_terminal_run_cannot_be_cancelled_or_requeued():
  with pytest.raises(InvalidTransition):
    check_transition("completed", "cancel_requested")
  with pytest.raises(InvalidTransition):
    check_transition("cancelled", "queued")


def test_generation_not_runnable_is_explicit():
  with pytest.raises(GenerationNotRunnable):
    raise GenerationNotRunnable("duplicate delivery")


def test_report_verification_requires_ledger_for_external_links():
  result = verify_report(
    "A finding [source](https://example.test/a).",
    {"https://example.test/a"},
  )
  assert result.sufficient is True
  assert result.unsupported_urls == ()


def test_report_verification_marks_unknown_external_link_unsupported():
  result = verify_report("A finding [source](https://unknown.test/a).", set())
  assert result.sufficient is False
  assert result.unsupported_urls == ("https://unknown.test/a",)
