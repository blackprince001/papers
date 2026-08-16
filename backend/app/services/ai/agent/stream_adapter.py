"""Adapter between openai-agents SDK streaming events and the app's SSE format.

The app's frontend expects SSE chunks with this shape::

    {"type": "chunk", "content": "..."}
    {"type": "done", "message_id": 123, "session_id": 456}
    {"type": "error", "error": "..."}

The SDK's ``Runner.run_streamed()`` yields ``RunResultStreaming`` events.
This module translates between them so the frontend needs **zero changes**.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, AsyncIterator

from app.core.logger import get_logger
from app.services.ai.agent.error import classify_exception

# A 5xx HTTP status as a standalone token (avoids matching "gpt-5", "415", etc.).
_SERVER_ERROR_RE = re.compile(r"\b5\d\d\b")

logger = get_logger(__name__)


CHUNK_TYPE_TEXT = "chunk"
CHUNK_TYPE_DONE = "done"
CHUNK_TYPE_ERROR = "error"
CHUNK_TYPE_TOOL_CALL = "tool_call"
CHUNK_TYPE_TOOL_RESULT = "tool_result"
CHUNK_TYPE_THOUGHT = "thought"
CHUNK_TYPE_KEEPALIVE = "keepalive"

KEEPALIVE_INTERVAL_SECONDS = 15

# Structured error codes — no SDK dependency, safe to import at module level
ERROR_CODE_RATE_LIMIT = "rate_limit"
ERROR_CODE_AUTH = "auth"
ERROR_CODE_PROVIDER_UNAVAILABLE = "provider_unavailable"
ERROR_CODE_TIMEOUT = "timeout"
ERROR_CODE_TOOL_ERROR = "tool_error"
ERROR_CODE_INTERNAL = "internal"
ERROR_CODE_MAX_TURNS = "max_turns"
ERROR_CODE_NETWORK = "network"
ERROR_CODE_NO_PROVIDER = "no_provider"

# OpenAI Agents SDK — optional dependency
try:
  from agents import MaxTurnsExceeded, RunResultStreaming
except ImportError:
  MaxTurnsExceeded = Exception  # type: ignore[misc]
  RunResultStreaming = Any  # type: ignore[misc]


async def adapt_stream(
  stream: RunResultStreaming,
  session_id: int | None = None,
  message_id: int | None = None,
) -> AsyncIterator[dict[str, Any]]:
  """Convert an SDK stream into the app's SSE chunk format.

  Interleaves keep-alive events every ``KEEPALIVE_INTERVAL_SECONDS``
  so the frontend can distinguish a slow response from a dead connection.

  Args:
      stream: The SDK's streaming result.
      session_id: Chat session ID for the ``done`` event.
      message_id: Assigned after the stream completes.

  Yields:
      Dicts matching the frontend ``StreamChunk`` interface.
  """
  full_content: list[str] = []
  queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
  stream_done = asyncio.Event()

  async def _drain_sdk_events():
    """Pull events from the SDK and push them onto the queue."""
    try:
      async for event in stream.stream_events():
        adapted = _adapt_event(event, full_content)
        if adapted is not None:
          await queue.put(adapted)
        if adapted and adapted.get("type") == CHUNK_TYPE_ERROR:
          break
    except MaxTurnsExceeded as exc:
      logger.error("SDK stream error", error=str(exc))
      await queue.put(
        {
          "type": CHUNK_TYPE_ERROR,
          "error": f"Agent exceeded max turns ({exc})",
          "error_code": ERROR_CODE_MAX_TURNS,
          "recoverable": True,
        }
      )
    except asyncio.CancelledError:
      raise
    except Exception as exc:
      logger.error("SDK stream error", error=str(exc))
      error_code, recoverable = classify_exception(exc)
      await queue.put(
        {
          "type": CHUNK_TYPE_ERROR,
          "error": str(exc)[:200],
          "error_code": error_code,
          "recoverable": recoverable,
        }
      )
    finally:
      stream_done.set()
      await queue.put(None)

  async def _emit_keepalive():
    """Emit keep-alive events until the SDK stream finishes."""
    while not stream_done.is_set():
      try:
        await asyncio.wait_for(
          stream_done.wait(),
          timeout=KEEPALIVE_INTERVAL_SECONDS,
        )
      except asyncio.TimeoutError:
        await queue.put({"type": CHUNK_TYPE_KEEPALIVE})

  sdk_task = asyncio.create_task(_drain_sdk_events())
  ka_task = asyncio.create_task(_emit_keepalive())

  try:
    while True:
      item = await queue.get()
      if item is None:
        break
      yield item
  finally:
    sdk_task.cancel()
    ka_task.cancel()
    try:
      await sdk_task
    except asyncio.CancelledError:
      pass
    try:
      await ka_task
    except asyncio.CancelledError:
      pass


def _adapt_event(
  event: Any,
  full_content: list[str] | None = None,
) -> dict[str, Any] | None:
  """Adapt a single SDK event to the app's SSE chunk format."""
  cls = type(event).__name__

  # The SDK wraps the model's token stream in ``RawResponsesStreamEvent``,
  # whose ``.data`` is an OpenAI Responses-style event (e.g.
  # ``ResponseTextDeltaEvent`` with ``type == 'response.output_text.delta'``).
  # Text/reasoning deltas only ever arrive this way, so we must unwrap it.
  if cls == "RawResponsesStreamEvent":
    return _adapt_raw_response(event, full_content)

  # Higher-level events fire once per completed run item (tool calls, tool
  # outputs). These carry tool name/arguments/results.
  if cls == "RunItemStreamEvent":
    return _adapt_run_item(event)

  # Fallback: legacy/name-based classification for other SDK shapes.
  event_type = _classify_event(event)

  if event_type == "text_delta":
    delta = _get_text_delta(event)
    if delta:
      if full_content is not None:
        full_content.append(delta)
      return {"type": CHUNK_TYPE_TEXT, "content": delta}

  if event_type == "tool_call":
    call_info = _get_tool_call_info(event)
    if call_info:
      return {
        "type": CHUNK_TYPE_TOOL_CALL,
        "tool": call_info["tool"],
        "arguments": call_info["arguments"],
      }

  if event_type == "tool_result":
    result_info = _get_tool_result_info(event)
    if result_info:
      return {
        "type": CHUNK_TYPE_TOOL_RESULT,
        "tool": result_info["tool"],
        "result": result_info["result"],
      }

  if event_type == "thought":
    # Model reasoning is not user-facing telemetry. Tool/activity events expose
    # useful progress without retaining or emitting raw chain-of-thought.
    return None

  if event_type == "error":
    error_msg, error_code, recoverable = _get_error(event)
    return {
      "type": CHUNK_TYPE_ERROR,
      "error": error_msg,
      "error_code": error_code,
      "recoverable": recoverable,
    }

  return None


def _adapt_raw_response(
  event: Any,
  full_content: list[str] | None,
) -> dict[str, Any] | None:
  """Adapt a ``RawResponsesStreamEvent`` (token-level model output)."""
  data = getattr(event, "data", None)
  if data is None:
    return None

  data_type = getattr(data, "type", "") or ""

  if data_type == "response.output_text.delta":
    delta = getattr(data, "delta", "") or ""
    if delta:
      if full_content is not None:
        full_content.append(delta)
      return {"type": CHUNK_TYPE_TEXT, "content": delta}
    return None

  # Reasoning/thinking deltas (o-series, DeepSeek-R1, etc.) are deliberately
  # not emitted or persisted. They can contain raw chain-of-thought.
  if data_type in (
    "response.reasoning_summary_text.delta",
    "response.reasoning_text.delta",
  ):
    return None

  return None


def _adapt_run_item(event: Any) -> dict[str, Any] | None:
  """Adapt a ``RunItemStreamEvent`` (completed tool call or tool output)."""
  name = getattr(event, "name", "")
  item = getattr(event, "item", None)
  if item is None:
    return None

  raw = getattr(item, "raw_item", None)

  if name == "tool_called":
    tool_name = getattr(raw, "name", None) or "tool"
    arguments = getattr(raw, "arguments", None) or {}
    return {
      "type": CHUNK_TYPE_TOOL_CALL,
      "tool": tool_name,
      "arguments": arguments,
    }

  if name == "tool_output":
    tool_name = getattr(raw, "name", None) or "tool"
    output = getattr(item, "output", None)
    if output is None and isinstance(raw, dict):
      output = raw.get("output")
    return {
      "type": CHUNK_TYPE_TOOL_RESULT,
      "tool": tool_name,
      "result": str(output) if output is not None else "",
    }

  return None


def _classify_event(event: Any) -> str:
  """Classify a raw SDK event into a known type string."""
  event_cls = type(event).__name__

  if "AgentTextDelta" in event_cls or "RawTextDelta" in event_cls:
    return "text_delta"
  if "ToolCall" in event_cls or "FunctionCall" in event_cls:
    return "tool_call"
  if "ToolResult" in event_cls or "FunctionResult" in event_cls:
    return "tool_result"
  if "Thought" in event_cls or "Reasoning" in event_cls:
    return "thought"
  if "Error" in event_cls:
    return "error"

  return "unknown"


def _get_text_delta(event: Any) -> str | None:
  """Extract the text delta from a text-delta event."""
  try:
    return event.delta if hasattr(event, "delta") else str(event)
  except Exception:
    return None


def _get_tool_call_info(event: Any) -> dict[str, Any] | None:
  """Extract tool name and arguments from a tool-call event."""
  try:
    return {
      "tool": event.tool_name if hasattr(event, "tool_name") else str(event),
      "arguments": event.arguments if hasattr(event, "arguments") else {},
    }
  except Exception:
    return None


def _get_tool_result_info(event: Any) -> dict[str, Any] | None:
  """Extract tool name and result from a tool-result event."""
  try:
    return {
      "tool": event.tool_name if hasattr(event, "tool_name") else str(event),
      "result": event.result if hasattr(event, "result") else str(event),
    }
  except Exception:
    return None


def _get_thought(event: Any) -> str | None:
  """Extract reasoning/thought text from a thought event."""
  try:
    return event.content if hasattr(event, "content") else str(event)
  except Exception:
    return None


def _get_error(event: Any) -> tuple[str, str, bool]:
  """Extract error message, code, and recoverability from an error event."""
  try:
    msg = event.message if hasattr(event, "message") else str(event)
  except Exception:
    msg = "Unknown error during streaming"

  msg_lower = msg.lower()

  if "max turns" in msg_lower or "maxturn" in msg_lower:
    return msg, ERROR_CODE_MAX_TURNS, True
  if "rate" in msg_lower and ("limit" in msg_lower or "429" in msg):
    return msg, ERROR_CODE_RATE_LIMIT, True
  if any(k in msg_lower for k in ("auth", "api key", "unauthorized", "401", "403")):
    return msg, ERROR_CODE_AUTH, False
  if any(k in msg_lower for k in ("timeout", "timed out", "timed_out")):
    return msg, ERROR_CODE_TIMEOUT, True
  if (
    "unavailable" in msg_lower
    or "server error" in msg_lower
    or _SERVER_ERROR_RE.search(msg)
  ):
    return msg, ERROR_CODE_PROVIDER_UNAVAILABLE, True
  if any(k in msg_lower for k in ("tool", "function")) and "error" in msg_lower:
    return msg, ERROR_CODE_TOOL_ERROR, True
  if any(
    k in msg_lower for k in ("connection", "network", "econnrefused", "econnreset")
  ):
    return msg, ERROR_CODE_NETWORK, True

  return msg, ERROR_CODE_INTERNAL, False
