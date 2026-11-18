from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ChatSessionCreate(BaseModel):
    source_id: int | None = None
    source_name: str | None = None
    title: str | None = None


class ChatSessionUpdate(BaseModel):
    title: str | None = None


class ChatSessionResponse(BaseModel):
    id: int
    title: str
    source_id: int | None
    source_name: str | None
    message_count: int
    created_at: datetime
    updated_at: datetime


class ChatMessageCreate(BaseModel):
    role: str                     # user | assistant
    data: dict[str, Any] = {}     # serialized frontend message (question / response / clarify / error)


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    data: dict[str, Any]


class ChatSessionDetail(ChatSessionResponse):
    messages: list[ChatMessageResponse] = []
