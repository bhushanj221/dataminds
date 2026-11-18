import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.queries import assert_read_only, _json_safe
from app.api.sources import _connector_for, _get_owned_source
from app.core.permissions import CREATE_CONTENT, is_workspace_admin, require_capability, workspace_user_ids
from app.database import get_db
from app.models.chart import Chart
from app.models.dashboard import Dashboard
from app.models.dashboard_share import DashboardShare
from app.models.user import User
from app.schemas.dashboard import (
    DashboardCreate, DashboardResponse, DashboardUpdate, FilterField,
    MemberOption, ShareResponse, ShareSet,
)
from app.services.charting import distinct_values, _column_kinds

from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


# ── access resolution ──────────────────────────────────────────
async def _owner_in_workspace(d: Dashboard, user: User, db: AsyncSession) -> bool:
    r = await db.execute(select(User.id).where(User.id == d.owner_id, User.workspace_id == user.workspace_id))
    return r.scalar_one_or_none() is not None


async def _share_for(d_id: int, user_id: int, db: AsyncSession) -> DashboardShare | None:
    r = await db.execute(
        select(DashboardShare).where(DashboardShare.dashboard_id == d_id, DashboardShare.user_id == user_id)
    )
    return r.scalar_one_or_none()


async def _access(d: Dashboard, user: User, db: AsyncSession) -> str | None:
    """Return the user's access level to a dashboard: owner|admin|edit|view, or None."""
    if d.owner_id == user.id:
        return "owner"
    if is_workspace_admin(user) and await _owner_in_workspace(d, user, db):
        return "admin"
    share = await _share_for(d.id, user.id, db)
    if share:
        return share.permission  # edit | view
    return None


async def _get_visible(dashboard_id: int, user: User, db: AsyncSession, *, need_edit: bool = False) -> tuple[Dashboard, str]:
    d = (await db.execute(select(Dashboard).where(Dashboard.id == dashboard_id))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    access = await _access(d, user, db)
    if access is None:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    if need_edit and access not in ("owner", "admin", "edit"):
        raise HTTPException(status_code=403, detail="You have view-only access to this dashboard.")
    return d, access


async def _require_can_share(d: Dashboard, user: User, db: AsyncSession) -> None:
    """Only the owner or a workspace admin may manage a dashboard's shares."""
    access = await _access(d, user, db)
    if access not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only the dashboard's owner or a workspace admin can manage sharing.")


async def _to_response(d: Dashboard, user: User, db: AsyncSession, access: str | None = None) -> DashboardResponse:
    access = access or await _access(d, user, db) or "view"
    owner = (await db.execute(select(User).where(User.id == d.owner_id))).scalar_one_or_none()
    share_count = (await db.execute(
        select(DashboardShare.id).where(DashboardShare.dashboard_id == d.id)
    )).scalars().all()
    return DashboardResponse(
        id=d.id, name=d.name, layout=json.loads(d.layout or "[]"),
        config=json.loads(getattr(d, "config", None) or "{}"),
        folder_id=getattr(d, "folder_id", None),
        created_at=d.created_at, updated_at=d.updated_at,
        access=access, can_edit=access in ("owner", "admin", "edit"), is_owner=access == "owner",
        owner_name=owner.full_name if owner else None, share_count=len(share_count),
    )


# ── CRUD ───────────────────────────────────────────────────────
@router.post("", response_model=DashboardResponse, status_code=201)
async def create_dashboard(
    body: DashboardCreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)
):
    dashboard = Dashboard(
        name=body.name, layout=json.dumps([w.model_dump() for w in body.layout]), owner_id=user.id,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return await _to_response(dashboard, user, db, access="owner")


@router.get("", response_model=list[DashboardResponse])
async def list_dashboards(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    shared_ids = select(DashboardShare.dashboard_id).where(DashboardShare.user_id == user.id).scalar_subquery()
    conds = [Dashboard.owner_id == user.id, Dashboard.id.in_(shared_ids)]
    if is_workspace_admin(user):
        conds.append(Dashboard.owner_id.in_(workspace_user_ids(user)))  # admins see the whole workspace
    result = await db.execute(select(Dashboard).where(or_(*conds)).order_by(Dashboard.updated_at.desc()))
    dashboards = result.scalars().all()
    return [await _to_response(d, user, db) for d in dashboards]


@router.get("/shareable-users", response_model=list[MemberOption])
async def shareable_users(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Workspace members the current user can share a dashboard with (excludes self)."""
    res = await db.execute(
        select(User).where(User.workspace_id == user.workspace_id, User.id != user.id, User.is_active == True)  # noqa: E712
        .order_by(User.full_name)
    )
    return [MemberOption(id=u.id, full_name=u.full_name, email=u.email, role=u.role) for u in res.scalars().all()]


@router.get("/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(dashboard_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    d, access = await _get_visible(dashboard_id, user, db)
    return await _to_response(d, user, db, access)


@router.get("/{dashboard_id}/fields", response_model=list[FilterField])
async def filter_fields(dashboard_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Discover low-cardinality columns across the board's charts so the user can
    build dropdown filters from real data (Power BI–style field list)."""
    d, _ = await _get_visible(dashboard_id, user, db)
    widgets = json.loads(d.layout or "[]")
    chart_ids = {w["chart_id"] for w in widgets if isinstance(w, dict) and "chart_id" in w}

    merged: dict[str, set[str]] = {}        # low-cardinality distinct values
    kinds: dict[str, str] = {}              # cat | num | time
    chart_count: dict[str, set[int]] = {}
    for cid in chart_ids:
        chart = (await db.execute(
            select(Chart).where(Chart.id == cid, Chart.owner_id.in_(workspace_user_ids(user)))
        )).scalar_one_or_none()
        if not chart:
            continue
        try:
            source = await _get_owned_source(chart.source_id, user, db)
            assert_read_only(chart.sql)
            connector = _connector_for(source)
            result = await run_in_threadpool(connector.execute, chart.sql, 2000)
        except Exception:
            continue  # a broken chart shouldn't break filter discovery
        rows = [[_json_safe(v) for v in row] for row in result["rows"]]
        ks = _column_kinds(result["columns"], rows)
        dv = distinct_values(result["columns"], rows)
        for j, col in enumerate(result["columns"]):
            chart_count.setdefault(col, set()).add(cid)
            kinds.setdefault(col, ks[j])
            if col in dv:
                merged.setdefault(col, set()).update(dv[col])

    # every column is filterable (operators handle high-cardinality / numeric / dates);
    # distinct values are included only when low-cardinality (for the multi-select)
    fields = [
        FilterField(column=col, values=sorted(merged.get(col, set()))[:100],
                    kind=kinds.get(col, "cat"), charts=len(cset))
        for col, cset in chart_count.items()
    ]
    fields.sort(key=lambda f: (-f.charts, f.column))
    return fields


# ── Batch render: all panels in one request (faster dashboard load) ──
class BoardRenderRequest(BaseModel):
    filters: list[dict[str, Any]] = []   # board-level filters
    palette: str | None = None
    theme: str | None = None
    fresh: bool = False                  # True = "refresh now" → bypass cache read
    variables: dict[str, Any] = {}       # current {{ variable }} values


def _has_value(f: dict) -> bool:
    return any(v not in (None, "") for v in (f.get("values") or []))


def _merge_board_widget_filters(board: list[dict], widget: list[dict] | None) -> list[dict]:
    """Same column → the widget's filter wins; value-less filters dropped.
    Full filter dicts (column, op, values) are passed through so operators apply."""
    by_col: dict[str, dict] = {}
    for f in board:
        if _has_value(f):
            by_col[f["column"]] = f
    for f in (widget or []):
        if _has_value(f):
            by_col[f["column"]] = f
    return list(by_col.values())


@router.post("/{dashboard_id}/render")
async def render_board(
    dashboard_id: int, body: BoardRenderRequest,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    """Render every panel of a dashboard in ONE call (figures only, no raw rows),
    panels rendered in parallel. Reuses the shared query cache; collapses N panel
    requests into one round-trip — the main dashboard-load speedup."""
    import asyncio
    from app.api.charts import _get_owned_chart, _query_and_build  # local import avoids cycle
    from app.database import AsyncSessionLocal

    d, _ = await _get_visible(dashboard_id, user, db)
    widgets = [w for w in json.loads(d.layout or "[]") if isinstance(w, dict) and "chart_id" in w]
    var_defs = (json.loads(d.config or "{}") or {}).get("variables") or []

    sem = asyncio.Semaphore(8)   # cap concurrent source queries so we don't flood a DB

    async def render_one(w: dict) -> dict:
        async with sem:
            async with AsyncSessionLocal() as wdb:   # own session per panel → safe concurrency
                try:
                    chart = await _get_owned_chart(w["chart_id"], user, wdb)
                    merged = _merge_board_widget_filters(body.filters, w.get("filters"))
                    fr = await _query_and_build(
                        chart.source_id, chart.sql, chart.chart_type,
                        json.loads(chart.config or "{}"), user, wdb,
                        filters=merged, palette=body.palette, theme=body.theme,
                        use_cache=True, bypass_read=body.fresh,
                        variables=var_defs, var_values=body.variables,
                    )
                    return {"i": w["i"], "chart_id": w["chart_id"], "figure": fr.figure, "error": None}
                except HTTPException as e:
                    return {"i": w["i"], "chart_id": w["chart_id"], "figure": None, "error": str(e.detail)[:200]}
                except Exception as e:
                    return {"i": w["i"], "chart_id": w["chart_id"], "figure": None, "error": str(e)[:200]}

    out = await asyncio.gather(*[render_one(w) for w in widgets])
    return {"widgets": list(out)}


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
    dashboard_id: int, body: DashboardUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    d, access = await _get_visible(dashboard_id, user, db, need_edit=True)
    if body.name is not None:
        d.name = body.name
    if body.layout is not None:
        d.layout = json.dumps([w.model_dump() for w in body.layout])
    if body.config is not None:
        d.config = json.dumps(body.config)
    if "folder_id" in body.model_fields_set:   # explicit (incl. null = move to root)
        d.folder_id = body.folder_id
    d.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(d)
    return await _to_response(d, user, db, access)


@router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(dashboard_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    d, access = await _get_visible(dashboard_id, user, db)
    if access not in ("owner", "admin"):  # editors can change content but not delete
        raise HTTPException(status_code=403, detail="Only the owner or a workspace admin can delete this dashboard.")
    await db.delete(d)
    await db.commit()


# ── sharing (§14.1) ────────────────────────────────────────────
@router.get("/{dashboard_id}/shares", response_model=list[ShareResponse])
async def list_shares(dashboard_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    d, _ = await _get_visible(dashboard_id, user, db)
    await _require_can_share(d, user, db)
    rows = (await db.execute(
        select(DashboardShare, User).join(User, User.id == DashboardShare.user_id)
        .where(DashboardShare.dashboard_id == dashboard_id)
    )).all()
    return [ShareResponse(user_id=u.id, full_name=u.full_name, email=u.email, permission=s.permission) for s, u in rows]


@router.put("/{dashboard_id}/shares", response_model=ShareResponse)
async def set_share(
    dashboard_id: int, body: ShareSet,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    d, _ = await _get_visible(dashboard_id, user, db)
    await _require_can_share(d, user, db)
    # target must be a member of the same workspace, not the owner
    target = (await db.execute(
        select(User).where(User.id == body.user_id, User.workspace_id == user.workspace_id)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found in this workspace.")
    if target.id == d.owner_id:
        raise HTTPException(status_code=400, detail="The owner already has full access.")
    share = await _share_for(dashboard_id, target.id, db)
    if share:
        share.permission = body.permission
    else:
        share = DashboardShare(dashboard_id=dashboard_id, user_id=target.id, permission=body.permission)
        db.add(share)
    await db.commit()
    return ShareResponse(user_id=target.id, full_name=target.full_name, email=target.email, permission=body.permission)


@router.delete("/{dashboard_id}/shares/{user_id}", status_code=204)
async def remove_share(dashboard_id: int, user_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    d, _ = await _get_visible(dashboard_id, user, db)
    await _require_can_share(d, user, db)
    await db.execute(
        delete(DashboardShare).where(DashboardShare.dashboard_id == dashboard_id, DashboardShare.user_id == user_id)
    )
    await db.commit()
