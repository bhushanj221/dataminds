import re
from datetime import date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.sources import _connector_for, _get_owned_source
from app.database import get_db
from app.models.query import QueryHistory
from app.models.user import User
from app.schemas.query import HistoryItem, QueryRequest, QueryResult

router = APIRouter(prefix="/api", tags=["queries"])

# Read-only guard: BI queries must not mutate user databases.
READ_ONLY_STARTERS = ("select", "with", "show", "describe", "desc", "explain", "pragma", "values")


def _strip_comments(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    return sql.strip()


def assert_read_only(sql: str) -> None:
    cleaned = _strip_comments(sql).lower()
    if not cleaned.startswith(READ_ONLY_STARTERS):
        raise HTTPException(
            status_code=400,
            detail="Only read queries are allowed (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN)",
        )
    # block multiple statements smuggling a write after a read
    statements = [s for s in cleaned.split(";") if s.strip()]
    if len(statements) > 1:
        raise HTTPException(status_code=400, detail="Run one statement at a time")


def _json_safe(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace")
    return str(value)


@router.post("/sources/{source_id}/query", response_model=QueryResult)
async def run_query(
    source_id: int,
    body: QueryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    source = await _get_owned_source(source_id, user, db)
    assert_read_only(body.sql)

    history = QueryHistory(
        user_id=user.id, source_id=source.id, source_name=source.name, sql=body.sql, status="error"
    )
    try:
        connector = _connector_for(source)
        result = await run_in_threadpool(connector.execute, body.sql, body.limit)
        rows = [[_json_safe(v) for v in row] for row in result["rows"]]

        history.status = "success"
        history.row_count = result["row_count"]
        history.duration_ms = result["duration_ms"]
        source.status = "connected"
        source.last_used_at = datetime.utcnow()
        db.add(history)
        await db.commit()

        return QueryResult(
            columns=result["columns"], rows=rows, row_count=result["row_count"],
            duration_ms=result["duration_ms"], truncated=result["row_count"] >= body.limit,
        )
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).split("\n")[0][:500]
        history.error = msg
        db.add(history)
        await db.commit()
        raise HTTPException(status_code=400, detail=msg)


@router.get("/queries/history", response_model=list[HistoryItem])
async def query_history(
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(QueryHistory)
        .where(QueryHistory.user_id == user.id)
        .order_by(QueryHistory.created_at.desc())
        .limit(min(limit, 200))
    )
    return [HistoryItem.model_validate(h) for h in result.scalars().all()]
