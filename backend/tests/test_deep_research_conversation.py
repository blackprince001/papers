"""Pure contracts for conversational deep-research follow-ups."""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from app.services.ai.agent.agents import create_deep_research_ask_agent
from app.services.deep_research.conversation import message_projection
from app.services.deep_research.state import (
  InvalidTransition,
  check_follow_up_transition,
  check_transition,
)


def test_ask_agent_has_no_retrieval_tools():
  agent = create_deep_research_ask_agent()

  assert agent.tools == []


def test_follow_up_is_the_only_explicit_terminal_to_queued_transition():
  check_follow_up_transition("completed", "queued")
  check_follow_up_transition("failed", "queued")

  with pytest.raises(InvalidTransition):
    check_transition("completed", "queued")


def test_message_projection_exposes_safe_fields_without_payload():
  message = SimpleNamespace(
    id=12,
    session_id=4,
    generation_id=9,
    role="assistant",
    mode="ask",
    content="Stored answer",
    created_at=datetime.now(timezone.utc),
    payload={
      "mode": "ask",
      "source_ids": [3, 4],
      "verification": "evidence_scoped",
      "provider_key": "must-not-leak",
    },
  )

  projected = message_projection(message, generation_number=2)

  assert projected == {
    "id": 12,
    "session_id": 4,
    "generation_id": 9,
    "generation_number": 2,
    "role": "assistant",
    "mode": "ask",
    "content": "Stored answer",
    "source_ids": [3, 4],
    "verification": "evidence_scoped",
    "created_at": message.created_at,
  }
  assert "provider_key" not in projected
