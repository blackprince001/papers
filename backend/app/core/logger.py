"""
Centralized structured logging configuration.

Uses structlog for JSON-formatted, context-rich logging.
"""

import logging
import sys
from typing import Any

import structlog


def configure_logging(is_debug: bool = False) -> None:
  """Configure structlog with appropriate processors for the environment."""
  log_level = logging.DEBUG if is_debug else logging.INFO

  shared_processors: list[Any] = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.PositionalArgumentsFormatter(),
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
    structlog.processors.UnicodeDecoder(),
  ]

  structlog.configure(
    processors=[
      *shared_processors,
      structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
  )

  formatter = structlog.stdlib.ProcessorFormatter(
    foreign_pre_chain=shared_processors,
    processors=[
      structlog.stdlib.ProcessorFormatter.remove_processors_meta,
      structlog.dev.ConsoleRenderer()
      if is_debug
      else structlog.processors.JSONRenderer(),
    ],
  )

  handler = logging.StreamHandler(sys.stdout)
  handler.setFormatter(formatter)

  root_logger = logging.getLogger()
  root_logger.handlers.clear()
  root_logger.addHandler(handler)
  root_logger.setLevel(log_level)

  logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
  logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
  """Get a structured logger for the given module name."""
  return structlog.get_logger(name)
