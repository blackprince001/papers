"""Low-cardinality, redacted metrics for deep-research operations.

The application already emits structured logs, so the research lifecycle uses
those logs as its metric transport. This module keeps the event vocabulary and
the privacy boundary in one place. Questions, reports, evidence bodies,
checkpoints, credentials, user IDs, and session IDs are never accepted as
metric fields.
"""

from __future__ import annotations

from typing import Any

from app.core.logger import get_logger

logger = get_logger(__name__)

_ALLOWED_FIELDS = {
  "mode",
  "status",
  "phase",
  "provider_type",
  "model",
  "duration_ms",
  "queue_age_ms",
  "source_count",
  "verification_status",
  "error_code",
  "retry_count",
  "stop_reason",
  "sse_lag_ms",
  "cancel_requested",
  "abandoned",
  "tokens_in",
  "tokens_out",
  "cost_usd",
}
_MAX_TEXT = 128


def record_metric(event: str, **fields: Any) -> None:
  """Emit one safe lifecycle metric without making telemetry a dependency.

  Unknown fields are dropped so a future caller cannot accidentally add a raw
  identifier or provider response to the structured log. Values are bounded to
  keep cardinality and log volume predictable.
  """
  safe: dict[str, Any] = {}
  for key, value in fields.items():
    if key not in _ALLOWED_FIELDS or value is None:
      continue
    if isinstance(value, bool):
      safe[key] = value
    elif isinstance(value, (int, float)) and value >= 0:
      safe[key] = value
    elif isinstance(value, str):
      safe[key] = value[:_MAX_TEXT]
  logger.info("deep_research_metric", metric=event[:64], **safe)
