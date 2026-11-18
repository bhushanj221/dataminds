import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.ai import _resolve_llm, _samples_for
from app.api.auth import get_current_user
from app.api.sources import _connector_for, _get_owned_source
from app.core.permissions import workspace_user_ids
from app.database import get_db
from app.models.semantic import Metric, SemanticDoc
from app.models.user import User
from app.schemas.semantic import (
    BootstrapResponse, MetricCreate, MetricResponse,
    SemanticDocUpdate, SemanticResponse,
)
from app.services import semantic as sem

router = APIRouter(prefix="/api/semantic", tags=["semantic"])


async def _get_doc(source_id: int, user: User, db: AsyncSession) -> SemanticDoc | None:
    result = await db.execute(
        select(SemanticDoc).where(SemanticDoc.source_id == source_id, SemanticDoc.owner_id.in_(workspace_user_ids(user)))
    )
    return result.scalar_one_or_none()


async def _metrics(source_id: int, user: User, db: AsyncSession) -> list[Metric]:
    result = await db.execute(
        select(Metric).where(Metric.source_id == source_id, Metric.owner_id.in_(workspace_user_ids(user))).order_by(Metric.name)
    )
    return list(result.scalars().all())


@router.get("/{source_id}", response_model=SemanticResponse)
async def get_semantic(source_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_owned_source(source_id, user, db)
    doc_row = await _get_doc(source_id, user, db)
    doc = json.loads(doc_row.doc) if doc_row else {}
    metrics = await _metrics(source_id, user, db)
    return SemanticResponse(
        source_id=source_id,
        tables=doc.get("tables", {}) or {},
        columns=doc.get("columns", {}) or {},
        glossary=doc.get("glossary", []) or [],
        metrics=[MetricResponse.model_validate(m) for m in metrics],
    )


@router.post("/{source_id}/bootstrap", response_model=BootstrapResponse)
async def bootstrap_semantic(source_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    source = await _get_owned_source(source_id, user, db)
    provider, _ = _resolve_llm(user)
    connector = _connector_for(source)
    try:
        tables = await run_in_threadpool(connector.get_schema)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not read schema: {str(e)[:200]}")
    if not tables:
        raise HTTPException(status_code=400, detail="This source has no tables.")
    samples = await _samples_for(source, connector, tables)
    try:
        suggestion = await run_in_threadpool(sem.bootstrap, provider, tables, samples)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI bootstrap failed: {str(e).split(chr(10))[0][:250]}")
    return BootstrapResponse(
        tables=suggestion["tables"], columns=suggestion["columns"],
        glossary=suggestion["glossary"], metrics=suggestion["metrics"],
    )


@router.put("/{source_id}", response_model=SemanticResponse)
async def save_semantic(
    source_id: int, body: SemanticDocUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_owned_source(source_id, user, db)
    payload = {
        "tables": body.tables,
        "columns": body.columns,
        "glossary": [g.model_dump() for g in body.glossary],
    }
    doc_row = await _get_doc(source_id, user, db)
    if doc_row:
        doc_row.doc = json.dumps(payload)
    else:
        db.add(SemanticDoc(source_id=source_id, owner_id=user.id, doc=json.dumps(payload)))
    await db.commit()
    return await get_semantic(source_id, user, db)


# ── Metrics (verified SQL fragments) ───────────────────────────
@router.post("/{source_id}/metrics", response_model=MetricResponse, status_code=201)
async def create_metric(
    source_id: int, body: MetricCreate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    source = await _get_owned_source(source_id, user, db)
    connector = _connector_for(source)
    # verify the expression runs against the live DB before saving
    prep_sql = f"SELECT {body.expression} AS {body.name} FROM {body.table_name} LIMIT 1"
    verified = False
    try:
        await run_in_threadpool(connector.execute, prep_sql, 1)
        verified = True
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Metric did not verify: {str(e).split(chr(10))[0][:200]}")

    metric = Metric(
        source_id=source_id, owner_id=user.id, name=body.name, description=body.description,
        table_name=body.table_name, expression=body.expression, verified=verified,
    )
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    return MetricResponse.model_validate(metric)


@router.delete("/{source_id}/metrics/{metric_id}", status_code=204)
async def delete_metric(
    source_id: int, metric_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Metric).where(Metric.id == metric_id, Metric.source_id == source_id, Metric.owner_id.in_(workspace_user_ids(user)))
    )
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric not found")
    await db.delete(metric)
    await db.commit()
