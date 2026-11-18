import json
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.sources import _connector_for, _get_owned_source
from app.core.permissions import CREATE_CONTENT, require_capability, require_owner_or_admin, workspace_user_ids
from app.database import AsyncSessionLocal, get_db
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.datasource import DataSource
from app.models.kpi import KPI, Alert, AlertEvent
from app.models.notification_settings import NotificationSettings
from app.models.user import User
from app.schemas.kpi import (
    AcknowledgeRequest, AlertCreate, AlertEventResponse, AlertResponse, AlertUpdate,
    KPICreate, KPIResponse, KPIUpdate, PreviewRequest,
)
from app.schemas.notification import (
    NotificationSettingsResponse, NotificationSettingsUpdate, TestEmailRequest,
)
from app.services.kpi_eval import evaluate_alert, evaluate_kpi_value, status_for
from app.services.notify import send_email, send_teams
from app.services.text_to_sql import is_read_only

router = APIRouter(prefix="/api", tags=["monitoring"])


def _guard_sql(sql: str) -> None:
    if not is_read_only(sql):
        raise HTTPException(status_code=400, detail="KPI query must be read-only (a single SELECT/WITH).")


# ── serialization helpers ──────────────────────────────────────
def _kpi_response(k: KPI, alert_count: int = 0) -> KPIResponse:
    pct = None
    if k.target_value not in (None, 0) and k.last_value is not None:
        pct = k.last_value / k.target_value * 100.0
    return KPIResponse(
        id=k.id, source_id=k.source_id, source_name=k.source_name, name=k.name,
        description=k.description, sql=k.sql, target_value=k.target_value,
        direction=k.direction, unit=k.unit, threshold_green=k.threshold_green,
        threshold_yellow=k.threshold_yellow, last_value=k.last_value, prev_value=k.prev_value,
        last_status=k.last_status, last_error=k.last_error, last_evaluated_at=k.last_evaluated_at,
        pct_to_target=pct, alert_count=alert_count, created_at=k.created_at,
    )


def _alert_response(a: Alert, kpi_name: str | None = None) -> AlertResponse:
    return AlertResponse(
        id=a.id, kpi_id=a.kpi_id, kpi_name=kpi_name, name=a.name, alert_type=a.alert_type,
        operator=a.operator, threshold_value=a.threshold_value, pct_change=a.pct_change,
        check_frequency=a.check_frequency, cooldown=a.cooldown,
        channels=json.loads(a.channels or '["in_app"]'), webhook_url=a.webhook_url,
        email_to=a.email_to, email_subject=a.email_subject, email_body=a.email_body,
        enabled=a.enabled, status=a.status, last_value=a.last_value,
        last_checked_at=a.last_checked_at, last_triggered_at=a.last_triggered_at,
        created_at=a.created_at,
    )


def _event_response(e: AlertEvent) -> AlertEventResponse:
    return AlertEventResponse(
        id=e.id, alert_id=e.alert_id, kpi_id=e.kpi_id, alert_name=e.alert_name,
        kpi_name=e.kpi_name, message=e.message, value=e.value, status=e.status,
        read=e.read, acknowledged=e.acknowledged, acknowledged_at=e.acknowledged_at,
        acknowledged_comment=e.acknowledged_comment, created_at=e.created_at,
    )


async def _get_owned_kpi(kpi_id: int, user: User, db: AsyncSession) -> KPI:
    res = await db.execute(select(KPI).where(KPI.id == kpi_id, KPI.owner_id.in_(workspace_user_ids(user))))
    kpi = res.scalar_one_or_none()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found")
    return kpi


async def _get_owned_alert(alert_id: int, user: User, db: AsyncSession) -> Alert:
    res = await db.execute(select(Alert).where(Alert.id == alert_id, Alert.owner_id.in_(workspace_user_ids(user))))
    alert = res.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


# ════════════════════════ KPIs ════════════════════════════════
@router.post("/kpis", response_model=KPIResponse, status_code=201)
async def create_kpi(body: KPICreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)):
    _guard_sql(body.sql)
    source = await _get_owned_source(body.source_id, user, db)
    kpi = KPI(
        owner_id=user.id, source_id=source.id, source_name=source.name,
        name=body.name, description=body.description, sql=body.sql,
        target_value=body.target_value, direction=body.direction, unit=body.unit,
        threshold_green=body.threshold_green, threshold_yellow=body.threshold_yellow,
    )
    db.add(kpi)
    await db.commit()
    await db.refresh(kpi)
    # evaluate immediately so the card shows a value right away
    await _evaluate_kpi(kpi, source, db)
    await db.commit()
    await db.refresh(kpi)
    return _kpi_response(kpi)


@router.get("/kpis", response_model=list[KPIResponse])
async def list_kpis(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(KPI).where(KPI.owner_id.in_(workspace_user_ids(user))).order_by(KPI.created_at.desc()))
    kpis = res.scalars().all()
    counts = dict(
        (await db.execute(
            select(Alert.kpi_id, func.count(Alert.id)).where(Alert.owner_id.in_(workspace_user_ids(user))).group_by(Alert.kpi_id)
        )).all()
    )
    return [_kpi_response(k, counts.get(k.id, 0)) for k in kpis]


@router.get("/kpis/{kpi_id}", response_model=KPIResponse)
async def get_kpi(kpi_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _kpi_response(await _get_owned_kpi(kpi_id, user, db))


@router.put("/kpis/{kpi_id}", response_model=KPIResponse)
async def update_kpi(kpi_id: int, body: KPIUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kpi = await _get_owned_kpi(kpi_id, user, db)
    require_owner_or_admin(kpi, user)
    if body.sql is not None:
        _guard_sql(body.sql)
    for field in ("name", "sql", "description", "target_value", "direction", "unit",
                  "threshold_green", "threshold_yellow"):
        val = getattr(body, field)
        if val is not None:
            setattr(kpi, field, val)
    kpi.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(kpi)
    return _kpi_response(kpi)


@router.delete("/kpis/{kpi_id}", status_code=204)
async def delete_kpi(kpi_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kpi = await _get_owned_kpi(kpi_id, user, db)
    require_owner_or_admin(kpi, user)
    await db.delete(kpi)
    await db.commit()


@router.post("/kpis/{kpi_id}/evaluate", response_model=KPIResponse)
async def evaluate_kpi_now(kpi_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kpi = await _get_owned_kpi(kpi_id, user, db)
    source = await _get_owned_source(kpi.source_id, user, db)
    await _evaluate_kpi(kpi, source, db)
    await db.commit()
    await db.refresh(kpi)
    return _kpi_response(kpi)


@router.post("/kpis/preview")
async def preview_kpi(body: PreviewRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Test a KPI's SQL before saving — returns the scalar value it resolves to."""
    _guard_sql(body.sql)
    source = await _get_owned_source(body.source_id, user, db)
    connector = _connector_for(source)
    try:
        value = await run_in_threadpool(evaluate_kpi_value, connector, body.sql)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {str(e).splitlines()[0][:250]}")
    if value is None:
        return {"value": None, "ok": True, "note": "Query ran but returned no numeric value (0 rows or non-numeric)."}
    return {"value": value, "ok": True, "note": None}


# ── shared evaluation (used by endpoints + background poller) ──
async def _evaluate_kpi(kpi: KPI, source: DataSource, db: AsyncSession) -> None:
    """Run the KPI query, update its cached value/status. Mutates kpi (caller commits)."""
    connector = _connector_for(source)
    try:
        value = await run_in_threadpool(evaluate_kpi_value, connector, kpi.sql)
        kpi.prev_value = kpi.last_value
        kpi.last_value = value
        kpi.last_status = status_for(value, kpi.direction, kpi.threshold_green, kpi.threshold_yellow)
        kpi.last_error = None
    except Exception as e:
        kpi.last_status = "error"
        kpi.last_error = str(e).splitlines()[0][:250]
    kpi.last_evaluated_at = datetime.utcnow()


# ════════════════════════ Alerts ══════════════════════════════
@router.post("/alerts", response_model=AlertResponse, status_code=201)
async def create_alert(body: AlertCreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)):
    kpi = await _get_owned_kpi(body.kpi_id, user, db)
    alert = Alert(
        owner_id=user.id, kpi_id=kpi.id, name=body.name, alert_type=body.alert_type,
        operator=body.operator, threshold_value=body.threshold_value, pct_change=body.pct_change,
        check_frequency=body.check_frequency, cooldown=body.cooldown,
        channels=json.dumps(body.channels or ["in_app"]), webhook_url=body.webhook_url,
        email_to=body.email_to, email_subject=body.email_subject, email_body=body.email_body,
        enabled=body.enabled,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return _alert_response(alert, kpi.name)


@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Alert).where(Alert.owner_id.in_(workspace_user_ids(user))).order_by(Alert.created_at.desc()))
    alerts = res.scalars().all()
    names = dict((await db.execute(select(KPI.id, KPI.name).where(KPI.owner_id.in_(workspace_user_ids(user))))).all())
    return [_alert_response(a, names.get(a.kpi_id)) for a in alerts]


@router.put("/alerts/{alert_id}", response_model=AlertResponse)
async def update_alert(alert_id: int, body: AlertUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = await _get_owned_alert(alert_id, user, db)
    require_owner_or_admin(alert, user)
    for field in ("name", "alert_type", "operator", "threshold_value", "pct_change",
                  "check_frequency", "cooldown", "webhook_url", "email_to",
                  "email_subject", "email_body", "enabled"):
        val = getattr(body, field)
        if val is not None:
            setattr(alert, field, val)
    if body.channels is not None:
        alert.channels = json.dumps(body.channels)
    await db.commit()
    await db.refresh(alert)
    return _alert_response(alert)


@router.delete("/alerts/{alert_id}", status_code=204)
async def delete_alert(alert_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = await _get_owned_alert(alert_id, user, db)
    require_owner_or_admin(alert, user)
    await db.delete(alert)
    await db.commit()


@router.post("/alerts/{alert_id}/check", response_model=AlertResponse)
async def check_alert_now(alert_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    alert = await _get_owned_alert(alert_id, user, db)
    kpi = await _get_owned_kpi(alert.kpi_id, user, db)
    source = await _get_owned_source(kpi.source_id, user, db)
    await _check_alert(alert, kpi, source, db, force=True)
    await db.commit()
    await db.refresh(alert)
    return _alert_response(alert, kpi.name)


# ── core alert check + dispatch (shared with poller) ──
async def _check_alert(alert: Alert, kpi: KPI, source: DataSource, db: AsyncSession, force: bool = False) -> bool:
    """Evaluate an alert; if it fires (and cooldown allows), write an event + notify.
    Returns True if an event was created. Caller commits."""
    await _evaluate_kpi(kpi, source, db)
    value = kpi.last_value
    alert.last_value = value
    alert.last_checked_at = datetime.utcnow()

    fired, status, message = evaluate_alert(alert, value, kpi.prev_value)
    if not fired:
        alert.status = "ok"
        return False

    alert.status = status
    # cooldown: don't re-fire within the window (unless forced from the UI)
    if not force and alert.last_triggered_at:
        elapsed = (datetime.utcnow() - alert.last_triggered_at).total_seconds()
        if elapsed < alert.cooldown:
            return False

    alert.last_triggered_at = datetime.utcnow()
    channels = json.loads(alert.channels or '["in_app"]')
    ns = (await db.execute(
        select(NotificationSettings).where(NotificationSettings.owner_id == alert.owner_id)
    )).scalar_one_or_none()
    owner = (await db.execute(select(User).where(User.id == alert.owner_id))).scalar_one_or_none()
    sent = await _dispatch(alert, kpi, message, value, status, channels, ns, owner)

    db.add(AlertEvent(
        alert_id=alert.id, owner_id=alert.owner_id, kpi_id=kpi.id,
        alert_name=alert.name, kpi_name=kpi.name, message=message, value=value,
        status=status, channels_sent=json.dumps(sent),
    ))
    return True


async def _dispatch(alert: Alert, kpi: KPI, message: str, value, status,
                    channels: list[str], ns: "NotificationSettings | None", owner: "User | None") -> list[str]:
    """Send the alert out across its channels. in_app is implicit (the AlertEvent
    IS the in-app notification). All external sends are best-effort — a delivery
    failure must never lose the in-app record. Returns channels delivered."""
    sent = []
    if "in_app" in channels:
        sent.append("in_app")

    if "webhook" in channels and alert.webhook_url:
        payload = {
            "event": "alert.triggered", "alert": alert.name, "kpi": kpi.name,
            "status": status, "value": value, "message": message,
            "triggered_at": datetime.utcnow().isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                await client.post(alert.webhook_url, json=payload)
            sent.append("webhook")
        except Exception:
            pass

    if "teams" in channels and ns and ns.teams_webhook_url:
        try:
            await run_in_threadpool(
                send_teams, ns.teams_webhook_url,
                title=f"🔔 {alert.name} — {kpi.name}", text=message,
            )
            sent.append("teams")
        except Exception:
            pass

    if "email" in channels and ns and ns.smtp_host and ns.smtp_from:
        recipients = _recipients(alert, ns, owner)
        if recipients:
            try:
                pw = decrypt_secret(ns.smtp_encrypted_password) if ns.smtp_encrypted_password else None
                subject, mailbody = _render_email(alert, kpi, message, value, status)
                await run_in_threadpool(
                    send_email, host=ns.smtp_host, port=ns.smtp_port or 587,
                    username=ns.smtp_username, password=pw, from_addr=ns.smtp_from,
                    to_addrs=recipients, use_tls=ns.smtp_use_tls,
                    subject=subject, body=mailbody,
                )
                sent.append("email")
            except Exception:
                pass
    return sent


# Default email templates — used when an alert leaves subject/body blank.
DEFAULT_EMAIL_SUBJECT = "[DataMind Alert] {alert}"
DEFAULT_EMAIL_BODY = (
    "Alert: {alert}\nKPI: {kpi} ({source})\nStatus: {status}\nCurrent value: {value}\n\n"
    "{message}\n\n— DataMind Monitoring"
)


def _render_email(alert: Alert, kpi: KPI, message: str, value, status: str) -> tuple[str, str]:
    """Render an alert's subject/body templates with runtime values.
    Blank templates fall back to the defaults. Substitution is literal {var}
    replacement (no str.format) so stray braces in user text never error."""
    ctx = {
        "alert": alert.name or "", "kpi": kpi.name or "", "source": kpi.source_name or "",
        "value": "—" if value is None else str(value), "status": status,
        "message": message, "time": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
    subject_tpl = (alert.email_subject or "").strip() or DEFAULT_EMAIL_SUBJECT
    body_tpl = (alert.email_body or "").strip() or DEFAULT_EMAIL_BODY
    return _interpolate(subject_tpl, ctx), _interpolate(body_tpl, ctx)


def _interpolate(template: str, ctx: dict[str, str]) -> str:
    for key, val in ctx.items():
        template = template.replace("{" + key + "}", str(val))
    return template


def _recipients(alert: Alert, ns: "NotificationSettings | None", owner: "User | None") -> list[str]:
    """Resolve email recipients: per-alert override → settings default → owner's own email."""
    raw = alert.email_to or (ns.default_email_to if ns else None) or (owner.email if owner else None)
    if not raw:
        return []
    return [e.strip() for e in raw.replace(";", ",").split(",") if e.strip()]


# ════════════════════ Notifications / events ══════════════════
@router.get("/notifications", response_model=list[AlertEventResponse])
async def list_notifications(
    unread_only: bool = False, limit: int = 50,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    q = select(AlertEvent).where(AlertEvent.owner_id == user.id)
    if unread_only:
        q = q.where(AlertEvent.read == False)  # noqa: E712
    q = q.order_by(AlertEvent.created_at.desc()).limit(min(limit, 200))
    res = await db.execute(q)
    return [_event_response(e) for e in res.scalars().all()]


@router.get("/notifications/unread-count")
async def unread_count(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(func.count(AlertEvent.id)).where(AlertEvent.owner_id == user.id, AlertEvent.read == False)  # noqa: E712
    )
    return {"count": res.scalar() or 0}


@router.post("/notifications/read-all")
async def mark_all_read(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import update
    await db.execute(
        update(AlertEvent).where(AlertEvent.owner_id == user.id, AlertEvent.read == False)  # noqa: E712
        .values(read=True)
    )
    await db.commit()
    return {"status": "ok"}


@router.post("/notifications/{event_id}/acknowledge", response_model=AlertEventResponse)
async def acknowledge_event(event_id: int, body: AcknowledgeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AlertEvent).where(AlertEvent.id == event_id, AlertEvent.owner_id == user.id))
    event = res.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Notification not found")
    event.acknowledged = True
    event.read = True
    event.acknowledged_at = datetime.utcnow()
    event.acknowledged_comment = body.comment
    await db.commit()
    await db.refresh(event)
    return _event_response(event)


# ════════════════════ Notification settings (SMTP / Teams) ════
def _ns_response(ns: NotificationSettings | None) -> NotificationSettingsResponse:
    if ns is None:
        return NotificationSettingsResponse(
            smtp_host=None, smtp_port=587, smtp_username=None, smtp_from=None,
            smtp_use_tls=True, default_email_to=None, has_smtp_password=False,
            smtp_configured=False, teams_webhook_url=None, teams_configured=False,
        )
    return NotificationSettingsResponse(
        smtp_host=ns.smtp_host, smtp_port=ns.smtp_port, smtp_username=ns.smtp_username,
        smtp_from=ns.smtp_from, smtp_use_tls=ns.smtp_use_tls, default_email_to=ns.default_email_to,
        has_smtp_password=bool(ns.smtp_encrypted_password),
        smtp_configured=bool(ns.smtp_host and ns.smtp_from),
        teams_webhook_url=ns.teams_webhook_url, teams_configured=bool(ns.teams_webhook_url),
    )


async def _get_ns(user: User, db: AsyncSession) -> NotificationSettings | None:
    res = await db.execute(select(NotificationSettings).where(NotificationSettings.owner_id == user.id))
    return res.scalar_one_or_none()


@router.get("/notification-settings", response_model=NotificationSettingsResponse)
async def get_notification_settings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return _ns_response(await _get_ns(user, db))


@router.put("/notification-settings", response_model=NotificationSettingsResponse)
async def update_notification_settings(
    body: NotificationSettingsUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    ns = await _get_ns(user, db)
    if ns is None:
        ns = NotificationSettings(owner_id=user.id)
        db.add(ns)
    for field in ("smtp_host", "smtp_port", "smtp_username", "smtp_from",
                  "smtp_use_tls", "default_email_to", "teams_webhook_url"):
        val = getattr(body, field)
        if val is not None:
            setattr(ns, field, val)
    if body.smtp_password is not None:
        ns.smtp_encrypted_password = encrypt_secret(body.smtp_password) if body.smtp_password else None
    await db.commit()
    await db.refresh(ns)
    return _ns_response(ns)


@router.post("/notification-settings/test-email")
async def test_email(body: TestEmailRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ns = await _get_ns(user, db)
    if not ns or not ns.smtp_host or not ns.smtp_from:
        raise HTTPException(status_code=400, detail="Configure SMTP host and From address first.")
    to = body.to or ns.default_email_to or user.email
    recipients = [e.strip() for e in to.replace(";", ",").split(",") if e.strip()]
    if not recipients:
        raise HTTPException(status_code=400, detail="No recipient to send the test to.")
    pw = decrypt_secret(ns.smtp_encrypted_password) if ns.smtp_encrypted_password else None
    try:
        await run_in_threadpool(
            send_email, host=ns.smtp_host, port=ns.smtp_port or 587,
            username=ns.smtp_username, password=pw, from_addr=ns.smtp_from,
            to_addrs=recipients, use_tls=ns.smtp_use_tls,
            subject="[DataMind] Test email",
            body="This is a test email from DataMind Monitoring. Your SMTP settings work. ✅",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Send failed: {str(e).splitlines()[0][:250]}")
    return {"status": "sent", "to": recipients}


# ════════════════════ Background poller ═══════════════════════
async def run_due_checks() -> int:
    """Evaluate all enabled alerts whose check interval has elapsed.
    Runs in its own DB session (called by the lifespan loop). Returns # fired."""
    fired = 0
    async with AsyncSessionLocal() as db:
        now = datetime.utcnow()
        res = await db.execute(select(Alert).where(Alert.enabled == True))  # noqa: E712
        alerts = res.scalars().all()
        for alert in alerts:
            if alert.last_checked_at:
                elapsed = (now - alert.last_checked_at).total_seconds()
                if elapsed < alert.check_frequency:
                    continue
            kpi = (await db.execute(select(KPI).where(KPI.id == alert.kpi_id))).scalar_one_or_none()
            if not kpi:
                continue
            source = (await db.execute(select(DataSource).where(DataSource.id == kpi.source_id))).scalar_one_or_none()
            if not source:
                continue
            try:
                if await _check_alert(alert, kpi, source, db):
                    fired += 1
                await db.commit()
            except Exception:
                await db.rollback()
    return fired
