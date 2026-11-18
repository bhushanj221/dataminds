from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text

from app.database import Base


class Report(Base):
    """A scheduled data export: run `sql` against a source, render to a file,
    and email it to recipients on a recurring interval. Mirrors the alert
    poller pattern — each report carries its own frequency, enforced by the
    background loop."""
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False, index=True)
    source_name = Column(String(255), nullable=True)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    sql = Column(Text, nullable=False)
    fmt = Column(String(10), nullable=False, default="csv")   # csv | excel

    recipients = Column(Text, nullable=True)   # comma-separated; blank = settings default / owner
    frequency = Column(Integer, nullable=False, default=86400)  # seconds between runs (0 = manual only)
    enabled = Column(Boolean, nullable=False, default=True)

    # cached last run
    last_status = Column(String(12), nullable=True)   # success | error
    last_error = Column(Text, nullable=True)
    last_row_count = Column(Integer, nullable=True)
    last_run_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ReportRun(Base):
    """One execution of a report — the delivery log."""
    __tablename__ = "report_runs"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    report_name = Column(String(255), nullable=True)

    status = Column(String(12), nullable=False, default="success")  # success | error
    fmt = Column(String(10), nullable=True)
    row_count = Column(Integer, nullable=True)
    duration_ms = Column(Float, nullable=True)
    recipients = Column(Text, nullable=True)       # who it was emailed to (if any)
    delivered = Column(Boolean, nullable=False, default=False)  # email actually sent
    trigger = Column(String(10), nullable=True)    # manual | schedule
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
