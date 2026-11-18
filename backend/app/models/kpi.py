from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.database import Base


class KPI(Base):
    """A single business metric tracked over time.

    `sql` must return a scalar — we take the first numeric value of the first row.
    Thresholds define green/yellow/red bands; their interpretation depends on
    `direction` (higher_is_better vs lower_is_better)."""
    __tablename__ = "kpis"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    source_name = Column(String(255), nullable=True)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    sql = Column(Text, nullable=False)

    target_value = Column(Float, nullable=True)
    direction = Column(String(10), nullable=False, default="higher")   # higher | lower
    unit = Column(String(12), nullable=False, default="number")        # number | currency | percent
    # green/yellow band edges (red is the remainder). Meaning flips with direction.
    threshold_green = Column(Float, nullable=True)
    threshold_yellow = Column(Float, nullable=True)

    # cached last evaluation
    last_value = Column(Float, nullable=True)
    prev_value = Column(Float, nullable=True)      # the value before last_value (for % change)
    last_status = Column(String(12), nullable=True)  # green | yellow | red | no_data | error
    last_error = Column(Text, nullable=True)
    last_evaluated_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Alert(Base):
    """A condition watched on a KPI. Evaluated on a schedule (check_frequency)
    or on demand. Fires → writes an AlertEvent + dispatches notifications,
    respecting a cooldown so it won't re-fire repeatedly."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kpi_id = Column(Integer, ForeignKey("kpis.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False)
    alert_type = Column(String(16), nullable=False, default="threshold")  # threshold | pct_change | no_data
    operator = Column(String(4), nullable=True)        # > >= < <= == !=  (threshold)
    threshold_value = Column(Float, nullable=True)     # threshold target
    pct_change = Column(Float, nullable=True)          # % move that trips a pct_change alert

    check_frequency = Column(Integer, nullable=False, default=3600)  # seconds between checks
    cooldown = Column(Integer, nullable=False, default=3600)         # seconds before re-firing

    channels = Column(Text, nullable=False, default='["in_app"]')   # JSON list: in_app|email|teams|webhook
    webhook_url = Column(Text, nullable=True)
    email_to = Column(Text, nullable=True)   # recipient override; falls back to settings/default
    email_subject = Column(Text, nullable=True)  # template; blank = default. Vars: {alert}{kpi}{value}{status}{message}{source}{time}
    email_body = Column(Text, nullable=True)     # template; blank = default

    enabled = Column(Boolean, nullable=False, default=True)

    status = Column(String(12), nullable=False, default="ok")  # ok | triggered | no_data | error
    last_value = Column(Float, nullable=True)
    last_checked_at = Column(DateTime, nullable=True)
    last_triggered_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AlertEvent(Base):
    """One alert firing. Doubles as the in-app notification feed."""
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kpi_id = Column(Integer, ForeignKey("kpis.id", ondelete="SET NULL"), nullable=True)

    alert_name = Column(String(255), nullable=True)
    kpi_name = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    value = Column(Float, nullable=True)
    status = Column(String(12), nullable=False, default="triggered")  # triggered | no_data | error
    channels_sent = Column(Text, nullable=True)  # JSON list of channels that received it

    read = Column(Boolean, nullable=False, default=False)
    acknowledged = Column(Boolean, nullable=False, default=False)
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_comment = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
