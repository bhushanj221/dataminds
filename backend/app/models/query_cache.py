from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, String

from app.database import Base


class QueryCache(Base):
    """Shared, space-bounded cache of query results (chart render path).

    One row per (source, SQL, limit) — so every user viewing the same chart /
    dashboard reuses a single entry instead of re-hitting the source DB. The
    payload is gzip-compressed JSON of {columns, rows, row_count}. Bounded by a
    short TTL (`expires_at`) plus a max-entry cap enforced by the poller, and by
    a per-entry size cap (large results are simply not cached). Lives in the app
    DB (cheap disk, no Redis, shared across replicas).

    Cache key is (source_id, SQL, limit). NOTE: if row-level security is added
    later, the RLS predicate must be folded into the key so users don't share a
    filtered result.
    """
    __tablename__ = "query_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String(64), unique=True, nullable=False, index=True)  # sha256 hex
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="CASCADE"), index=True)
    payload = Column(LargeBinary, nullable=False)   # gzip(json({columns, rows, row_count}))
    row_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
