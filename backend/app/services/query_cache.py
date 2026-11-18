"""Shared query-result cache (Postgres-backed, space-bounded).

Goal: when many users open the same dashboard, serve every panel's data from
one cached entry instead of re-running the SQL per viewer per refresh. Kept
small by: short TTL, a per-entry compressed-size cap, and a max-entry cap the
poller enforces. Read path mutates nothing (no writes on hit) so it scales with
concurrent readers.
"""
import gzip
import hashlib
import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.query_cache import QueryCache

TTL_SECONDS = 60                  # short → dashboards stay fresh; bursts of viewers dedup
MAX_ENTRIES = 1000                # hard cap on cached queries
MAX_PAYLOAD_BYTES = 512 * 1024    # don't cache results whose compressed size exceeds this


def make_key(source_id: int, sql: str, limit: int) -> str:
    return hashlib.sha256(f"{source_id}|{limit}|{sql.strip()}".encode()).hexdigest()


async def get(db: AsyncSession, key: str) -> dict[str, Any] | None:
    """Return cached {columns, rows, row_count} or None. Pure read — never writes.
    Best-effort: any error (DB hiccup, bad payload) → treat as a miss."""
    try:
        row = (await db.execute(
            select(QueryCache).where(QueryCache.cache_key == key)
        )).scalar_one_or_none()
        if not row or row.expires_at < datetime.utcnow():
            return None
        return json.loads(gzip.decompress(row.payload).decode())
    except Exception:
        return None


async def set(db: AsyncSession, key: str, source_id: int,
              columns: list[str], rows: list[list[Any]], row_count: int,
              ttl: int = TTL_SECONDS) -> None:
    """Compress + upsert. Skips oversized payloads to keep the cache small.
    Upsert (ON CONFLICT) makes concurrent misses on the same query race-safe.
    Best-effort: a cache-write failure must NEVER break a render — swallow + rollback."""
    blob = gzip.compress(json.dumps({"columns": columns, "rows": rows, "row_count": row_count}).encode())
    if len(blob) > MAX_PAYLOAD_BYTES:
        return
    now = datetime.utcnow()
    stmt = pg_insert(QueryCache).values(
        cache_key=key, source_id=source_id, payload=blob, row_count=row_count,
        created_at=now, expires_at=now + timedelta(seconds=ttl),
    ).on_conflict_do_update(
        index_elements=["cache_key"],
        set_={"payload": blob, "row_count": row_count, "created_at": now,
              "expires_at": now + timedelta(seconds=ttl)},
    )
    try:
        await db.execute(stmt)
        await db.commit()
    except Exception:
        await db.rollback()


async def purge(db: AsyncSession) -> int:
    """Drop expired entries, then enforce the max-entry cap (oldest first).
    Returns rows removed. Runs off the request path (poller)."""
    now = datetime.utcnow()
    res = await db.execute(delete(QueryCache).where(QueryCache.expires_at < now))
    removed = res.rowcount or 0
    count = (await db.execute(select(func.count(QueryCache.id)))).scalar() or 0
    if count > MAX_ENTRIES:
        overflow = count - MAX_ENTRIES
        old_ids = (await db.execute(
            select(QueryCache.id).order_by(QueryCache.created_at.asc()).limit(overflow)
        )).scalars().all()
        if old_ids:
            r2 = await db.execute(delete(QueryCache).where(QueryCache.id.in_(old_ids)))
            removed += r2.rowcount or 0
    await db.commit()
    return removed
