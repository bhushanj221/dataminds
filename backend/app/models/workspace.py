from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base


class Workspace(Base):
    """A tenant boundary. Every user belongs to exactly one workspace; users,
    roles, and onboarding are scoped to it. A self-signup creates a new
    workspace with that user as its admin; admins onboard others into theirs."""
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    # Admin-set per-user daily AI question cap on the shared key (None = platform default).
    ai_daily_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
