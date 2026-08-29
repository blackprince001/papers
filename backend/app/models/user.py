from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class User(Base):
  __tablename__ = "users"

  id = Column(Integer, primary_key=True, index=True)
  email = Column(String(255), unique=True, nullable=False, index=True)
  google_id = Column(String(255), unique=True, nullable=True, index=True)
  display_name = Column(String(255), nullable=False)
  avatar_url = Column(Text, nullable=True)
  organization = Column(String(255), nullable=True, index=True)
  department = Column(String(255), nullable=True)
  research_field = Column(String(255), nullable=True)
  bio = Column(Text, nullable=True)
  role = Column(String(20), nullable=False, default="user", server_default="user")
  auth_provider = Column(
    String(20), nullable=False, default="google", server_default="google"
  )
  password_hash = Column(String(255), nullable=True)
  is_active = Column(Boolean, nullable=False, default=True, server_default="true")
  login_count = Column(Integer, nullable=False, default=0, server_default="0")
  last_login_at = Column(DateTime(timezone=True), nullable=True)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  # Relationships
  papers = relationship(
    "Paper", back_populates="uploaded_by", foreign_keys="Paper.uploaded_by_id"
  )
  groups = relationship("Group", back_populates="user")
  tags = relationship("Tag", back_populates="user")
  annotations = relationship("Annotation", back_populates="user")
  annotation_explanations = relationship(
    "AnnotationExplanation", back_populates="owner", cascade="all, delete-orphan"
  )
  bookmarks = relationship("Bookmark", back_populates="user")
  paper_states = relationship("UserPaperState", back_populates="user")
  paper_shares = relationship(
    "PaperShare", foreign_keys="PaperShare.recipient_id", back_populates="recipient"
  )
  shared_papers = relationship(
    "PaperShare", foreign_keys="PaperShare.shared_by_id", back_populates="shared_by"
  )
  group_shares = relationship(
    "GroupShare", foreign_keys="GroupShare.recipient_id", back_populates="recipient"
  )
  shared_groups = relationship(
    "GroupShare", foreign_keys="GroupShare.shared_by_id", back_populates="shared_by"
  )
  reading_sessions = relationship("ReadingSession", back_populates="user")
  chat_sessions = relationship("ChatSession", back_populates="user")
  multi_chat_sessions = relationship("MultiChatSession", back_populates="user")
  saved_searches = relationship("SavedSearch", back_populates="user")
  discovery_sessions = relationship("DiscoverySession", back_populates="user")
  deep_research_sessions = relationship(
    "DeepResearchSession", back_populates="user", passive_deletes=True
  )
  refresh_tokens = relationship(
    "RefreshToken", back_populates="user", cascade="all, delete-orphan"
  )
