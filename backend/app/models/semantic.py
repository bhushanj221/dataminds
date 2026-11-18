from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.database import Base


class SemanticDoc(Base):
    """Free-form semantic documentation for one data source, stored as JSON:
    {"tables": {tbl: desc}, "columns": {"tbl.col": desc}, "glossary": [{term, definition}]}.
    Verified metrics live in their own table (they need DB verification)."""
    __tablename__ = "semantic_docs"
    __table_args__ = (UniqueConstraint("source_id", name="uq_semantic_doc_source"),)

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    doc = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Metric(Base):
    """A verified SQL fragment — business logic the AI must reuse verbatim
    instead of reinventing it. `expression` is valid in a SELECT over `table_name`."""
    __tablename__ = "metrics"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    table_name = Column(String(255), nullable=False)
    expression = Column(Text, nullable=False)   # e.g. SUM(amount), COUNT(*) FILTER (WHERE status='paid')
    verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
