from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base


class DashboardShare(Base):
    """Grants a specific user access to a specific dashboard (§14.1).
    permission: 'view' (read-only) or 'edit' (can modify layout/name)."""
    __tablename__ = "dashboard_shares"
    __table_args__ = (UniqueConstraint("dashboard_id", "user_id", name="uq_dashboard_share"),)

    id = Column(Integer, primary_key=True, index=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission = Column(String(10), nullable=False, default="view")  # view | edit
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
