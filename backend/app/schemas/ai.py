from typing import Any

from pydantic import BaseModel, field_validator


class HistoryTurn(BaseModel):
    question: str
    sql: str


class AskRequest(BaseModel):
    source_id: int
    question: str
    history: list[HistoryTurn] = []  # recent conversation turns for follow-ups
    allow_clarify: bool = True       # False when the user is answering a clarification (avoids loops)

    @field_validator("question")
    @classmethod
    def q_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Question cannot be empty")
        return v.strip()

    @field_validator("history")
    @classmethod
    def cap_history(cls, v: list) -> list:
        return v[-4:]  # keep prompt bounded — last 4 turns


class AskResponse(BaseModel):
    sql: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    duration_ms: float
    attempts: int
    error: str | None = None
    chart_type: str
    chart_config: dict[str, Any]
    figure: dict[str, Any] | None = None
    usage_today: int | None = None
    daily_limit: int | None = None
    example_id: int | None = None
    needs_clarification: bool = False
    clarifying_question: str | None = None


class AISettingsResponse(BaseModel):
    configured: bool          # is any usable key available (platform or own)?
    use_own: bool             # is the user on their own key?
    provider: str | None      # the user's chosen provider (if own)
    model: str | None
    base_url: str | None
    has_own_key: bool         # does a stored own-key exist (never returns the key)
    platform_available: bool  # is the platform default key configured?
    daily_limit: int


class AISettingsUpdate(BaseModel):
    use_own: bool | None = None
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None  # write-only; stored encrypted, never returned
