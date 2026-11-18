from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.core.permissions import ROLES


class UserAdminResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    ai_daily_limit: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str = "analyst"

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()

    @field_validator("password")
    @classmethod
    def pw_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    ai_daily_limit: int | None = None      # per-user override of the daily AI cap
    clear_ai_limit: bool = False           # set True to remove the override (back to workspace default)

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        return v


class RolesResponse(BaseModel):
    roles: list[str]
    matrix: dict[str, list[str]]
