from typing import Any

def sanitize_text(text: str) -> str:
  if not text:
    return text
  text = text.replace("\x00", "")
  return text.encode("utf-8", errors="replace").decode("utf-8", errors="replace")


def sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
  if not metadata:
    return {}

  sanitized: dict[str, Any] = {}
  for key, value in metadata.items():
    if isinstance(value, str):
      sanitized[key] = sanitize_text(value)
    elif isinstance(value, list):
      sanitized[key] = [
        sanitize_text(item) if isinstance(item, str) else item for item in value
      ]
    else:
      sanitized[key] = value
  return sanitized
