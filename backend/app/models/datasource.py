from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # postgresql | mysql | sqlite | ...
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=True)
    database = Column(String(255), nullable=False)
    username = Column(String(255), nullable=True)
    encrypted_password = Column(Text, nullable=True)  # Fernet ciphertext, never plain
    options = Column(Text, nullable=True)  # JSON: extra params (account, http_path, keyfile_json, ...)
    status = Column(String(20), default="connected", nullable=False)  # connected | error
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
