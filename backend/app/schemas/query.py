from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class QueryRequest(BaseModel):
    sql: str
    limit: int = 1000

    @field_validator("sql")
    @classmethod
    def sql_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("SQL cannot be empty")
        return v

    @field_validator("limit")
    @classmethod
    def limit_range(cls, v: int) -> int:
        return max(1, min(v, 10000))


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    duration_ms: float
    truncated: bool = False


class HistoryItem(BaseModel):
    id: int
    source_id: int | None
    source_name: str | None
    sql: str
    status: str
    error: str | None
    row_count: int | None
    duration_ms: float | None
    created_at: datetime

    model_config = {"from_attributes": True}
