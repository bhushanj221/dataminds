from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class ChartCreate(BaseModel):
    name: str
    chart_type: str
    source_id: int
    sql: str
    config: dict[str, Any] = {}

    @field_validator("name", "chart_type", "sql")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Cannot be empty")
        return v.strip()


class ChartUpdate(BaseModel):
    name: str | None = None
    chart_type: str | None = None
    source_id: int | None = None
    sql: str | None = None
    config: dict[str, Any] | None = None


class ChartResponse(BaseModel):
    id: int
    name: str
    chart_type: str
    source_id: int
    sql: str
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
