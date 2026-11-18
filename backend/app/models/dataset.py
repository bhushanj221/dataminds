from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class Dataset(Base):
    """A virtual dataset — a named, reusable SQL query (view) over a connected
    source. Like a Chart it carries (source_id, sql, config), but it has no chart
    type: it's a logical table that charts, AI, and dashboards can build on."""
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=False, default="")
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False)
    sql = Column(Text, nullable=False)
    config = Column(Text, nullable=False, default="{}")  # JSON: { tags: [...], ... }
    certified = Column(Boolean, nullable=False, default=False)  # trusted / production-ready
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
