from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class DashboardFolder(Base):
    """A folder for organizing dashboards. Workspace-scoped via owner; a
    dashboard's folder_id points here (nullable = uncategorized / root)."""
    __tablename__ = "dashboard_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    # self-referential parent for nested folders (null = top level / root)
    parent_id = Column(Integer, ForeignKey("dashboard_folders.id", ondelete="SET NULL"), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
