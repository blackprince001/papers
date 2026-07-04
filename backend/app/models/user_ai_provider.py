"""Per-user AI provider records (BYO multi-provider support).

Unlike :class:`UserAISettings` (one row per user), this table allows a
user to save *several* providers, mark one as default, and switch between
them — including automatic fallback when an active provider errors.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.encryption import decrypt_value, encrypt_value


class UserAIProvider(Base):
  """A single AI provider configuration owned by a user.

  A user may have many of these.  Exactly one should have
  ``is_default = True``; it is the provider used when a chat session
  does not pin a specific one.  API keys are encrypted at rest.
  """

  __tablename__ = "user_ai_providers"

  id = Column(Integer, primary_key=True, index=True)
  user_id = Column(
    Integer,
    ForeignKey("users.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  label = Column(String(100), nullable=False, default="", server_default="")
  provider = Column(
    String(50),
    nullable=False,
    default="openai-compatible",
    server_default="openai-compatible",
  )
  _api_key_encrypted = Column("api_key", Text, nullable=True)
  base_url = Column(String(500), nullable=True)
  model = Column(String(100), nullable=False, default="", server_default="")
  timeout_seconds = Column(Integer, nullable=True, default=120, server_default="120")
  is_default = Column(Boolean, nullable=False, default=False, server_default="false")
  is_active = Column(Boolean, nullable=False, default=True, server_default="true")
  created_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    nullable=False,
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  user = relationship("User", backref="ai_providers")

  def set_api_key(self, api_key: str) -> None:
    """Encrypt and store the API key."""
    self._api_key_encrypted = encrypt_value(api_key) if api_key else None

  def get_api_key(self) -> str:
    """Decrypt and return the API key."""
    if not self._api_key_encrypted:
      return ""
    return decrypt_value(self._api_key_encrypted)

  @property
  def has_api_key(self) -> bool:
    """Whether an API key is stored (without exposing it)."""
    return bool(self._api_key_encrypted)

  @property
  def is_configured(self) -> bool:
    """Whether this record has enough info to use."""
    return bool(self._api_key_encrypted) and bool(self.provider)
