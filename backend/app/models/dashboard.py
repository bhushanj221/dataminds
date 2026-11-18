from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class Dashboard(Base):
    __tablename__ = "dashboards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    # JSON list of widgets: [{"i": "w1", "chart_id": 3, "x": 0, "y": 0, "w": 6, "h": 4}]
    layout = Column(Text, nullable=False, default="[]")
    # JSON dashboard config: {"theme": "light", "palette": "ocean",
    #   "filters": [{"id": "f1", "column": "region", "values": ["US"]}]}
    config = Column(Text, nullable=False, default="{}")
    # optional folder for organization (null = uncategorized / root)
    folder_id = Column(Integer, ForeignKey("dashboard_folders.id", ondelete="SET NULL"), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
