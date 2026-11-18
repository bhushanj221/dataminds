from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class WidgetFilter(BaseModel):
    id: str
    column: str
    values: list[str] = []


class Widget(BaseModel):
    i: str               # react-grid-layout item key
    chart_id: int
    x: int = 0
    y: int = 0
    w: int = 6
    h: int = 4
    filters: list[WidgetFilter] = []   # per-chart filters


class DashboardCreate(BaseModel):
    name: str
    layout: list[Widget] = []

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class DashboardUpdate(BaseModel):
    name: str | None = None
    layout: list[Widget] | None = None
    config: dict[str, Any] | None = None    # theme / palette / saved filters
    folder_id: int | None = None            # move into a folder (null = uncategorized)


class FilterField(BaseModel):
    column: str
    values: list[str]          # distinct values (only for low-cardinality columns)
    kind: str = "cat"          # cat | num | time — drives which filter control the UI shows
    charts: int = 1            # how many charts on the board expose this field


class DashboardResponse(BaseModel):
    id: int
    name: str
    layout: list[dict[str, Any]]
    config: dict[str, Any] = {}
    folder_id: int | None = None
    created_at: datetime
    updated_at: datetime
    # access info (relative to the requesting user)
    access: str = "owner"        # owner | admin | edit | view
    can_edit: bool = True
    is_owner: bool = True
    owner_name: str | None = None
    share_count: int = 0

    model_config = {"from_attributes": True}


class ShareSet(BaseModel):
    user_id: int
    permission: str = "view"     # view | edit

    @field_validator("permission")
    @classmethod
    def valid_perm(cls, v: str) -> str:
        if v not in ("view", "edit"):
            raise ValueError("permission must be 'view' or 'edit'")
        return v


class ShareResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    permission: str


class MemberOption(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
