from datetime import datetime

from pydantic import BaseModel, field_validator

FORMATS = {"csv", "excel"}


class ReportCreate(BaseModel):
    source_id: int
    name: str
    sql: str
    description: str | None = None
    fmt: str = "csv"
    recipients: str | None = None
    frequency: int = 86400
    enabled: bool = True

    @field_validator("name", "sql")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("required field cannot be empty")
        return v.strip()

    @field_validator("fmt")
    @classmethod
    def valid_fmt(cls, v: str) -> str:
        if v not in FORMATS:
            raise ValueError(f"fmt must be one of {FORMATS}")
        return v


class ReportUpdate(BaseModel):
    name: str | None = None
    sql: str | None = None
    description: str | None = None
    fmt: str | None = None
    recipients: str | None = None
    frequency: int | None = None
    enabled: bool | None = None


class ReportResponse(BaseModel):
    id: int
    source_id: int
    source_name: str | None
    name: str
    description: str | None
    sql: str
    fmt: str
    recipients: str | None
    frequency: int
    enabled: bool
    last_status: str | None
    last_error: str | None
    last_row_count: int | None
    last_run_at: datetime | None
    created_at: datetime


class ReportRunResponse(BaseModel):
    id: int
    report_id: int
    report_name: str | None
    status: str
    fmt: str | None
    row_count: int | None
    duration_ms: float | None
    recipients: str | None
    delivered: bool
    trigger: str | None
    error: str | None
    created_at: datetime
