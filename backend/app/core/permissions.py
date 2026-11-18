"""Role-based access control.

A small, explicit capability matrix maps each role to what it may do. Endpoints
guard themselves with `require_capability(...)`, which resolves the current user
and 403s if their role lacks the capability.

Roles (slice 1):
  admin          — full control, incl. user management
  data_engineer  — connect/manage sources + semantic layer, query, create content
  analyst        — query + create content (dashboards, charts, KPIs, reports)
  viewer         — read-only
"""
from fastapi import Depends, HTTPException
from sqlalchemy import select

from app.api.auth import get_current_user
from app.models.user import User


def workspace_user_ids(user: User):
    """Scalar subquery of all user ids sharing `user`'s workspace — used to scope
    shared assets (sources, charts, dashboards, KPIs, reports, semantic layer) so
    workspace members see each other's work. Falls back to just the user when no
    workspace is set (defensive; shouldn't happen post-backfill)."""
    if user.workspace_id is None:
        return select(User.id).where(User.id == user.id).scalar_subquery()
    return select(User.id).where(User.workspace_id == user.workspace_id).scalar_subquery()

# ── capabilities ──
VIEW = "view"
RUN_QUERIES = "run_queries"
CREATE_CONTENT = "create_content"
MANAGE_SOURCES = "manage_sources"
MANAGE_SEMANTIC = "manage_semantic"
MANAGE_USERS = "manage_users"

ALL_CAPS = {VIEW, RUN_QUERIES, CREATE_CONTENT, MANAGE_SOURCES, MANAGE_SEMANTIC, MANAGE_USERS}

ROLE_CAPABILITIES: dict[str, set[str]] = {
    "admin": set(ALL_CAPS),
    "data_engineer": {VIEW, RUN_QUERIES, CREATE_CONTENT, MANAGE_SOURCES, MANAGE_SEMANTIC},
    "analyst": {VIEW, RUN_QUERIES, CREATE_CONTENT},
    "viewer": {VIEW},
}
ROLES = list(ROLE_CAPABILITIES.keys())


def capabilities_for(role: str | None) -> set[str]:
    return ROLE_CAPABILITIES.get(role or "", {VIEW})


def has_capability(user: User, cap: str) -> bool:
    return cap in capabilities_for(user.role)


def require_capability(cap: str):
    """Dependency factory: allow only roles that have `cap`."""
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if cap not in capabilities_for(user.role):
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({user.role}) is not permitted to perform this action.",
            )
        return user
    return _dep


require_admin = require_capability(MANAGE_USERS)


def is_workspace_admin(user: User) -> bool:
    """Admins hold `manage_users` — the marker capability for workspace admins."""
    return MANAGE_USERS in capabilities_for(user.role)


def require_owner_or_admin(asset, user: User) -> None:
    """Guard mutations on a *shared* asset: only its owner or a workspace admin
    may edit/delete it. Other workspace members can still view/use it.
    `asset` must expose `owner_id`. Raises 403 otherwise."""
    if getattr(asset, "owner_id", None) == user.id or is_workspace_admin(user):
        return
    raise HTTPException(
        status_code=403,
        detail="Only the asset's owner or a workspace admin can modify this.",
    )
