from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class GlossaryTerm(BaseModel):
    term: str
    definition: str


class SemanticDocUpdate(BaseModel):
    tables: dict[str, str] = {}
    columns: dict[str, str] = {}
    glossary: list[GlossaryTerm] = []


class MetricCreate(BaseModel):
    name: str
    description: str | None = None
    table_name: str
    expression: str

    @field_validator("name", "table_name", "expression")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Cannot be empty")
        return v.strip()


class MetricResponse(BaseModel):
    id: int
    name: str
    description: str | None
    table_name: str
    expression: str
    verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SemanticResponse(BaseModel):
    source_id: int
    tables: dict[str, str]
    columns: dict[str, str]
    glossary: list[GlossaryTerm]
    metrics: list[MetricResponse]


class BootstrapResponse(BaseModel):
    """AI-suggested documentation — returned for review, NOT auto-saved."""
    tables: dict[str, str]
    columns: dict[str, str]
    glossary: list[dict[str, Any]]
    metrics: list[dict[str, Any]]  # {name, description, table, expression}
