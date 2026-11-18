from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.permissions import workspace_user_ids
from app.database import get_db
from app.models.chat_session import ChatSession
from app.models.dashboard import Dashboard
from app.models.datasource import DataSource
from app.models.query import QueryHistory
from app.models.user import User

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/overview")
async def overview(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Headline counts for the dashboard home — scoped to the user's workspace."""
    ws = workspace_user_ids(user)

    async def count(stmt) -> int:
        return (await db.scalar(stmt)) or 0

    return {
        "data_sources": await count(select(func.count(DataSource.id)).where(DataSource.owner_id.in_(ws))),
        "queries_run": await count(select(func.count(QueryHistory.id)).where(QueryHistory.user_id.in_(ws))),
        "dashboards": await count(select(func.count(Dashboard.id)).where(Dashboard.owner_id.in_(ws))),
        "ai_conversations": await count(select(func.count(ChatSession.id)).where(ChatSession.owner_id.in_(ws))),
    }
