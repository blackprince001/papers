from datetime import datetime, timezone

from sqlalchemy import (
  JSON,
  Boolean,
  CheckConstraint,
  Column,
  DateTime,
  Enum,
  ForeignKey,
  Integer,
  String,
  Text,
  UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class Annotation(Base):
  __tablename__ = "annotations"

  id = Column(Integer, primary_key=True, index=True)
  user_id = Column(
    Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
  )
  paper_id = Column(
    Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True
  )
  content = Column(Text, nullable=False)
  type = Column(String, default="annotation", nullable=False)
  highlighted_text = Column(Text, nullable=True)
  selection_data = Column(JSON, nullable=True)
  note_scope = Column(String, nullable=True)
  coordinate_data = Column(JSON, default=dict)
  auto_highlighted = Column(Boolean, default=False, nullable=False)
  highlight_type = Column(
    Enum(
      "method",
      "result",
      "conclusion",
      "key_contribution",
      # Selection AI actions (see migration add_ai_action_highlight_types)
      "explain",
      "why",
      "define",
      name="highlighttype",
    ),
    nullable=True,
  )
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  paper = relationship("Paper", back_populates="annotations")
  user = relationship("User", back_populates="annotations")
  explanations = relationship(
    "AnnotationExplanation",
    back_populates="annotation",
    cascade="all, delete-orphan",
  )


class AnnotationExplanation(Base):
  """A versioned, access-controlled explanation for an annotation.

  ``anchor`` is an immutable snapshot of the selected quote and its display
  geometry. It deliberately does not point at a passage/chunk row yet: that
  durable document model and its sharing rules have not been settled.
  """

  __tablename__ = "annotation_explanations"

  id = Column(Integer, primary_key=True, index=True)
  annotation_id = Column(
    Integer,
    ForeignKey("annotations.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  owner_user_id = Column(
    Integer,
    ForeignKey("users.id", ondelete="CASCADE"),
    nullable=False,
    index=True,
  )
  action = Column(String(16), nullable=False)
  status = Column(String(16), nullable=False, default="ready", server_default="ready")
  visibility = Column(
    String(16), nullable=False, default="private", server_default="private"
  )
  generation = Column(Integer, nullable=False, default=1, server_default="1")
  # Immutable semantic anchor snapshot; see app.schemas.annotation.SemanticAnchor.
  anchor = Column(JSON, nullable=False)
  # SHA-256 of paper, action, visibility, prompt version, and anchor snapshot.
  input_hash = Column(String(64), nullable=False)
  prompt_version = Column(String(64), nullable=False)
  provider = Column(String(64), nullable=True)
  model = Column(String(128), nullable=True)
  answer = Column(Text, nullable=True)
  evidence = Column(JSON, nullable=False, default=list)
  error_code = Column(String(64), nullable=True)
  # Nullable preserves the normal idempotency convention: absent keys do not
  # collide, while a supplied key is unique within one owner's namespace.
  idempotency_key = Column(String(255), nullable=True)
  retention_until = Column(DateTime(timezone=True), nullable=False)
  created_at = Column(
    DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
  )
  updated_at = Column(
    DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
    nullable=False,
  )

  __table_args__ = (
    UniqueConstraint(
      "annotation_id",
      "owner_user_id",
      "generation",
      name="uq_annotation_explanation_generation",
    ),
    UniqueConstraint(
      "owner_user_id",
      "idempotency_key",
      name="uq_annotation_explanation_idempotency",
    ),
    CheckConstraint(
      "action IN ('explain','why','define')",
      name="ck_annotation_explanation_action",
    ),
    CheckConstraint(
      "status IN ('queued','generating','ready','failed','expired')",
      name="ck_annotation_explanation_status",
    ),
    CheckConstraint(
      "visibility IN ('private','paper')",
      name="ck_annotation_explanation_visibility",
    ),
    CheckConstraint("generation >= 1", name="ck_annotation_explanation_generation"),
  )

  annotation = relationship("Annotation", back_populates="explanations")
  owner = relationship("User", back_populates="annotation_explanations")
