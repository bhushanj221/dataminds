from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.core.permissions import (
    CREATE_CONTENT, require_capability, require_owner_or_admin, workspace_user_ids,
)
from app.database import get_db
from app.models.dashboard import Dashboard
from app.models.folder import DashboardFolder
from app.models.user import User

router = APIRouter(prefix="/api/dashboard-folders", tags=["folders"])


class FolderCreate(BaseModel):
    name: str
    parent_id: int | None = None

    @field_validator("name")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Folder name cannot be empty")
        return v.strip()


class FolderUpdate(BaseModel):
    name: str | None = None
    parent_id: int | None = None   # explicit null = move to root


class FolderResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None = None
    dashboard_count: int = 0       # dashboards directly in this folder

    model_config = {"from_attributes": True}


async def _get_owned_folder(folder_id: int, user: User, db: AsyncSession) -> DashboardFolder:
    res = await db.execute(
        select(DashboardFolder).where(
            DashboardFolder.id == folder_id,
            DashboardFolder.owner_id.in_(workspace_user_ids(user)),
        )
    )
    folder = res.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


async def _all_folders(user: User, db: AsyncSession) -> list[DashboardFolder]:
    res = await db.execute(
        select(DashboardFolder).where(DashboardFolder.owner_id.in_(workspace_user_ids(user)))
    )
    return list(res.scalars().all())


def _is_descendant(folder_id: int, maybe_ancestor: int, folders: list[DashboardFolder]) -> bool:
    """True if `folder_id` is `maybe_ancestor` or sits somewhere beneath it —
    used to reject moves that would create a cycle."""
    by_id = {f.id: f for f in folders}
    cur = by_id.get(folder_id)
    seen = set()
    while cur is not None and cur.id not in seen:
        if cur.id == maybe_ancestor:
            return True
        seen.add(cur.id)
        cur = by_id.get(cur.parent_id) if cur.parent_id else None
    return False


async def _validate_parent(parent_id: int | None, user: User, db: AsyncSession,
                           moving_id: int | None = None) -> None:
    if parent_id is None:
        return
    await _get_owned_folder(parent_id, user, db)  # must exist + be in workspace
    if moving_id is not None:
        folders = await _all_folders(user, db)
        # the chosen parent must not be the folder itself or any of its descendants
        if _is_descendant(parent_id, moving_id, folders):
            raise HTTPException(status_code=400, detail="Cannot move a folder into itself or its subfolder.")


@router.get("", response_model=list[FolderResponse])
async def list_folders(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """All workspace folders (flat list with parent_id) + direct dashboard counts."""
    res = await db.execute(
        select(DashboardFolder, func.count(Dashboard.id))
        .outerjoin(Dashboard, Dashboard.folder_id == DashboardFolder.id)
        .where(DashboardFolder.owner_id.in_(workspace_user_ids(user)))
        .group_by(DashboardFolder.id)
        .order_by(DashboardFolder.name)
    )
    return [
        FolderResponse(id=f.id, name=f.name, parent_id=f.parent_id, dashboard_count=count)
        for f, count in res.all()
    ]


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    body: FolderCreate, user: User = Depends(require_capability(CREATE_CONTENT)), db: AsyncSession = Depends(get_db)
):
    await _validate_parent(body.parent_id, user, db)
    folder = DashboardFolder(name=body.name, parent_id=body.parent_id, owner_id=user.id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderResponse(id=folder.id, name=folder.name, parent_id=folder.parent_id, dashboard_count=0)


@router.put("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int, body: FolderUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    folder = await _get_owned_folder(folder_id, user, db)
    require_owner_or_admin(folder, user)
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Folder name cannot be empty")
        folder.name = body.name.strip()
    if "parent_id" in body.model_fields_set:
        await _validate_parent(body.parent_id, user, db, moving_id=folder.id)
        folder.parent_id = body.parent_id
    await db.commit()
    await db.refresh(folder)
    return FolderResponse(id=folder.id, name=folder.name, parent_id=folder.parent_id)


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(folder_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Delete a folder. Its dashboards and subfolders are kept — they move up to
    this folder's parent (root if it was top-level), so nothing is lost."""
    folder = await _get_owned_folder(folder_id, user, db)
    require_owner_or_admin(folder, user)
    parent = folder.parent_id
    await db.execute(update(Dashboard).where(Dashboard.folder_id == folder.id).values(folder_id=parent))
    await db.execute(
        update(DashboardFolder).where(DashboardFolder.parent_id == folder.id).values(parent_id=parent)
    )
    await db.delete(folder)
    await db.commit()
