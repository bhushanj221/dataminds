import time
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.queries import _json_safe
from app.api.sources import _connector_for, _get_owned_source
from app.core.crypto import decrypt_secret
from app.core.permissions import CREATE_CONTENT, require_capability, require_owner_or_admin, workspace_user_ids
from app.database import AsyncSessionLocal, get_db
from app.models.datasource import DataSource
from app.models.notification_settings import NotificationSettings
from app.models.report import Report, ReportRun
from app.models.user import User
from app.schemas.report import ReportCreate, ReportResponse, ReportRunResponse, ReportUpdate
from app.services import report_gen
from app.services.notify import send_email
from app.services.text_to_sql import is_read_only

router = APIRouter(prefix="/api/reports", tags=["reports"])

ROW_LIMIT = 50000


def _guard_sql(sql: str) -> None:
    if not is_read_only(sql):
        raise HTTPException(status_code=400, detail="Report query must be read-only (a single SELECT/WITH).")


def _response(r: Report) -> ReportResponse:
    return ReportResponse(
        id=r.id, source_id=r.source_id, source_name=r.source_name, name=r.name,
        description=r.description, sql=r.sql, fmt=r.fmt, recipients=r.recipients,
        frequency=r.frequency, enabled=r.enabled, last_status=r.last_status,
        last_error=r.last_error, last_row_count=r.last_row_count, last_run_at=r.last_run_at,
        created_at=r.created_at,
    )


def _run_response(run: ReportRun) -> ReportRunResponse:
    return ReportRunResponse(
        id=run.id, report_id=run.report_id, report_name=run.report_name, status=run.status,
        fmt=run.fmt, row_count=run.row_count, duration_ms=run.duration_ms,
        recipients=run.recipients, delivered=run.delivered, trigger=run.trigger,
        error=run.error, created_at=run.created_at,
    )


async def _get_owned(report_id: int, user: User, db: AsyncSession) -> Report:
    res = await db.execute(select(Report).where(Report.id == report_id, Report.owner_id.in_(workspace_user_ids(user))))
    r = res.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    return r


def _resolve_recipients(report: Report, ns: NotificationSettings | None, owner: User | None) -> list[str]:
    raw = report.recipients or (ns.default_email_to if ns else None) or (owner.email if owner else None)
    if not raw:
        return []
    return [e.strip() for e in raw.replace(";", ",").split(",") if e.strip()]


# ════════════════════════ CRUD ════════════════════════════════
@router.post("", response_model=ReportResponse, status_code=201)
async def create_report(body: ReportCreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)):
    _guard_sql(body.sql)
    source = await _get_owned_source(body.source_id, user, db)
    report = Report(
        owner_id=user.id, source_id=source.id, source_name=source.name, name=body.name,
        description=body.description, sql=body.sql, fmt=body.fmt, recipients=body.recipients,
        frequency=body.frequency, enabled=body.enabled,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return _response(report)


@router.get("", response_model=list[ReportResponse])
async def list_reports(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Report).where(Report.owner_id.in_(workspace_user_ids(user))).order_by(Report.created_at.desc()))
    return [_response(r) for r in res.scalars().all()]


@router.put("/{report_id}", response_model=ReportResponse)
async def update_report(report_id: int, body: ReportUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await _get_owned(report_id, user, db)
    require_owner_or_admin(report, user)
    if body.sql is not None:
        _guard_sql(body.sql)
    for field in ("name", "sql", "description", "fmt", "recipients", "frequency", "enabled"):
        val = getattr(body, field)
        if val is not None:
            setattr(report, field, val)
    report.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(report)
    return _response(report)


@router.delete("/{report_id}", status_code=204)
async def delete_report(report_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await _get_owned(report_id, user, db)
    require_owner_or_admin(report, user)
    await db.delete(report)
    await db.commit()


# ════════════════════ generate / run / download ═══════════════
async def _execute_report(report: Report, source: DataSource) -> tuple[list[str], list[list], float]:
    connector = _connector_for(source)
    t0 = time.time()
    result = await run_in_threadpool(connector.execute, report.sql, ROW_LIMIT)
    rows = [[_json_safe(v) for v in row] for row in result["rows"]]
    return result["columns"], rows, (time.time() - t0) * 1000


async def _run_and_deliver(report: Report, source: DataSource, db: AsyncSession,
                           trigger: str, deliver: bool) -> ReportRun:
    """Execute the report, optionally email it, and log a ReportRun.
    Updates the report's cached status. Caller commits."""
    run = ReportRun(report_id=report.id, owner_id=report.owner_id, report_name=report.name,
                    fmt=report.fmt, trigger=trigger)
    try:
        columns, rows, duration = await _execute_report(report, source)
        run.row_count = len(rows)
        run.duration_ms = duration
        report.last_row_count = len(rows)
        report.last_status = "success"
        report.last_error = None

        if deliver:
            ns = (await db.execute(
                select(NotificationSettings).where(NotificationSettings.owner_id == report.owner_id)
            )).scalar_one_or_none()
            owner = (await db.execute(select(User).where(User.id == report.owner_id))).scalar_one_or_none()
            recipients = _resolve_recipients(report, ns, owner)
            if recipients and ns and ns.smtp_host and ns.smtp_from:
                content = await run_in_threadpool(report_gen.generate, columns, rows, report.fmt)
                fname = report_gen.filename_for(report.name, report.fmt)
                pw = decrypt_secret(ns.smtp_encrypted_password) if ns.smtp_encrypted_password else None
                await run_in_threadpool(
                    send_email, host=ns.smtp_host, port=ns.smtp_port or 587,
                    username=ns.smtp_username, password=pw, from_addr=ns.smtp_from,
                    to_addrs=recipients, use_tls=ns.smtp_use_tls,
                    subject=f"[DataMind Report] {report.name}",
                    body=(f"Your scheduled report '{report.name}' is attached.\n"
                          f"Rows: {len(rows)} · Format: {report.fmt}\n\n— DataMind Reports"),
                    attachments=[(fname, content, report_gen.mime_subtype(report.fmt))],
                )
                run.recipients = ", ".join(recipients)
                run.delivered = True
        run.status = "success"
    except Exception as e:
        run.status = "error"
        run.error = str(e).splitlines()[0][:300]
        report.last_status = "error"
        report.last_error = run.error
    report.last_run_at = datetime.utcnow()
    db.add(run)
    return run


@router.post("/{report_id}/run", response_model=ReportRunResponse)
async def run_report_now(report_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    report = await _get_owned(report_id, user, db)
    source = await _get_owned_source(report.source_id, user, db)
    run = await _run_and_deliver(report, source, db, trigger="manual", deliver=True)
    await db.commit()
    await db.refresh(run)
    if run.status == "error":
        raise HTTPException(status_code=502, detail=run.error or "Report run failed")
    return _run_response(run)


@router.get("/{report_id}/download")
async def download_report(report_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Generate the report right now and return the file (no email)."""
    report = await _get_owned(report_id, user, db)
    source = await _get_owned_source(report.source_id, user, db)
    try:
        columns, rows, _ = await _execute_report(report, source)
        content = await run_in_threadpool(report_gen.generate, columns, rows, report.fmt)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not generate report: {str(e).splitlines()[0][:200]}")
    # log a manual (non-delivered) run for history
    db.add(ReportRun(report_id=report.id, owner_id=user.id, report_name=report.name,
                     status="success", fmt=report.fmt, row_count=len(rows),
                     trigger="manual", delivered=False))
    report.last_run_at = datetime.utcnow()
    report.last_status = "success"
    report.last_row_count = len(rows)
    await db.commit()

    fname = report_gen.filename_for(report.name, report.fmt)
    media = "text/csv" if report.fmt == "csv" else "application/" + report_gen.mime_subtype(report.fmt)
    return Response(
        content=content, media_type=media,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


@router.get("/{report_id}/runs", response_model=list[ReportRunResponse])
async def report_runs(report_id: int, limit: int = 30, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_owned(report_id, user, db)
    res = await db.execute(
        select(ReportRun).where(ReportRun.report_id == report_id)
        .order_by(ReportRun.created_at.desc()).limit(min(limit, 100))
    )
    return [_run_response(r) for r in res.scalars().all()]


# ════════════════════ Background poller ═══════════════════════
async def run_due_reports() -> int:
    """Run all enabled reports whose interval has elapsed. Own DB session
    (called by the lifespan loop). Returns # delivered."""
    delivered = 0
    async with AsyncSessionLocal() as db:
        now = datetime.utcnow()
        res = await db.execute(select(Report).where(Report.enabled == True))  # noqa: E712
        for report in res.scalars().all():
            if not report.frequency or report.frequency <= 0:
                continue  # manual-only
            if report.last_run_at and (now - report.last_run_at).total_seconds() < report.frequency:
                continue
            source = (await db.execute(select(DataSource).where(DataSource.id == report.source_id))).scalar_one_or_none()
            if not source:
                continue
            try:
                run = await _run_and_deliver(report, source, db, trigger="schedule", deliver=True)
                if run.delivered:
                    delivered += 1
                await db.commit()
            except Exception:
                await db.rollback()
    return delivered
