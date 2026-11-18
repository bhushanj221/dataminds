from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Text

from app.database import Base


class FewShotExample(Base):
    """A stored question→SQL pair that grew from real usage.
    `verified` (thumbs-up) pairs are preferred during retrieval."""
    __tablename__ = "few_shot_examples"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    sql = Column(Text, nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
