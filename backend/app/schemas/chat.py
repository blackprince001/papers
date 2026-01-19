import base64
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def generate_session_name() -> str:
  """Generate a random base64 session name."""
  return base64.urlsafe_b64encode(secrets.token_bytes(6)).decode()


class ChatMessageBase(BaseModel):
  role: str  # 'user' or 'assistant'
  content: str
  references: Optional[Dict[str, Any]] = {}


class ChatMessageCreate(BaseModel):
  content: str
  references: Optional[Dict[str, Any]] = {}


class ChatMessage(ChatMessageBase):
  id: int
  session_id: int
  created_at: datetime

  model_config = {"from_attributes": True}


class ChatSessionBase(BaseModel):
  paper_id: int
  name: str = Field(default_factory=generate_session_name)


class ChatSessionCreate(BaseModel):
  name: str = Field(default_factory=generate_session_name)


class ChatSessionUpdate(BaseModel):
  name: str


class ChatSession(ChatSessionBase):
  id: int
  created_at: datetime
  updated_at: datetime
  messages: List[ChatMessage] = []

  model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
  message: str
  references: Optional[Dict[str, Any]] = {}  # Parsed references from @ mentions
  session_id: Optional[int] = None


class ChatResponse(BaseModel):
  message: ChatMessage
  session: ChatSession
