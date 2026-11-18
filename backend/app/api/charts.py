import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.core.permissions import CREATE_CONTENT, require_capability, require_owner_or_admin, workspace_user_ids
from app.api.queries import assert_read_only, _json_safe
from app.api.sources import _connector_for, _get_owned_source
from app.database import get_db
from app.models.chart import Chart
from app.models.datasource import DataSource
from app.models.user import User
from app.schemas.chart import ChartCreate, ChartResponse, ChartUpdate
from app.schemas.dashboard import FilterField
from app.services.charting import (
    apply_filters, build_figure, config_for_type, distinct_values, suggest_charts,
    _column_kinds, ALL_CHART_TYPES, SWITCHABLE_TYPES,
)
from app.services import query_cache
from app.services.sql_variables import substitute as substitute_variables, VariableError

router = APIRouter(prefix="/api/charts", tags=["charts"])


class PreviewRequest(BaseModel):
    source_id: int
    sql: str
    chart_type: str
    config: dict[str, Any] = {}


class FigureResponse(BaseModel):
    figure: dict[str, Any]
    columns: list[str]
    rows: list[list[Any]] = []
    row_count: int
    chart_type: str = ""
    config: dict[str, Any] = {}


_RENDER_LIMIT = 5000


async def _query_and_build(source_id: int, sql: str, chart_type: str,
                           config: dict, user: User, db: AsyncSession,
                           filters: list[dict[str, Any]] | None = None,
                           palette: str | None = None, theme: str | None = None,
                           use_cache: bool = False, bypass_read: bool = False,
                           variables: list[dict[str, Any]] | None = None,
                           var_values: dict[str, Any] | None = None) -> FigureResponse:
    source = await _get_owned_source(source_id, user, db)
    # Substitute {{ variables }} with safe, validated literals BEFORE the read-only
    # check and the cache key — so values can't inject SQL and each value set
    # caches separately.
    if variables:
        try:
            sql = substitute_variables(sql, variables, var_values)
        except VariableError as e:
            raise HTTPException(status_code=400, detail=str(e))
    assert_read_only(sql)

    # Shared result cache: only on the saved-chart render path (dashboards), never
    # for interactive preview. One entry per (source, SQL) serves every viewer and
    # every filter/theme variation — filtering + figure building happen below.
    # bypass_read=True (a manual "refresh now") re-executes for fresh data but still
    # refreshes the cache so other viewers benefit.
    cached = None
    cache_key = query_cache.make_key(source_id, sql, _RENDER_LIMIT) if use_cache else ""
    if use_cache and not bypass_read:
        cached = await query_cache.get(db, cache_key)

    if cached is not None:
        columns, all_rows, row_count = cached["columns"], cached["rows"], cached["row_count"]
    else:
        connector = _connector_for(source)
        # Surface SQL execution errors (bad column, syntax, broken table) as a
        # readable 400 — never an opaque 500 that the frontend can't parse.
        try:
            result = await run_in_threadpool(connector.execute, sql, _RENDER_LIMIT)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Query failed: {str(e)[:300]}")
        columns = result["columns"]
        all_rows = [[_json_safe(v) for v in row] for row in result["rows"]]
        row_count = result["row_count"]
        if use_cache:
            await query_cache.set(db, cache_key, source_id, columns, all_rows, row_count)

    # dashboard cross-filters: drop rows that don't match (no-op for charts
    # lacking the filtered column)
    rows = apply_filters(columns, all_rows, filters)
    # auto-derive a field mapping when none was given (e.g. user just switched type)
    if not config:
        config = config_for_type(chart_type, columns, rows)
    try:
        figure = await run_in_threadpool(
            build_figure, chart_type, config, columns, rows, palette, theme)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)[:300])
    except (KeyError, IndexError) as e:
        raise HTTPException(status_code=400, detail=f"Missing or invalid field mapping: {e}")
    except Exception as e:
        # never let a figure builder 500 the API — surface a readable message
        raise HTTPException(status_code=400, detail=f"Could not build chart: {str(e)[:250]}")
    return FigureResponse(
        figure=figure, columns=columns, rows=rows,
        row_count=row_count, chart_type=chart_type, config=config,
    )


@router.get("/types")
async def chart_types():
    return {"types": ALL_CHART_TYPES, "switchable": SWITCHABLE_TYPES}


@router.post("/preview", response_model=FigureResponse)
async def preview_chart(
    body: PreviewRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await _query_and_build(body.source_id, body.sql, body.chart_type, body.config, user, db)


class SuggestRequest(BaseModel):
    source_id: int
    sql: str


class Suggestion(BaseModel):
    chart_type: str
    config: dict[str, Any]
    label: str
    reason: str
    figure: dict[str, Any]


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]
    columns: list[str]
    row_count: int


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_visualizations(
    body: SuggestRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Run the query once and return several chart suggestions, each pre-rendered
    so the builder can show a mini preview the user clicks to apply."""
    source = await _get_owned_source(body.source_id, user, db)
    assert_read_only(body.sql)
    connector = _connector_for(source)
    try:
        result = await run_in_threadpool(connector.execute, body.sql, 2000)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {str(e)[:300]}")
    rows = [[_json_safe(v) for v in row] for row in result["rows"]]

    out: list[Suggestion] = []
    for s in suggest_charts(result["columns"], rows):
        try:
            fig = await run_in_threadpool(build_figure, s["chart_type"], dict(s["config"]), result["columns"], rows)
        except Exception:
            continue
        out.append(Suggestion(chart_type=s["chart_type"], config=s["config"],
                              label=s["label"], reason=s["reason"], figure=fig))
    return SuggestResponse(suggestions=out, columns=result["columns"], row_count=result["row_count"])


def _to_response(chart: Chart) -> ChartResponse:
    return ChartResponse(
        id=chart.id, name=chart.name, chart_type=chart.chart_type,
        source_id=chart.source_id, sql=chart.sql,
        config=json.loads(chart.config or "{}"),
        created_at=chart.created_at, updated_at=chart.updated_at,
    )


async def _get_owned_chart(chart_id: int, user: User, db: AsyncSession) -> Chart:
    result = await db.execute(select(Chart).where(Chart.id == chart_id, Chart.owner_id.in_(workspace_user_ids(user))))
    chart = result.scalar_one_or_none()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return chart


@router.post("", response_model=ChartResponse, status_code=201)
async def create_chart(
    body: ChartCreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)
):
    src = await db.execute(
        select(DataSource).where(DataSource.id == body.source_id, DataSource.owner_id.in_(workspace_user_ids(user)))
    )
    if not src.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Data source not found")

    chart = Chart(
        name=body.name, chart_type=body.chart_type, source_id=body.source_id,
        sql=body.sql, config=json.dumps(body.config), owner_id=user.id,
    )
    db.add(chart)
    await db.commit()
    await db.refresh(chart)
    return _to_response(chart)


@router.get("", response_model=list[ChartResponse])
async def list_charts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Chart).where(Chart.owner_id.in_(workspace_user_ids(user))).order_by(Chart.updated_at.desc())
    )
    return [_to_response(c) for c in result.scalars().all()]


@router.get("/{chart_id}", response_model=ChartResponse)
async def get_chart(
    chart_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return _to_response(await _get_owned_chart(chart_id, user, db))


@router.put("/{chart_id}", response_model=ChartResponse)
async def update_chart(
    chart_id: int, body: ChartUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    chart = await _get_owned_chart(chart_id, user, db)
    require_owner_or_admin(chart, user)
    updates = body.model_dump(exclude_unset=True)
    if "config" in updates:
        chart.config = json.dumps(updates.pop("config") or {})
    for field, value in updates.items():
        setattr(chart, field, value)
    chart.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(chart)
    return _to_response(chart)


@router.delete("/{chart_id}", status_code=204)
async def delete_chart(
    chart_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    chart = await _get_owned_chart(chart_id, user, db)
    require_owner_or_admin(chart, user)
    await db.delete(chart)
    await db.commit()


@router.get("/{chart_id}/render", response_model=FigureResponse)
async def render_chart(
    chart_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    chart = await _get_owned_chart(chart_id, user, db)
    return await _query_and_build(
        chart.source_id, chart.sql, chart.chart_type,
        json.loads(chart.config or "{}"), user, db, use_cache=True,
    )


class RenderRequest(BaseModel):
    filters: list[dict[str, Any]] = []   # [{"column": str, "values": [str]}]
    palette: str | None = None           # named palette for chart colours
    theme: str | None = None             # "light" | "dark"


@router.post("/{chart_id}/render", response_model=FigureResponse)
async def render_chart_themed(
    chart_id: int, body: RenderRequest,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Render a saved chart with dashboard cross-filters + colour theme applied."""
    chart = await _get_owned_chart(chart_id, user, db)
    return await _query_and_build(
        chart.source_id, chart.sql, chart.chart_type,
        json.loads(chart.config or "{}"), user, db,
        filters=body.filters, palette=body.palette, theme=body.theme, use_cache=True,
    )


@router.get("/{chart_id}/fields", response_model=list[FilterField])
async def chart_fields(
    chart_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Low-cardinality columns in this chart's own result — for per-chart filters."""
    chart = await _get_owned_chart(chart_id, user, db)
    source = await _get_owned_source(chart.source_id, user, db)
    assert_read_only(chart.sql)
    connector = _connector_for(source)
    try:
        result = await run_in_threadpool(connector.execute, chart.sql, 2000)
    except Exception:
        return []
    rows = [[_json_safe(v) for v in row] for row in result["rows"]]
    ks = _column_kinds(result["columns"], rows)
    dv = distinct_values(result["columns"], rows)
    return [FilterField(column=col, values=dv.get(col, [])[:100], kind=ks[j], charts=1)
            for j, col in enumerate(result["columns"])]
