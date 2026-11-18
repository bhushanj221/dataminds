from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool = True
    created_at: datetime
    capabilities: list[str] = []
    workspace_id: int | None = None
    workspace_name: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_user(cls, user, workspace_name: str | None = None) -> "UserResponse":
        from app.core.permissions import capabilities_for
        return cls(
            id=user.id, email=user.email, full_name=user.full_name, role=user.role,
            is_active=user.is_active, created_at=user.created_at,
            capabilities=sorted(capabilities_for(user.role)),
            workspace_id=user.workspace_id, workspace_name=workspace_name,
        )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
