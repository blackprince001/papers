"""Base class for Google AI services with shared client management."""

from google import genai

from app.core.config import settings


class BaseGoogleAIService:
  """Base class that provides shared Google AI client initialization logic.

  All AI services that use the Google GenAI API should inherit from this class
  to avoid duplicating the client management code.
  """

  def __init__(self) -> None:
    self.client: genai.Client | None = None
    self._last_api_key: str | None = None
    self._initialize_client()

  def _initialize_client(self) -> None:
    """Initialize or refresh the Google API client with current settings.

    This method handles API key changes at runtime by recreating the client
    when the key changes.
    """
    current_key = settings.GOOGLE_API_KEY
    has_key_changed = self._last_api_key != current_key
    should_recreate = not self.client or has_key_changed

    if current_key and should_recreate:
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key
    elif not current_key:
      self.client = None
      self._last_api_key = None

  def _get_client(self) -> genai.Client | None:
    """Get the current client, refreshing if API key changed.

    Returns:
        The GenAI client instance, or None if no API key is configured.
    """
    self._initialize_client()
    return self.client
