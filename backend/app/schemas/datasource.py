from datetime import datetime

from pydantic import BaseModel, field_validator

from app.connectors import ALL_TYPES


class ConnectionConfig(BaseModel):
    """Connection details — shared by test and create requests."""
    type: str
    host: str | None = None
    port: int | None = None
    database: str
    username: str | None = None
    password: str | None = None
    options: dict[str, str] = {}

    @field_validator("type")
    @classmethod
    def type_supported(cls, v: str) -> str:
        if v not in ALL_TYPES:
            raise ValueError(f"Unsupported type '{v}'. Supported: {', '.join(sorted(ALL_TYPES))}")
        return v


class DataSourceCreate(ConnectionConfig):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class DataSourceUpdate(BaseModel):
    name: str | None = None
    host: str | None = None
    port: int | None = None
    database: str | None = None
    username: str | None = None
    password: str | None = None  # only re-encrypted if provided
    options: dict[str, str] | None = None


class DataSourceResponse(BaseModel):
    id: int
    name: str
    type: str
    host: str | None
    port: int | None
    database: str
    username: str | None
    status: str
    created_at: datetime
    last_used_at: datetime | None

    model_config = {"from_attributes": True}


class TestResult(BaseModel):
    success: bool
    latency_ms: float | None = None
    message: str


class GSheetCreate(BaseModel):
    name: str
    url: str

    @field_validator("name", "url")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Cannot be empty")
        return v.strip()


class RestApiCreate(BaseModel):
    name: str
    url: str
    auth_type: str = "none"  # none | bearer | api_key | basic
    auth_token: str | None = None      # bearer
    header_name: str | None = None     # api_key
    header_value: str | None = None    # api_key
    username: str | None = None        # basic
    password: str | None = None        # basic
    json_path: str | None = None       # dotted path to the array, e.g. "data.items"

    @field_validator("auth_type")
    @classmethod
    def auth_type_valid(cls, v: str) -> str:
        if v not in ("none", "bearer", "api_key", "basic"):
            raise ValueError("auth_type must be one of: none, bearer, api_key, basic")
        return v


class IngestResult(BaseModel):
    source: "DataSourceResponse"
    table: str
    row_count: int
    column_count: int


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool
    primary_key: bool = False
    references: str | None = None  # "ref_table.ref_col" if this column is a foreign key


class Relationship(BaseModel):
    columns: list[str]
    ref_table: str
    ref_columns: list[str] = []
    ref_schema: str | None = None


class TableInfo(BaseModel):
    name: str
    schema_name: str | None = None
    columns: list[ColumnInfo]
    foreign_keys: list[Relationship] = []


class SchemaResponse(BaseModel):
    source_id: int
    tables: list[TableInfo]


class RowCountResponse(BaseModel):
    row_count: int
