from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class DatasetCreate(BaseModel):
    name: str
    description: str = ""
    source_id: int
    sql: str
    config: dict[str, Any] = {}
    certified: bool = False

    @field_validator("name", "sql")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Cannot be empty")
        return v.strip()


class DatasetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    source_id: int | None = None
    sql: str | None = None
    config: dict[str, Any] | None = None
    certified: bool | None = None


class DatasetResponse(BaseModel):
    id: int
    name: str
    description: str
    source_id: int
    sql: str
    config: dict[str, Any]
    certified: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ColumnProfile(BaseModel):
    column: str
    kind: str = "cat"           # num | time | cat
    nulls_pct: float = 0.0
    distinct: int = 0
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    sample: list[str] = []


class DatasetPreview(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    profile: list[ColumnProfile] = []
