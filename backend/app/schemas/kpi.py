from datetime import datetime

from pydantic import BaseModel, field_validator

# ── KPI ────────────────────────────────────────────────────────
DIRECTIONS = {"higher", "lower"}
UNITS = {"number", "currency", "percent"}


class KPICreate(BaseModel):
    source_id: int
    name: str
    sql: str
    description: str | None = None
    target_value: float | None = None
    direction: str = "higher"
    unit: str = "number"
    threshold_green: float | None = None
    threshold_yellow: float | None = None

    @field_validator("name", "sql")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("required field cannot be empty")
        return v.strip()

    @field_validator("direction")
    @classmethod
    def valid_direction(cls, v: str) -> str:
        if v not in DIRECTIONS:
            raise ValueError(f"direction must be one of {DIRECTIONS}")
        return v

    @field_validator("unit")
    @classmethod
    def valid_unit(cls, v: str) -> str:
        if v not in UNITS:
            raise ValueError(f"unit must be one of {UNITS}")
        return v


class KPIUpdate(BaseModel):
    name: str | None = None
    sql: str | None = None
    description: str | None = None
    target_value: float | None = None
    direction: str | None = None
    unit: str | None = None
    threshold_green: float | None = None
    threshold_yellow: float | None = None


class KPIResponse(BaseModel):
    id: int
    source_id: int
    source_name: str | None
    name: str
    description: str | None
    sql: str
    target_value: float | None
    direction: str
    unit: str
    threshold_green: float | None
    threshold_yellow: float | None
    last_value: float | None
    prev_value: float | None
    last_status: str | None
    last_error: str | None
    last_evaluated_at: datetime | None
    pct_to_target: float | None = None   # computed: value / target * 100
    alert_count: int = 0
    created_at: datetime


# ── Alert ──────────────────────────────────────────────────────
ALERT_TYPES = {"threshold", "pct_change", "no_data"}
OPERATORS = {">", ">=", "<", "<=", "==", "!="}


class AlertCreate(BaseModel):
    kpi_id: int
    name: str
    alert_type: str = "threshold"
    operator: str | None = ">"
    threshold_value: float | None = None
    pct_change: float | None = None
    check_frequency: int = 3600
    cooldown: int = 3600
    channels: list[str] = ["in_app"]
    webhook_url: str | None = None
    email_to: str | None = None
    email_subject: str | None = None
    email_body: str | None = None
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip()

    @field_validator("channels")
    @classmethod
    def valid_channels(cls, v: list[str]) -> list[str]:
        allowed = {"in_app", "email", "teams", "webhook"}
        bad = [c for c in v if c not in allowed]
        if bad:
            raise ValueError(f"unknown channel(s): {bad}. Allowed: {sorted(allowed)}")
        return v

    @field_validator("alert_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in ALERT_TYPES:
            raise ValueError(f"alert_type must be one of {ALERT_TYPES}")
        return v

    @field_validator("operator")
    @classmethod
    def valid_op(cls, v: str | None) -> str | None:
        if v is not None and v not in OPERATORS:
            raise ValueError(f"operator must be one of {OPERATORS}")
        return v


class AlertUpdate(BaseModel):
    name: str | None = None
    alert_type: str | None = None
    operator: str | None = None
    threshold_value: float | None = None
    pct_change: float | None = None
    check_frequency: int | None = None
    cooldown: int | None = None
    channels: list[str] | None = None
    webhook_url: str | None = None
    email_to: str | None = None
    email_subject: str | None = None
    email_body: str | None = None
    enabled: bool | None = None


class AlertResponse(BaseModel):
    id: int
    kpi_id: int
    kpi_name: str | None = None
    name: str
    alert_type: str
    operator: str | None
    threshold_value: float | None
    pct_change: float | None
    check_frequency: int
    cooldown: int
    channels: list[str]
    webhook_url: str | None
    email_to: str | None
    email_subject: str | None
    email_body: str | None
    enabled: bool
    status: str
    last_value: float | None
    last_checked_at: datetime | None
    last_triggered_at: datetime | None
    created_at: datetime


class AlertEventResponse(BaseModel):
    id: int
    alert_id: int
    kpi_id: int | None
    alert_name: str | None
    kpi_name: str | None
    message: str
    value: float | None
    status: str
    read: bool
    acknowledged: bool
    acknowledged_at: datetime | None
    acknowledged_comment: str | None
    created_at: datetime


class AcknowledgeRequest(BaseModel):
    comment: str | None = None


class PreviewRequest(BaseModel):
    """Test a KPI's SQL before saving — returns the scalar it resolves to."""
    source_id: int
    sql: str
