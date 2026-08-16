"""Tests for durable event cursor contracts."""

from __future__ import annotations

import pytest
from app.services.deep_research.event_store import (
  InvalidCursor,
  decode_cursor,
  encode_cursor,
)


def test_cursor_round_trip_is_opaque_and_generation_scoped():
  cursor = encode_cursor(3, 42)
  assert cursor != "3:42"
  assert decode_cursor(cursor) == (3, 42)


def test_cursor_tampering_is_rejected():
  cursor = encode_cursor(3, 42)
  tampered = cursor[:-1] + ("A" if cursor[-1] != "A" else "B")
  with pytest.raises(InvalidCursor):
    decode_cursor(tampered)


@pytest.mark.parametrize("cursor", ["", "not-a-cursor", encode_cursor(0, 1), encode_cursor(1, -1)])
def test_invalid_cursor_is_rejected(cursor):
  if cursor == "":
    pytest.skip("an empty cursor means no resume cursor")
  with pytest.raises(InvalidCursor):
    decode_cursor(cursor)
