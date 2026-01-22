from google import genai

from app.core.config import settings


class BaseGoogleAIService:
  def __init__(self) -> None:
    self.client: genai.Client | None = None
    self._last_api_key: str | None = None
    self._initialize_client()

  def _initialize_client(self) -> None:
    current_key = settings.GOOGLE_API_KEY
    has_key_changed = self._last_api_key != current_key
    is_client_missing = self.client is None

    if not current_key:
      self.client = None
      self._last_api_key = None
      return

    if is_client_missing or has_key_changed:
      self.client = genai.Client(api_key=current_key)
      self._last_api_key = current_key

  def _get_client(self) -> genai.Client | None:
    self._initialize_client()
    return self.client
