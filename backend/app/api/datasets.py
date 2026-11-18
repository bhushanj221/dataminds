import json
from datetime import datetime
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.queries import assert_read_only, _json_safe
from app.api.sources import _connector_for, _get_owned_source
from app.core.permissions import (
    CREATE_CONTENT, require_capability, require_owner_or_admin, workspace_user_ids,
)
from app.database import get_db
from app.models.dataset import Dataset
from app.models.datasource import DataSource
from app.models.user import User
from app.schemas.dataset import (
    ColumnProfile, DatasetCreate, DatasetPreview, DatasetResponse, DatasetUpdate,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

_PREVIEW_LIMIT = 200      # rows returned to the grid
_PROFILE_LIMIT = 2000     # rows scanned for column stats


def _f(v: Any) -> float | None:
    try:
        f = float(v)
        return f if f == f else None  # drop NaN
    except (TypeError, ValueError):
        return None


def _profile(columns: list[str], rows: list[list[Any]]) -> list[ColumnProfile]:
    """Per-column stats from a sample: type, null %, distinct count, and
    min/max/mean for numeric columns or sample values for the rest."""
    out: list[ColumnProfile] = []
    if not columns:
        return out
    df = pd.DataFrame(rows, columns=columns)
    n = len(df)
    for c in columns:
        s = df[c]
        nulls = int(s.isna().sum())
        p = ColumnProfile(
            column=c,
            nulls_pct=round(100 * nulls / n, 1) if n else 0.0,
            distinct=int(s.nunique(dropna=True)),
        )
        num = pd.to_numeric(s, errors="coerce")
        non_null = max(1, n - nulls)
        if n and num.notna().sum() >= 0.8 * non_null:
            p.kind = "num"
            p.min, p.max, p.mean = _f(num.min()), _f(num.max()), _f(num.mean())
            if p.mean is not None:
                p.mean = round(p.mean, 2)
        else:
            vals = s.dropna().astype(str)
            p.kind = "time" if bool(vals.head(10).str.match(r"^\d{4}[-/]\d{2}").all()) and len(vals) else "cat"
            p.sample = vals.head(3).tolist()
        out.append(p)
    return out


async def _run_sql(source, sql: str, limit: int) -> tuple[list[str], list[list[Any]], int]:
    assert_read_only(sql)
    connector = _connector_for(source)
    result = await run_in_threadpool(connector.execute, sql, limit)
    rows = [[_json_safe(v) for v in row] for row in result["rows"]]
    return result["columns"], rows, result["row_count"]


async def _preview(source, sql: str) -> DatasetPreview:
    columns, rows, row_count = await _run_sql(source, sql, _PROFILE_LIMIT)
    profile = await run_in_threadpool(_profile, columns, rows)
    return DatasetPreview(columns=columns, rows=rows[:_PREVIEW_LIMIT],
                          row_count=row_count, profile=profile)


# ── Preview (ad-hoc, before saving) ────────────────────────────
class PreviewRequest(BaseModel):
    source_id: int
    sql: str


@router.post("/preview", response_model=DatasetPreview)
async def preview_dataset(
    body: PreviewRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    source = await _get_owned_source(body.source_id, user, db)
    try:
        return await _preview(source, body.sql)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {str(e)[:250]}")


# ── CRUD ───────────────────────────────────────────────────────
def _to_response(d: Dataset) -> DatasetResponse:
    return DatasetResponse(
        id=d.id, name=d.name, description=d.description or "",
        source_id=d.source_id, sql=d.sql, config=json.loads(d.config or "{}"),
        certified=bool(d.certified), created_at=d.created_at, updated_at=d.updated_at,
    )


async def _get_owned_dataset(dataset_id: int, user: User, db: AsyncSession) -> Dataset:
    result = await db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id.in_(workspace_user_ids(user)))
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


@router.post("", response_model=DatasetResponse, status_code=201)
async def create_dataset(
    body: DatasetCreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)
):
    src = await db.execute(
        select(DataSource).where(DataSource.id == body.source_id, DataSource.owner_id.in_(workspace_user_ids(user)))
    )
    if not src.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Data source not found")
    assert_read_only(body.sql)

    ds = Dataset(
        name=body.name, description=body.description or "", source_id=body.source_id,
        sql=body.sql, config=json.dumps(body.config), certified=body.certified, owner_id=user.id,
    )
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    return _to_response(ds)


@router.get("", response_model=list[DatasetResponse])
async def list_datasets(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Dataset).where(Dataset.owner_id.in_(workspace_user_ids(user))).order_by(Dataset.updated_at.desc())
    )
    return [_to_response(d) for d in result.scalars().all()]


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _to_response(await _get_owned_dataset(dataset_id, user, db))


@router.put("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: int, body: DatasetUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    ds = await _get_owned_dataset(dataset_id, user, db)
    require_owner_or_admin(ds, user)
    updates = body.model_dump(exclude_unset=True)
    if "config" in updates:
        ds.config = json.dumps(updates.pop("config") or {})
    if updates.get("sql"):
        assert_read_only(updates["sql"])
    for field, value in updates.items():
        setattr(ds, field, value)
    ds.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(ds)
    return _to_response(ds)


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ds = await _get_owned_dataset(dataset_id, user, db)
    require_owner_or_admin(ds, user)
    await db.delete(ds)
    await db.commit()


@router.get("/{dataset_id}/preview", response_model=DatasetPreview)
async def preview_saved_dataset(
    dataset_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    ds = await _get_owned_dataset(dataset_id, user, db)
    source = await _get_owned_source(ds.source_id, user, db)
    try:
        return await _preview(source, ds.sql)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {str(e)[:250]}")
