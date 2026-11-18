import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
import app.models  # noqa: F401 — registers all models with Base.metadata
from app.api.auth import router as auth_router
from app.api.sources import router as sources_router
from app.api.queries import router as queries_router
from app.api.charts import router as charts_router
from app.api.datasets import router as datasets_router
from app.api.dashboards import router as dashboards_router
from app.api.folders import router as folders_router
from app.api.stats import router as stats_router
from app.api.ai import router as ai_router
from app.api.semantic import router as semantic_router
from app.api.kpi import router as kpi_router, run_due_checks
from app.api.reports import router as reports_router, run_due_reports
from app.api.lineage import router as lineage_router
from app.api.users import router as users_router
from app.api.search import router as search_router
from app.api.chat import router as chat_router

logger = logging.getLogger("datamind.alerts")

# How often the poller wakes to look for due alert checks / report runs (seconds).
ALERT_POLL_INTERVAL = 30


async def _alert_loop():
    """In-process scheduler: periodically evaluate due alerts and run due
    reports. Each alert/report carries its own interval, enforced inside the
    respective run_due_* function."""
    while True:
        try:
            fired = await run_due_checks()
            if fired:
                logger.info("alert poller fired %d alert(s)", fired)
        except Exception as e:  # never let the loop die
            logger.warning("alert poller error: %s", e)
        try:
            sent = await run_due_reports()
            if sent:
                logger.info("report poller delivered %d report(s)", sent)
        except Exception as e:
            logger.warning("report poller error: %s", e)
        try:
            await _purge_query_cache()
        except Exception as e:
            logger.warning("query cache purge error: %s", e)
        await asyncio.sleep(ALERT_POLL_INTERVAL)


async def _purge_query_cache():
    """Evict expired + over-cap query-cache entries (off the request path)."""
    from app.database import AsyncSessionLocal
    from app.services.query_cache import purge
    async with AsyncSessionLocal() as db:
        await purge(db)


async def _backfill_workspaces():
    """Give every legacy user (no workspace) their own workspace as admin.
    Idempotent — only touches rows with workspace_id IS NULL."""
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.models.workspace import Workspace
    async with AsyncSessionLocal() as db:
        legacy = (await db.execute(select(User).where(User.workspace_id.is_(None)))).scalars().all()
        for u in legacy:
            ws = Workspace(name=f"{u.full_name}'s Workspace")
            db.add(ws)
            await db.flush()
            u.workspace_id = ws.id
            u.role = "admin"  # founding (and only) member of their own workspace
        if legacy:
            await db.commit()
            logger.info("backfilled %d legacy user(s) into their own workspace", len(legacy))


@asynccontextmanager
async def lifespan(app: FastAPI):
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight column adds for tables that predate a field (no migration tool).
        await conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_to TEXT"))
        await conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_subject TEXT"))
        await conn.execute(text("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_body TEXT"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id)"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_daily_limit INTEGER"))
        await conn.execute(text("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_daily_limit INTEGER"))
        await conn.execute(text("ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER NOT NULL DEFAULT 0"))
        await conn.execute(text("ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS completion_tokens INTEGER NOT NULL DEFAULT 0"))
        await conn.execute(text("ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0"))
        await conn.execute(text("ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS config TEXT NOT NULL DEFAULT '{}'"))
        await conn.execute(text("ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS folder_id INTEGER"))
        await conn.execute(text("ALTER TABLE dashboard_folders ADD COLUMN IF NOT EXISTS parent_id INTEGER"))
    await _backfill_workspaces()
    task = asyncio.create_task(_alert_loop())
    yield
    task.cancel()
    await engine.dispose()


app = FastAPI(title="DataMind API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(sources_router)
app.include_router(queries_router)
app.include_router(charts_router)
app.include_router(datasets_router)
app.include_router(dashboards_router)
app.include_router(folders_router)
app.include_router(stats_router)
app.include_router(ai_router)
app.include_router(semantic_router)
app.include_router(kpi_router)
app.include_router(reports_router)
app.include_router(lineage_router)
app.include_router(users_router)
app.include_router(search_router)
app.include_router(chat_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "datamind-api"}
