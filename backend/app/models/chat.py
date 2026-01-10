from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class ChatSession(Base):
  __tablename__ = "chat_sessions"

  id = Column(Integer, primary_key=True, index=True)
  paper_id = Column(
    Integer,
    ForeignKey("papers.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  name = Column(String, server_default="New Session", nullable=False)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  paper = relationship("Paper")
  messages = relationship(
    "ChatMessage",
    back_populates="session",
    cascade="all, delete-orphan",
    order_by="ChatMessage.created_at",
  )


class ChatMessage(Base):
  __tablename__ = "chat_messages"

  id = Column(Integer, primary_key=True, index=True)
  session_id = Column(
    Integer,
    ForeignKey("chat_sessions.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  role = Column(String, nullable=False)
  content = Column(Text, nullable=False)
  references = Column(JSON, default=dict)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )

  session = relationship("ChatSession", back_populates="messages")
