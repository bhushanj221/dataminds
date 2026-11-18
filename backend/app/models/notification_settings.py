from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.database import Base


class NotificationSettings(Base):
    """Per-user delivery config for alert channels. One row per owner.
    The SMTP password is stored encrypted (Fernet) and never returned to the UI."""
    __tablename__ = "notification_settings"
    __table_args__ = (UniqueConstraint("owner_id", name="uq_notif_settings_owner"),)

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # ── Email (SMTP) ──
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, nullable=True, default=587)
    smtp_username = Column(String(255), nullable=True)
    smtp_encrypted_password = Column(Text, nullable=True)  # write-only
    smtp_from = Column(String(255), nullable=True)         # From address
    smtp_use_tls = Column(Boolean, nullable=False, default=True)
    default_email_to = Column(Text, nullable=True)         # comma-separated default recipients

    # ── Microsoft Teams ──
    teams_webhook_url = Column(Text, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
