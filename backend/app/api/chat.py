"""AI chat session history (§7.2). Personal per-user threads so a user can
revisit any past conversation. The frontend stores each finalized message's
JSON in `data` and rehydrates it verbatim."""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.database import get_db
from app.models.chat_session import ChatMessage, ChatSession
from app.models.user import User
from app.schemas.chat import (
    ChatMessageCreate, ChatMessageResponse, ChatSessionCreate,
    ChatSessionDetail, ChatSessionResponse, ChatSessionUpdate,
)

router = APIRouter(prefix="/api/chat/sessions", tags=["chat"])


async def _owned(session_id: int, user: User, db: AsyncSession) -> ChatSession:
    s = (await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.owner_id == user.id)
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Chat not found")
    return s


def _session_response(s: ChatSession, count: int = 0) -> ChatSessionResponse:
    return ChatSessionResponse(
        id=s.id, title=s.title, source_id=s.source_id, source_name=s.source_name,
        message_count=count, created_at=s.created_at, updated_at=s.updated_at,
    )


@router.post("", response_model=ChatSessionResponse, status_code=201)
async def create_session(body: ChatSessionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = ChatSession(
        owner_id=user.id, source_id=body.source_id, source_name=body.source_name,
        title=(body.title or "New chat").strip()[:255] or "New chat",
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _session_response(s)


@router.get("", response_model=list[ChatSessionResponse])
async def list_sessions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    counts = dict((await db.execute(
        select(ChatMessage.session_id, func.count(ChatMessage.id)).group_by(ChatMessage.session_id)
    )).all())
    res = await db.execute(
        select(ChatSession).where(ChatSession.owner_id == user.id).order_by(ChatSession.updated_at.desc())
    )
    return [_session_response(s, counts.get(s.id, 0)) for s in res.scalars().all()]


@router.get("/{session_id}", response_model=ChatSessionDetail)
async def get_session(session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(session_id, user, db)
    rows = (await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.id.asc())
    )).scalars().all()
    messages = [ChatMessageResponse(id=m.id, role=m.role, data=json.loads(m.data or "{}")) for m in rows]
    return ChatSessionDetail(
        id=s.id, title=s.title, source_id=s.source_id, source_name=s.source_name,
        message_count=len(messages), created_at=s.created_at, updated_at=s.updated_at, messages=messages,
    )


@router.put("/{session_id}", response_model=ChatSessionResponse)
async def update_session(session_id: int, body: ChatSessionUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(session_id, user, db)
    if body.title is not None and body.title.strip():
        s.title = body.title.strip()[:255]
    await db.commit()
    await db.refresh(s)
    return _session_response(s)


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(session_id, user, db)
    await db.delete(s)
    await db.commit()


@router.post("/{session_id}/messages", response_model=ChatMessageResponse, status_code=201)
async def add_message(session_id: int, body: ChatMessageCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    s = await _owned(session_id, user, db)
    m = ChatMessage(session_id=session_id, role=body.role, data=json.dumps(body.data))
    db.add(m)
    s.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(m)
    return ChatMessageResponse(id=m.id, role=m.role, data=body.data)
