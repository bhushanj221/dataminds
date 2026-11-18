import json
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.sources import _connector_for, _get_owned_source
from app.core.permissions import workspace_user_ids
from app.database import get_db
from app.models.chart import Chart
from app.models.dashboard import Dashboard
from app.models.datasource import DataSource
from app.models.kpi import KPI, Alert
from app.models.report import Report
from app.models.user import User
from app.services import lineage

router = APIRouter(prefix="/api/lineage", tags=["lineage"])

# ── schema cache (per source, for column lineage qualification) ──
_schema_cache: dict[int, tuple[float, dict]] = {}
_SCHEMA_TTL = 600


async def _sqlglot_schema(source, db) -> dict:
    """Build {table: {column: type}} for a source, cached. Best-effort —
    column lineage degrades gracefully when the schema can't be read."""
    cached = _schema_cache.get(source.id)
    if cached and time.time() - cached[0] < _SCHEMA_TTL:
        return cached[1]
    schema: dict = {}
    try:
        connector = _connector_for(source)
        tables = await run_in_threadpool(connector.get_schema)
        for t in tables:
            schema[t["name"]] = {c["name"]: (c.get("type") or "TEXT") for c in t.get("columns", [])}
    except Exception:
        schema = {}
    _schema_cache[source.id] = (time.time(), schema)
    return schema


async def _build_for_user(user: User, db: AsyncSession) -> dict:
    members = workspace_user_ids(user)  # whole-workspace lineage
    sources = [{"id": s.id, "name": s.name, "type": s.type} for s in (
        await db.execute(select(DataSource).where(DataSource.owner_id.in_(members)))).scalars()]
    charts = [{"id": c.id, "name": c.name, "source_id": c.source_id, "sql": c.sql} for c in (
        await db.execute(select(Chart).where(Chart.owner_id.in_(members)))).scalars()]
    kpis = [{"id": k.id, "name": k.name, "source_id": k.source_id, "sql": k.sql} for k in (
        await db.execute(select(KPI).where(KPI.owner_id.in_(members)))).scalars()]
    reports = [{"id": r.id, "name": r.name, "source_id": r.source_id, "sql": r.sql} for r in (
        await db.execute(select(Report).where(Report.owner_id.in_(members)))).scalars()]
    alerts = [{"id": a.id, "name": a.name, "kpi_id": a.kpi_id} for a in (
        await db.execute(select(Alert).where(Alert.owner_id.in_(members)))).scalars()]

    dashboards = []
    for d in (await db.execute(select(Dashboard).where(Dashboard.owner_id.in_(members)))).scalars():
        try:
            layout = json.loads(d.layout or "[]")
            chart_ids = [w["chart_id"] for w in layout if isinstance(w, dict) and w.get("chart_id")]
        except Exception:
            chart_ids = []
        dashboards.append({"id": d.id, "name": d.name, "chart_ids": chart_ids})

    return lineage.build_graph(sources, charts, kpis, reports, dashboards, alerts)


@router.get("/graph")
async def get_graph(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _build_for_user(user, db)


@router.get("/impact")
async def get_impact(node: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    graph = await _build_for_user(user, db)
    return lineage.impact(node, graph)


# ── resolve a SQL-bearing node id (chart:N / kpi:N / report:N) → asset ──
_MODELS = {"chart": Chart, "kpi": KPI, "report": Report}


@router.get("/columns")
async def get_column_lineage(node: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Column-level lineage for one SQL asset: each output column → the source
    table.columns feeding it (traced through CTEs/subqueries via sqlglot)."""
    try:
        ntype, nid = node.split(":", 1)
        model = _MODELS[ntype]
        asset_id = int(nid)
    except (ValueError, KeyError):
        raise HTTPException(status_code=400, detail="Column lineage is only available for chart, kpi, or report nodes.")

    res = await db.execute(select(model).where(model.id == asset_id, model.owner_id.in_(workspace_user_ids(user))))
    asset = res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    source = await _get_owned_source(asset.source_id, user, db)
    schema = await _sqlglot_schema(source, db)
    result = await run_in_threadpool(lineage.column_lineage, asset.sql, source.type, schema)
    result["asset"] = {"id": asset.id, "type": ntype, "name": asset.name, "source_name": source.name}
    return result
