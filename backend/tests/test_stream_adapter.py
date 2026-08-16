"""Tests for the streaming event adapter.

The adapter translates the OpenAI Agents SDK event stream into the app's
SSE chunk format. The SDK delivers model text as ``RawResponsesStreamEvent``
objects wrapping a Responses-style ``.data`` payload, and tool activity as
``RunItemStreamEvent`` objects. These tests mirror those real shapes.

Note: ``adapt_stream`` does NOT emit the terminal ``done`` event — that is
added by the chat service after persistence — so it is not asserted here.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.services.ai.agent.stream_adapter import _adapt_event, adapt_stream


class RawData:
  """Mimics an OpenAI Responses-style data payload (e.g. text delta)."""

  def __init__(self, data_type: str, delta: str | None = None) -> None:
    self.type = data_type
    if delta is not None:
      self.delta = delta


# The adapter dispatches on ``type(event).__name__``, so the mock classes must
# be named exactly as the SDK classes they stand in for.
class RawResponsesStreamEvent:
  """Mimics ``RawResponsesStreamEvent`` (token-level model output)."""

  def __init__(self, data: RawData) -> None:
    self.data = data


class _RawToolCall:
  def __init__(self, name: str, arguments: Any) -> None:
    self.name = name
    self.arguments = arguments


class _RunItem:
  def __init__(self, raw_item: Any = None, output: Any = None) -> None:
    self.raw_item = raw_item
    self.output = output


class RunItemStreamEvent:
  """Mimics ``RunItemStreamEvent`` (completed tool call / tool output)."""

  def __init__(self, name: str, item: _RunItem) -> None:
    self.name = name
    self.item = item


def text_delta(delta: str) -> RawResponsesStreamEvent:
  return RawResponsesStreamEvent(RawData("response.output_text.delta", delta))


def reasoning_delta(delta: str) -> RawResponsesStreamEvent:
  return RawResponsesStreamEvent(RawData("response.reasoning_text.delta", delta))


def non_text_raw() -> RawResponsesStreamEvent:
  return RawResponsesStreamEvent(RawData("response.created"))


class MockRunResultStreaming:
  """Minimal mock for ``RunResultStreaming``."""

  def __init__(self, events: list[Any]) -> None:
    self._events = events

  async def stream_events(self) -> AsyncIterator[Any]:
    for event in self._events:
      yield event


class TestAdaptEvent:
  """Single-event adaptation against real SDK event shapes."""

  def test_text_delta_becomes_chunk(self):
    out = _adapt_event(text_delta("Hello"), full_content=[])
    assert out == {"type": "chunk", "content": "Hello"}

  def test_empty_text_delta_ignored(self):
    assert _adapt_event(text_delta(""), full_content=[]) is None

  def test_non_text_raw_event_ignored(self):
    assert _adapt_event(non_text_raw(), full_content=[]) is None

  def test_reasoning_delta_is_not_exposed(self):
    assert _adapt_event(reasoning_delta("thinking..."), full_content=[]) is None

  def test_tool_call_event(self):
    ev = RunItemStreamEvent(
      "tool_called",
      _RunItem(raw_item=_RawToolCall("search_papers", {"query": "x"})),
    )
    out = _adapt_event(ev)
    assert out["type"] == "tool_call"
    assert out["tool"] == "search_papers"
    assert out["arguments"] == {"query": "x"}

  def test_tool_output_event(self):
    ev = RunItemStreamEvent(
      "tool_output",
      _RunItem(raw_item=_RawToolCall("search_papers", {}), output="found 3"),
    )
    out = _adapt_event(ev)
    assert out["type"] == "tool_result"
    assert out["tool"] == "search_papers"
    assert out["result"] == "found 3"

  def test_full_content_accumulates(self):
    acc: list[str] = []
    _adapt_event(text_delta("Hello "), full_content=acc)
    _adapt_event(text_delta("World"), full_content=acc)
    assert "".join(acc) == "Hello World"


class TestAdaptStream:
  """Full stream adaptation end-to-end."""

  async def test_text_chunks_yielded(self):
    events = [text_delta("Hello "), text_delta("World")]
    stream = MockRunResultStreaming(events)
    results = [chunk async for chunk in adapt_stream(stream, session_id=1)]

    chunks = [r for r in results if r["type"] == "chunk"]
    assert chunks == [
      {"type": "chunk", "content": "Hello "},
      {"type": "chunk", "content": "World"},
    ]

  async def test_empty_stream_yields_nothing(self):
    stream = MockRunResultStreaming([])
    results = [chunk async for chunk in adapt_stream(stream, session_id=5)]
    # No model events → no content chunks (the terminal "done" is added by
    # the chat service, not the adapter).
    assert [r for r in results if r["type"] == "chunk"] == []

  async def test_tool_call_then_text(self):
    events = [
      RunItemStreamEvent(
        "tool_called",
        _RunItem(raw_item=_RawToolCall("search_papers", {"query": "t"})),
      ),
      RunItemStreamEvent(
        "tool_output",
        _RunItem(raw_item=_RawToolCall("search_papers", {}), output="3 papers"),
      ),
      text_delta("Here are the results."),
    ]
    stream = MockRunResultStreaming(events)
    results = [
      chunk
      async for chunk in adapt_stream(stream, session_id=1)
      if chunk["type"] != "keepalive"
    ]

    types = [r["type"] for r in results]
    assert types == ["tool_call", "tool_result", "chunk"]
