from datetime import date

from sqlalchemy import Column, Date, ForeignKey, Integer, UniqueConstraint

from app.database import Base


class AIUsage(Base):
    """Per-user daily AI question counter — enforces the platform-key cap.
    Usage on a customer's own key is not counted (BYOK is unlimited)."""
    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_ai_usage_user_day"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    day = Column(Date, default=date.today, nullable=False)
    count = Column(Integer, default=0, nullable=False)
    prompt_tokens = Column(Integer, default=0, nullable=False)      # cost-view tracking
    completion_tokens = Column(Integer, default=0, nullable=False)
    cached_tokens = Column(Integer, default=0, nullable=False)      # subset of prompt_tokens served from cache
