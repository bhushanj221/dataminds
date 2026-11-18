"""Global search (§21.1) — one query across every shareable asset in the
workspace: sources, charts, dashboards, KPIs, reports, and semantic metrics.
Results are workspace-scoped (you only find what your workspace can see)."""
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.permissions import workspace_user_ids
from app.database import get_db
from app.models.chart import Chart
from app.models.dashboard import Dashboard
from app.models.datasource import DataSource
from app.models.kpi import KPI
from app.models.report import Report
from app.models.semantic import Metric
from app.models.user import User

router = APIRouter(prefix="/api/search", tags=["search"])

# type → frontend route (the page that lists/opens this asset kind)
HREF = {
    "source": "/dashboard/sources",
    "chart": "/dashboard/charts",
    "dashboard": "/dashboard/boards",
    "kpi": "/dashboard/monitor",
    "report": "/dashboard/reports",
    "metric": "/dashboard/semantic",
}


def _result(kind: str, id_: int, name: str, subtitle: str | None) -> dict:
    return {"type": kind, "id": id_, "name": name, "subtitle": subtitle, "href": HREF.get(kind, "/dashboard")}


@router.get("")
async def global_search(q: str, limit: int = 8, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    term = (q or "").strip()
    if len(term) < 2:
        return {"query": term, "results": []}
    like = f"%{term}%"
    members = workspace_user_ids(user)
    per = min(max(limit, 1), 20)
    out: list[dict] = []

    async def run(model, kind, name_col, *extra_cols, subtitle=None):
        conds = [name_col.ilike(like)] + [c.ilike(like) for c in extra_cols]
        rows = (await db.execute(
            select(model).where(model.owner_id.in_(members), or_(*conds)).limit(per)
        )).scalars().all()
        for r in rows:
            out.append(_result(kind, r.id, getattr(r, name_col.key), subtitle(r) if subtitle else None))

    await run(DataSource, "source", DataSource.name, subtitle=lambda r: r.type)
    await run(Chart, "chart", Chart.name, Chart.sql, subtitle=lambda r: r.chart_type)
    await run(Dashboard, "dashboard", Dashboard.name)
    await run(KPI, "kpi", KPI.name, KPI.description, KPI.sql, subtitle=lambda r: r.source_name)
    await run(Report, "report", Report.name, Report.description, Report.sql, subtitle=lambda r: r.source_name)
    await run(Metric, "metric", Metric.name, Metric.description, Metric.expression, subtitle=lambda r: r.table_name)

    # exact/prefix name matches first, then the rest
    tl = term.lower()
    out.sort(key=lambda r: (not r["name"].lower().startswith(tl), r["name"].lower()))
    return {"query": term, "results": out}
