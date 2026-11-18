import json
import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.connectors import get_connector
from app.core.crypto import encrypt_secret, decrypt_secret
from app.core.permissions import MANAGE_SOURCES, require_capability, require_owner_or_admin, workspace_user_ids
from app.database import get_db
from app.models.datasource import DataSource
from app.models.user import User
from app.schemas.datasource import (
    ConnectionConfig,
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
    GSheetCreate,
    IngestResult,
    RestApiCreate,
    RowCountResponse,
    SchemaResponse,
    TestResult,
)
from app.services import ingest

router = APIRouter(prefix="/api/sources", tags=["data-sources"])


async def _get_owned_source(source_id: int, user: User, db: AsyncSession) -> DataSource:
    result = await db.execute(
        select(DataSource).where(DataSource.id == source_id, DataSource.owner_id.in_(workspace_user_ids(user)))
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    return source


def _connector_for(source: DataSource):
    password = decrypt_secret(source.encrypted_password) if source.encrypted_password else None
    options = json.loads(source.options) if source.options else {}
    return get_connector(
        type=source.type, database=source.database, host=source.host,
        port=source.port, username=source.username, password=password, options=options,
    )


@router.post("/test", response_model=TestResult)
async def test_connection(cfg: ConnectionConfig, _: User = Depends(get_current_user)):
    try:
        connector = get_connector(
            type=cfg.type, database=cfg.database, host=cfg.host,
            port=cfg.port, username=cfg.username, password=cfg.password, options=cfg.options,
        )
        latency = await run_in_threadpool(connector.test)
        return TestResult(success=True, latency_ms=latency, message=f"Connected in {latency} ms")
    except Exception as e:
        return TestResult(success=False, message=str(e).split("\n")[0][:300])


@router.post("", response_model=DataSourceResponse, status_code=201)
async def create_source(
    body: DataSourceCreate,
    user: User = Depends(require_capability(MANAGE_SOURCES)),
    db: AsyncSession = Depends(get_db),
):
    # Verify the connection actually works before saving
    try:
        connector = get_connector(
            type=body.type, database=body.database, host=body.host,
            port=body.port, username=body.username, password=body.password, options=body.options,
        )
        await run_in_threadpool(connector.test)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e).split(chr(10))[0][:300]}")

    source = DataSource(
        name=body.name,
        type=body.type,
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        encrypted_password=encrypt_secret(body.password) if body.password else None,
        options=json.dumps(body.options) if body.options else None,
        status="connected",
        owner_id=user.id,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return DataSourceResponse.model_validate(source)


@router.get("", response_model=list[DataSourceResponse])
async def list_sources(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DataSource).where(DataSource.owner_id.in_(workspace_user_ids(user))).order_by(DataSource.created_at.desc())
    )
    return [DataSourceResponse.model_validate(s) for s in result.scalars().all()]


@router.get("/{source_id}", response_model=DataSourceResponse)
async def get_source(
    source_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    source = await _get_owned_source(source_id, user, db)
    return DataSourceResponse.model_validate(source)


@router.put("/{source_id}", response_model=DataSourceResponse)
async def update_source(
    source_id: int,
    body: DataSourceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    source = await _get_owned_source(source_id, user, db)
    require_owner_or_admin(source, user)
    updates = body.model_dump(exclude_unset=True)
    if "password" in updates:
        pwd = updates.pop("password")
        source.encrypted_password = encrypt_secret(pwd) if pwd else None
    if "options" in updates:
        opts = updates.pop("options")
        source.options = json.dumps(opts) if opts else None
    for field, value in updates.items():
        setattr(source, field, value)
    await db.commit()
    await db.refresh(source)
    return DataSourceResponse.model_validate(source)


@router.delete("/{source_id}", status_code=204)
async def delete_source(
    source_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    source = await _get_owned_source(source_id, user, db)
    require_owner_or_admin(source, user)
    # Ingested sources own their DuckDB file — remove it with the source
    if source.type in ("file", "gsheets", "restapi") and source.database.startswith(ingest.UPLOAD_DIR):
        try:
            os.remove(source.database)
        except OSError:
            pass
    await db.delete(source)
    await db.commit()


# ── Ingested sources: file upload / Google Sheets / REST API ──

def _ingested_source(name: str, type_: str, result: dict, opts: dict, user: User) -> DataSource:
    return DataSource(
        name=name, type=type_, database=result["db_path"],
        options=json.dumps(opts), status="connected", owner_id=user.id,
    )


@router.post("/upload", response_model=IngestResult, status_code=201)
async def upload_file(
    name: str = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    try:
        result = await run_in_threadpool(ingest.ingest_file, file.filename or "upload.csv", content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:300])

    opts = {"kind": "file", "format": result["format"], "table": result["table"],
            "original_filename": file.filename}
    source = _ingested_source(name.strip(), "file", result, opts, user)
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return IngestResult(source=DataSourceResponse.model_validate(source),
                        table=result["table"], row_count=result["row_count"],
                        column_count=result["column_count"])


@router.post("/gsheets", response_model=IngestResult, status_code=201)
async def add_gsheet(
    body: GSheetCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_in_threadpool(ingest.ingest_gsheet, body.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:300])

    opts = {"kind": "gsheets", "url": body.url, "table": result["table"]}
    source = _ingested_source(body.name, "gsheets", result, opts, user)
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return IngestResult(source=DataSourceResponse.model_validate(source),
                        table=result["table"], row_count=result["row_count"],
                        column_count=result["column_count"])


@router.post("/restapi", response_model=IngestResult, status_code=201)
async def add_restapi(
    body: RestApiCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = body.model_dump(exclude={"name"}, exclude_none=True)
    try:
        result = await run_in_threadpool(ingest.ingest_restapi, cfg)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)[:300])

    # Encrypt secrets before storing the refresh config
    stored = dict(cfg)
    for secret_key in ("auth_token", "header_value", "password"):
        if stored.get(secret_key):
            stored[secret_key + "_enc"] = encrypt_secret(stored.pop(secret_key))
    stored.update({"kind": "restapi", "table": result["table"]})

    source = _ingested_source(body.name, "restapi", result, stored, user)
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return IngestResult(source=DataSourceResponse.model_validate(source),
                        table=result["table"], row_count=result["row_count"],
                        column_count=result["column_count"])


@router.post("/{source_id}/refresh", response_model=TestResult)
async def refresh_source(
    source_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    source = await _get_owned_source(source_id, user, db)
    opts = json.loads(source.options) if source.options else {}
    kind = opts.get("kind")
    if kind not in ("gsheets", "restapi"):
        raise HTTPException(status_code=400, detail="Only Google Sheets and REST API sources can be refreshed")
    try:
        if kind == "gsheets":
            result = await run_in_threadpool(
                ingest.ingest_gsheet, opts["url"], source.database, opts.get("table"))
        else:
            cfg = dict(opts)
            for secret_key in ("auth_token", "header_value", "password"):
                enc = cfg.pop(secret_key + "_enc", None)
                if enc:
                    cfg[secret_key] = decrypt_secret(enc)
            result = await run_in_threadpool(
                ingest.ingest_restapi, cfg, source.database, opts.get("table"))
        source.status = "connected"
        source.last_used_at = datetime.utcnow()
        await db.commit()
        return TestResult(success=True, message=f"Refreshed — {result['row_count']} rows")
    except Exception as e:
        source.status = "error"
        await db.commit()
        return TestResult(success=False, message=str(e)[:300])


@router.get("/{source_id}/schema", response_model=SchemaResponse)
async def get_source_schema(
    source_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    source = await _get_owned_source(source_id, user, db)
    try:
        connector = _connector_for(source)
        tables = await run_in_threadpool(connector.get_schema)
        source.status = "connected"
        source.last_used_at = datetime.utcnow()
        await db.commit()
        return SchemaResponse(source_id=source.id, tables=tables)
    except Exception as e:
        source.status = "error"
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Schema fetch failed: {str(e).split(chr(10))[0][:300]}")


@router.get("/{source_id}/row-count", response_model=RowCountResponse)
async def get_table_row_count(
    source_id: int, table: str, schema: str | None = None,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    source = await _get_owned_source(source_id, user, db)
    connector = _connector_for(source)
    if not hasattr(connector, "count_rows"):
        raise HTTPException(status_code=400, detail="Row count not supported for this source")
    try:
        count = await run_in_threadpool(connector.count_rows, table, schema)
        return RowCountResponse(row_count=count)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Count failed: {str(e).split(chr(10))[0][:200]}")
