import json
import time
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.auth import get_current_user
from app.api.queries import _json_safe
from app.api.sources import _connector_for, _get_owned_source
from app.config import settings
from app.core.permissions import CREATE_CONTENT, RUN_QUERIES, require_admin, require_capability, workspace_user_ids
from app.core.crypto import encrypt_secret, decrypt_secret
from app.database import get_db
from app.models.ai_usage import AIUsage
from app.models.chart import Chart
from app.models.dashboard import Dashboard
from app.models.fewshot import FewShotExample
from app.models.query import QueryHistory
from app.models.semantic import Metric, SemanticDoc
from app.models.user import User
from app.models.workspace import Workspace
from app.services.llm.pricing import estimate_cost
from app.schemas.ai import AskRequest, AskResponse, AISettingsResponse, AISettingsUpdate
from app.services.charting import build_figure, suggest_chart
from app.services.llm import get_provider, DEFAULT_MODELS, CLASSIFY_MODELS
from app.services.semantic import build_descriptions_block, build_semantic_prompt
from app.services.text_to_sql import run_pipeline, check_ambiguity, build_schema_context, plan_dashboard_questions

router = APIRouter(prefix="/api/ai", tags=["ai"])

# ── Column-value sample cache (per source, in-process, short TTL) ──
_sample_cache: dict[int, tuple[float, dict]] = {}
SAMPLE_TTL = 600  # 10 minutes


async def _samples_for(source, connector, tables) -> dict:
    cached = _sample_cache.get(source.id)
    if cached and time.time() - cached[0] < SAMPLE_TTL:
        return cached[1]
    try:
        samples = await run_in_threadpool(connector.sample_values, tables)
    except Exception:
        samples = {}
    _sample_cache[source.id] = (time.time(), samples)
    return samples


async def _retrieve_examples(db: AsyncSession, user_id: int, source_id: int,
                             question: str, limit: int = 3) -> list[dict]:
    """Find similar past Q→SQL for this source by word overlap, preferring verified."""
    result = await db.execute(
        select(FewShotExample)
        .where(FewShotExample.source_id == source_id)
        .order_by(FewShotExample.verified.desc(), FewShotExample.created_at.desc())
        .limit(60)
    )
    pool = result.scalars().all()
    qwords = set(question.lower().split())
    if not qwords:
        return []
    scored = []
    for ex in pool:
        ewords = set(ex.question.lower().split())
        union = qwords | ewords
        overlap = len(qwords & ewords) / len(union) if union else 0
        score = overlap + (0.15 if ex.verified else 0)
        if score > 0:
            scored.append((score, ex))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{"question": ex.question, "sql": ex.sql} for _, ex in scored[:limit]]


async def _semantic_for(db: AsyncSession, user: User, source_id: int) -> tuple[dict, str]:
    """Returns (descriptions, semantic_prompt_block) for the source.

    Scoped to the WHOLE workspace (not the asking user) so every member shares
    the same 'default' semantic definitions AND produces a byte-identical prompt
    prefix — which is what lets prompt caching be reused across users on a shared
    key. Output is made deterministic (stable doc pick + sorted, de-duped metrics)
    so the cached prefix never drifts between users.
    """
    import json as _json
    ws_ids = workspace_user_ids(user)

    doc_obj = (await db.execute(
        select(SemanticDoc)
        .where(SemanticDoc.source_id == source_id, SemanticDoc.owner_id.in_(ws_ids))
        .order_by(SemanticDoc.id.asc()).limit(1)
    )).scalars().first()
    doc = _json.loads(doc_obj.doc) if doc_obj else {}

    m_rows = (await db.execute(
        select(Metric)
        .where(Metric.source_id == source_id, Metric.owner_id.in_(ws_ids))
        .order_by(Metric.name.asc(), Metric.id.asc())
    )).scalars().all()
    metrics, seen = [], set()
    for m in m_rows:
        key = (m.table_name, m.name)        # de-dupe if two members defined the same metric
        if key in seen:
            continue
        seen.add(key)
        metrics.append({"name": m.name, "table_name": m.table_name, "expression": m.expression,
                        "description": m.description, "verified": m.verified})
    return build_descriptions_block(doc), build_semantic_prompt(doc, metrics)


# ── Resolve which provider/key to use for this user ────────────
def _resolve_llm(user: User) -> tuple[object, bool]:
    """Returns (provider_instance, used_platform_key). Raises 400 if nothing configured."""
    if user.llm_use_own and user.llm_encrypted_key:
        key = decrypt_secret(user.llm_encrypted_key)
        provider = get_provider(
            user.llm_provider or "anthropic", key,
            user.llm_model or None, user.llm_base_url or None,
        )
        return provider, False
    # platform default
    if not settings.LLM_API_KEY and settings.LLM_PROVIDER != "ollama":
        raise HTTPException(
            status_code=400,
            detail="AI is not configured yet. Add an API key in Settings, or ask your admin to set the platform key.",
        )
    provider = get_provider(
        settings.LLM_PROVIDER, settings.LLM_API_KEY,
        settings.LLM_MODEL or None, settings.LLM_BASE_URL or None,
    )
    return provider, True


def _resolve_classify(user: User) -> object:
    """A cheap/fast provider for the ambiguity check (same key, smaller model)."""
    if user.llm_use_own and user.llm_encrypted_key:
        pname = user.llm_provider or "anthropic"
        return get_provider(pname, decrypt_secret(user.llm_encrypted_key),
                            CLASSIFY_MODELS.get(pname), user.llm_base_url or None)
    pname = settings.LLM_PROVIDER
    return get_provider(pname, settings.LLM_API_KEY,
                        CLASSIFY_MODELS.get(pname), settings.LLM_BASE_URL or None)


async def _effective_limit(user: User, db: AsyncSession) -> int:
    """Per-user daily AI cap: user override → workspace setting → platform default."""
    if user.ai_daily_limit is not None:
        return user.ai_daily_limit
    if user.workspace_id:
        ws = (await db.execute(select(Workspace).where(Workspace.id == user.workspace_id))).scalar_one_or_none()
        if ws and ws.ai_daily_limit is not None:
            return ws.ai_daily_limit
    return settings.LLM_PLATFORM_DAILY_LIMIT


async def _check_and_bump_usage(user: User, db: AsyncSession) -> tuple[int, int]:
    """Enforce daily cap on the platform key. Returns (usage_today, limit)."""
    limit = await _effective_limit(user, db)
    today = date.today()
    result = await db.execute(
        select(AIUsage).where(AIUsage.user_id == user.id, AIUsage.day == today)
    )
    row = result.scalar_one_or_none()
    used = row.count if row else 0
    if used >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily AI limit reached ({limit}/day on the shared key). "
                   f"Add your own API key in Settings for unlimited use.",
        )
    if row:
        row.count += 1
    else:
        db.add(AIUsage(user_id=user.id, day=today, count=1))
    return used + 1, limit


async def _record_tokens(user: User, db: AsyncSession, prompt: int, completion: int, cached: int = 0) -> None:
    """Add this request's token usage to today's row (cost-view tracking).
    `cached` is the subset of `prompt` served from the prompt cache (billed cheaper)."""
    if prompt <= 0 and completion <= 0:
        return
    today = date.today()
    row = (await db.execute(
        select(AIUsage).where(AIUsage.user_id == user.id, AIUsage.day == today)
    )).scalar_one_or_none()
    if row:
        row.prompt_tokens = (row.prompt_tokens or 0) + prompt
        row.completion_tokens = (row.completion_tokens or 0) + completion
        row.cached_tokens = (row.cached_tokens or 0) + cached


@router.post("/ask", response_model=AskResponse)
async def ask(body: AskRequest, user: User = Depends(require_capability(RUN_QUERIES)), db: AsyncSession = Depends(get_db)):
    source = await _get_owned_source(body.source_id, user, db)
    provider, used_platform = _resolve_llm(user)
    # Per-workspace+source cache lane: isolates tenants while letting every member
    # of a workspace reuse the same cached schema/semantic prefix.
    cache_key = f"ws{user.workspace_id or 0}_src{source.id}"
    setattr(provider, "cache_key", cache_key)

    usage_today = daily_limit = None
    if used_platform:
        usage_today, daily_limit = await _check_and_bump_usage(user, db)
        await db.commit()

    # schema context
    connector = _connector_for(source)
    try:
        tables = await run_in_threadpool(connector.get_schema)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not read schema: {str(e)[:200]}")
    if not tables:
        raise HTTPException(status_code=400, detail="This data source has no tables to query.")

    # accuracy boosters: real column values + similar past Q→SQL + semantic layer
    samples = await _samples_for(source, connector, tables)
    examples = await _retrieve_examples(db, user.id, source.id, body.question)
    descriptions, semantic_block = await _semantic_for(db, user, source.id)

    history = [{"question": h.question, "sql": h.sql} for h in body.history]

    # ── AMBIGUITY CHECK (skip when answering a clarification or mid-conversation) ──
    classify_provider = None
    if body.allow_clarify and not history:
        schema_ctx = build_schema_context(tables, samples, descriptions)
        classify_provider = _resolve_classify(user)
        setattr(classify_provider, "cache_key", cache_key)
        try:
            clarify = await run_in_threadpool(check_ambiguity, body.question, schema_ctx, classify_provider)
        except Exception:
            clarify = None
        if clarify:
            if used_platform:
                await _record_tokens(user, db, getattr(classify_provider, "prompt_tokens", 0),
                                     getattr(classify_provider, "completion_tokens", 0),
                                     getattr(classify_provider, "cached_tokens", 0))
                await db.commit()
            return AskResponse(
                sql="", columns=[], rows=[], row_count=0, duration_ms=0, attempts=0, error=None,
                chart_type="table", chart_config={}, figure=None,
                usage_today=usage_today, daily_limit=daily_limit,
                needs_clarification=True, clarifying_question=clarify,
            )

    # run the pipeline (generate → validate → execute → self-correct)
    try:
        result = await run_in_threadpool(
            run_pipeline, body.question, source.type, connector, provider, tables,
            samples, examples, descriptions, semantic_block, history,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI request failed: {str(e).split(chr(10))[0][:250]}")

    rows = [[_json_safe(v) for v in row] for row in result["rows"]]

    # record token usage for the cost view (platform key only — BYOK is the user's bill)
    if used_platform:
        ptoks = getattr(provider, "prompt_tokens", 0) + (getattr(classify_provider, "prompt_tokens", 0) if classify_provider else 0)
        ctoks = getattr(provider, "completion_tokens", 0) + (getattr(classify_provider, "completion_tokens", 0) if classify_provider else 0)
        ctoks_cached = getattr(provider, "cached_tokens", 0) + (getattr(classify_provider, "cached_tokens", 0) if classify_provider else 0)
        await _record_tokens(user, db, ptoks, ctoks, ctoks_cached)

    # log the AI Q→SQL into query history (reuses existing infra)
    db.add(QueryHistory(
        user_id=user.id, source_id=source.id, source_name=source.name,
        sql=result["sql"], status="success" if not result["error"] else "error",
        error=result["error"], row_count=result["row_count"], duration_ms=result["duration_ms"],
    ))
    source.last_used_at = datetime.utcnow()

    # store successful Q→SQL into the few-shot bank (unverified until thumbs-up)
    example_id = None
    if not result["error"]:
        ex = FewShotExample(
            user_id=user.id, source_id=source.id,
            question=body.question, sql=result["sql"], verified=False,
        )
        db.add(ex)
        await db.flush()
        example_id = ex.id
    await db.commit()

    # auto-chart
    chart_type, chart_config, figure = "table", {}, None
    if not result["error"] and rows:
        suggestion = suggest_chart(result["columns"], rows)
        chart_type, chart_config = suggestion["chart_type"], suggestion["config"]
        try:
            figure = await run_in_threadpool(build_figure, chart_type, chart_config, result["columns"], rows)
        except Exception:
            chart_type, chart_config, figure = "table", {}, None

    return AskResponse(
        sql=result["sql"], columns=result["columns"], rows=rows,
        row_count=result["row_count"], duration_ms=result["duration_ms"],
        attempts=result["attempts"], error=result["error"],
        chart_type=chart_type, chart_config=chart_config, figure=figure,
        usage_today=usage_today, daily_limit=daily_limit, example_id=example_id,
    )


# ── AI Dashboard Builder (§24.4) ───────────────────────────────
class BuildDashboardRequest(BaseModel):
    source_id: int
    topic: str = ""          # e.g. "sales performance"; blank = general overview
    panels: int = 6          # how many charts to attempt (2–10)


class BuildDashboardResponse(BaseModel):
    dashboard_id: int
    name: str
    created: int             # panels successfully built
    skipped: int             # questions that produced no usable chart
    questions: list[str]


async def _ensure_quota(user: User, db: AsyncSession) -> None:
    """Block the build if the user is already at their daily AI cap."""
    limit = await _effective_limit(user, db)
    row = (await db.execute(
        select(AIUsage).where(AIUsage.user_id == user.id, AIUsage.day == date.today())
    )).scalar_one_or_none()
    if (row.count if row else 0) >= limit:
        raise HTTPException(status_code=429,
                            detail=f"Daily AI limit reached ({limit}/day). Add your own API key in Settings for unlimited use.")


async def _bump_usage(user: User, db: AsyncSession, n: int) -> None:
    row = (await db.execute(
        select(AIUsage).where(AIUsage.user_id == user.id, AIUsage.day == date.today())
    )).scalar_one_or_none()
    if row:
        row.count += n
    else:
        db.add(AIUsage(user_id=user.id, day=date.today(), count=n))


@router.post("/build-dashboard", response_model=BuildDashboardResponse)
async def build_dashboard(
    body: BuildDashboardRequest,
    user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db),
):
    """AI builds a whole dashboard: it invents the analytical questions, runs each
    through the text-to-SQL pipeline, picks a chart for each, saves them, and
    assembles a dashboard. Reuses the same pipeline / prompt cache as single asks."""
    source = await _get_owned_source(body.source_id, user, db)
    provider, used_platform = _resolve_llm(user)
    setattr(provider, "cache_key", f"ws{user.workspace_id or 0}_src{source.id}")
    if used_platform:
        await _ensure_quota(user, db)

    connector = _connector_for(source)
    try:
        tables = await run_in_threadpool(connector.get_schema)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not read schema: {str(e)[:200]}")
    if not tables:
        raise HTTPException(status_code=400, detail="This data source has no tables to build from.")

    samples = await _samples_for(source, connector, tables)
    descriptions, semantic_block = await _semantic_for(db, user, source.id)
    schema_ctx = build_schema_context(tables, samples, descriptions)

    n = max(2, min(body.panels, 10))
    questions = await run_in_threadpool(plan_dashboard_questions, body.topic, schema_ctx, provider, n)
    if not questions:
        raise HTTPException(status_code=502, detail="The AI couldn't plan this dashboard. Try a clearer topic.")

    created: list[tuple[int, str]] = []
    for q in questions:
        examples = await _retrieve_examples(db, user.id, source.id, q)
        try:
            res = await run_in_threadpool(
                run_pipeline, q, source.type, connector, provider, tables,
                samples, examples, descriptions, semantic_block, [])
        except Exception:
            continue
        if res.get("error") or not res.get("rows"):
            continue
        rows = [[_json_safe(v) for v in r] for r in res["rows"]]
        sug = suggest_chart(res["columns"], rows)
        chart = Chart(name=q[:80], chart_type=sug["chart_type"], source_id=source.id,
                      sql=res["sql"], config=json.dumps(sug["config"]), owner_id=user.id)
        db.add(chart)
        await db.flush()
        created.append((chart.id, q))
        db.add(FewShotExample(user_id=user.id, source_id=source.id, question=q, sql=res["sql"], verified=False))

    if not created:
        raise HTTPException(status_code=400,
                            detail="Couldn't build any panels — the AI's questions returned no data. Try a different topic or source.")

    # 2-column grid layout
    layout = [{"i": f"w{i}_{cid}", "chart_id": cid, "x": (i % 2) * 6, "y": (i // 2) * 8, "w": 6, "h": 8}
              for i, (cid, _q) in enumerate(created)]
    name = (body.topic.strip()[:60] or "AI Dashboard")
    dash = Dashboard(name=name, layout=json.dumps(layout), owner_id=user.id,
                     config=json.dumps({"theme": "light", "palette": "default", "filters": []}))
    db.add(dash)

    if used_platform:
        await _bump_usage(user, db, len(created))
        await _record_tokens(user, db, getattr(provider, "prompt_tokens", 0),
                             getattr(provider, "completion_tokens", 0),
                             getattr(provider, "cached_tokens", 0))
    await db.commit()
    await db.refresh(dash)
    return BuildDashboardResponse(
        dashboard_id=dash.id, name=dash.name, created=len(created),
        skipped=len(questions) - len(created), questions=questions,
    )


# ── Feedback (thumbs up/down) ──────────────────────────────────
class FeedbackRequest(BaseModel):
    example_id: int
    rating: str  # "up" | "down"


@router.post("/feedback")
async def feedback(body: FeedbackRequest, user: User = Depends(get_current_user),
                   db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FewShotExample).where(
            FewShotExample.id == body.example_id, FewShotExample.user_id == user.id)
    )
    ex = result.scalar_one_or_none()
    if not ex:
        raise HTTPException(status_code=404, detail="Example not found")
    if body.rating == "up":
        ex.verified = True          # promote — preferred in future retrieval
        await db.commit()
        return {"status": "verified"}
    elif body.rating == "down":
        await db.delete(ex)         # remove so bad SQL never pollutes the bank
        await db.commit()
        return {"status": "removed"}
    raise HTTPException(status_code=400, detail="rating must be 'up' or 'down'")


# ── BYOK settings ──────────────────────────────────────────────
@router.get("/settings", response_model=AISettingsResponse)
async def get_ai_settings(user: User = Depends(get_current_user)):
    platform_available = bool(settings.LLM_API_KEY) or settings.LLM_PROVIDER == "ollama"
    has_own = bool(user.llm_encrypted_key)
    using_own = bool(user.llm_use_own and has_own)
    return AISettingsResponse(
        configured=using_own or platform_available,
        use_own=bool(user.llm_use_own),
        provider=user.llm_provider,
        model=user.llm_model,
        base_url=user.llm_base_url,
        has_own_key=has_own,
        platform_available=platform_available,
        daily_limit=settings.LLM_PLATFORM_DAILY_LIMIT,
    )


@router.put("/settings", response_model=AISettingsResponse)
async def update_ai_settings(
    body: AISettingsUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if body.provider is not None:
        if body.provider and body.provider not in DEFAULT_MODELS:
            raise HTTPException(status_code=400, detail=f"Unknown provider. Use: {', '.join(DEFAULT_MODELS)}")
        user.llm_provider = body.provider or None
    if body.model is not None:
        user.llm_model = body.model or None
    if body.base_url is not None:
        user.llm_base_url = body.base_url or None
    if body.api_key is not None:
        user.llm_encrypted_key = encrypt_secret(body.api_key) if body.api_key else None
    if body.use_own is not None:
        user.llm_use_own = body.use_own

    await db.commit()
    await db.refresh(user)
    return await get_ai_settings(user)


# ── Admin: AI usage limits + cost view (§13/§28) ───────────────
class AILimitsUpdate(BaseModel):
    workspace_daily_limit: int | None = None  # None = use platform default


def _platform_model() -> str:
    return settings.LLM_MODEL or DEFAULT_MODELS.get(settings.LLM_PROVIDER, "")


@router.get("/limits")
async def get_ai_limits(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ws = (await db.execute(select(Workspace).where(Workspace.id == admin.workspace_id))).scalar_one_or_none()
    return {
        "workspace_daily_limit": ws.ai_daily_limit if ws else None,
        "platform_default": settings.LLM_PLATFORM_DAILY_LIMIT,
        "byok": admin.llm_use_own,  # if admin's workspace is on BYOK, limits don't apply
    }


@router.put("/limits")
async def set_ai_limits(body: AILimitsUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if body.workspace_daily_limit is not None and body.workspace_daily_limit < 1:
        raise HTTPException(status_code=400, detail="Daily limit must be at least 1 (or blank for the platform default).")
    ws = (await db.execute(select(Workspace).where(Workspace.id == admin.workspace_id))).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    ws.ai_daily_limit = body.workspace_daily_limit
    await db.commit()
    return {"workspace_daily_limit": ws.ai_daily_limit, "platform_default": settings.LLM_PLATFORM_DAILY_LIMIT}


@router.get("/usage")
async def ai_usage_overview(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Per-member AI usage for the workspace: today's count vs limit + this
    month's tokens and estimated cost."""
    from sqlalchemy import func
    members = (await db.execute(
        select(User).where(User.workspace_id == admin.workspace_id).order_by(User.full_name)
    )).scalars().all()
    today = date.today()
    first = today.replace(day=1)

    month_rows = (await db.execute(
        select(AIUsage.user_id, func.sum(AIUsage.count), func.sum(AIUsage.prompt_tokens),
               func.sum(AIUsage.completion_tokens), func.sum(AIUsage.cached_tokens))
        .where(AIUsage.day >= first).group_by(AIUsage.user_id)
    )).all()
    month = {uid: (c or 0, pt or 0, ct or 0, cc or 0) for uid, c, pt, ct, cc in month_rows}
    today_counts = dict((await db.execute(
        select(AIUsage.user_id, AIUsage.count).where(AIUsage.day == today)
    )).all())

    ws = (await db.execute(select(Workspace).where(Workspace.id == admin.workspace_id))).scalar_one_or_none()
    ws_limit = ws.ai_daily_limit if ws else None
    model = _platform_model()

    out = []
    for u in members:
        mq, mpt, mct, mcc = month.get(u.id, (0, 0, 0, 0))
        eff = u.ai_daily_limit if u.ai_daily_limit is not None else (
            ws_limit if ws_limit is not None else settings.LLM_PLATFORM_DAILY_LIMIT)
        cache_hit = round(100 * mcc / mpt) if mpt else 0   # % of input tokens served from cache
        out.append({
            "user_id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role,
            "on_own_key": bool(u.llm_use_own and u.llm_encrypted_key),
            "today_count": today_counts.get(u.id, 0),
            "effective_limit": eff, "override": u.ai_daily_limit,
            "month_questions": mq, "month_tokens": mpt + mct,
            "month_cached_tokens": mcc, "cache_hit_pct": cache_hit,
            "month_cost": estimate_cost(mpt, mct, model, mcc),
        })
    return {
        "members": out, "workspace_daily_limit": ws_limit,
        "platform_default": settings.LLM_PLATFORM_DAILY_LIMIT, "model": model,
    }
