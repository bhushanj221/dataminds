from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.database import Base


class ChatSession(Base):
    """One AI chat thread (§7.2 — conversation threads, history preserved).
    Personal to its owner. Holds an ordered list of ChatMessages."""
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True)
    source_name = Column(String(255), nullable=True)
    title = Column(String(255), nullable=False, default="New chat")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False, index=True)


class ChatMessage(Base):
    """A single message in a session. `data` is the JSON-serialized frontend
    message (question, or the full AskResponse / clarify / error) so the chat
    rehydrates exactly as it was."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(12), nullable=False)  # user | assistant
    data = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
