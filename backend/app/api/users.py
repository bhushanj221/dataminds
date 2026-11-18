"""Admin user management. All endpoints require the `manage_users` capability
(admin role). Includes guards so an admin can't lock the workspace out of admin
access (can't remove/deactivate/demote the last admin, or their own account)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ROLE_CAPABILITIES, ROLES, require_admin
from app.core.security import hash_password
from app.database import get_db
from app.models.user import User
from app.schemas.users import RolesResponse, UserAdminResponse, UserCreate, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


async def _active_admin_count(db: AsyncSession, workspace_id: int | None, exclude_id: int | None = None) -> int:
    q = select(func.count(User.id)).where(
        User.role == "admin", User.is_active == True, User.workspace_id == workspace_id  # noqa: E712
    )
    if exclude_id is not None:
        q = q.where(User.id != exclude_id)
    return (await db.execute(q)).scalar() or 0


async def _get_workspace_user(user_id: int, workspace_id: int | None, db: AsyncSession) -> User:
    """Fetch a user only if they're in the admin's workspace (tenant isolation)."""
    res = await db.execute(
        select(User).where(User.id == user_id, User.workspace_id == workspace_id)
    )
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    return target


@router.get("/roles", response_model=RolesResponse)
async def list_roles(_: User = Depends(require_admin)):
    return RolesResponse(roles=ROLES, matrix={r: sorted(c) for r, c in ROLE_CAPABILITIES.items()})


@router.get("", response_model=list[UserAdminResponse])
async def list_users(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(User).where(User.workspace_id == admin.workspace_id).order_by(User.created_at.asc())
    )
    return [UserAdminResponse.model_validate(u) for u in res.scalars().all()]


@router.post("", response_model=UserAdminResponse, status_code=201)
async def create_user(body: UserCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    exists = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    # New users join the onboarding admin's workspace, with an admin-assigned role.
    user = User(
        email=body.email, full_name=body.full_name, role=body.role,
        hashed_password=hash_password(body.password), workspace_id=admin.workspace_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserAdminResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserAdminResponse)
async def update_user(
    user_id: int, body: UserUpdate,
    admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
):
    target = await _get_workspace_user(user_id, admin.workspace_id, db)

    # ── lockout guards (scoped to the workspace) ──
    demoting = body.role is not None and body.role != "admin" and target.role == "admin"
    deactivating = body.is_active is False and target.is_active
    if (demoting or deactivating) and target.role == "admin":
        if await _active_admin_count(db, admin.workspace_id, exclude_id=target.id) == 0:
            raise HTTPException(status_code=400, detail="Can't remove the last active admin.")
    if deactivating and target.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account.")

    if body.full_name is not None:
        target.full_name = body.full_name.strip() or target.full_name
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.clear_ai_limit:
        target.ai_daily_limit = None
    elif body.ai_daily_limit is not None:
        target.ai_daily_limit = max(1, body.ai_daily_limit)
    await db.commit()
    await db.refresh(target)
    return UserAdminResponse.model_validate(target)


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    target = await _get_workspace_user(user_id, admin.workspace_id, db)
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account.")
    if target.role == "admin" and await _active_admin_count(db, admin.workspace_id, exclude_id=target.id) == 0:
        raise HTTPException(status_code=400, detail="Can't delete the last active admin.")
    await db.delete(target)
    await db.commit()
