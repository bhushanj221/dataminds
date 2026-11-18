from datetime import datetime
from sqlalchemy import Column, ForeignKey, Integer, String, Boolean, DateTime, Text
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="analyst", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    # Tenant boundary — every user belongs to one workspace (backfilled for legacy rows).
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True, index=True)
    # Per-user override of the workspace's daily AI question cap (None = use workspace/default).
    ai_daily_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # AI / BYOK — when llm_use_own is True the user's own key/provider is used
    # instead of the platform default. Key is Fernet-encrypted, never returned.
    llm_use_own = Column(Boolean, default=False, nullable=False)
    llm_provider = Column(String(50), nullable=True)
    llm_model = Column(String(100), nullable=True)
    llm_base_url = Column(String(255), nullable=True)
    llm_encrypted_key = Column(Text, nullable=True)
