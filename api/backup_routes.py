import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_workspace_id
from api.role_guards import require_ceo
from database import get_db
from services.backup_service import create_workspace_backup, restore_workspace_backup

router = APIRouter(prefix="/api/backup", tags=["backup"])

_BACKUP_DIR = Path("/workspaces/intlyst-finn/.runtime_backups")
_BACKUP_DIR.mkdir(parents=True, exist_ok=True)


class RestoreBody(BaseModel):
    second_confirmation: bool = False
    overwrite_metrics: bool = False


def _workspace_backup_dir(workspace_id: int) -> Path:
    path = _BACKUP_DIR / f"workspace_{workspace_id}"
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("")
def create_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ceo),
    workspace_id: int = Depends(get_current_workspace_id),
):
    backup = create_workspace_backup(db, workspace_id)
    backup_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    backup["backup_id"] = backup_id
    backup["created_by"] = current_user.email

    target = _workspace_backup_dir(workspace_id) / f"{backup_id}.json"
    target.write_text(json.dumps(backup, ensure_ascii=True, indent=2), encoding="utf-8")

    return {"backup_id": backup_id, "path": str(target), "counts": backup.get("counts", {})}


@router.get("/list")
def list_backups(
    current_user: User = Depends(require_ceo),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    path = _workspace_backup_dir(workspace_id)
    items = []
    for file in sorted(path.glob("*.json"), reverse=True):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
            items.append(
                {
                    "backup_id": data.get("backup_id") or file.stem,
                    "created_at": data.get("created_at"),
                    "created_by": data.get("created_by"),
                    "counts": data.get("counts", {}),
                }
            )
        except Exception:
            continue
    return {"items": items}


@router.post("/restore/{backup_id}")
def restore_backup(
    backup_id: str,
    body: RestoreBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_ceo),
    workspace_id: int = Depends(get_current_workspace_id),
):
    if not body.second_confirmation:
        raise HTTPException(status_code=400, detail="Zweite Bestätigung erforderlich (second_confirmation=true).")

    file_path = _workspace_backup_dir(workspace_id) / f"{backup_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Backup nicht gefunden.")

    data = json.loads(file_path.read_text(encoding="utf-8"))
    report = restore_workspace_backup(
        db,
        workspace_id,
        data,
        overwrite_metrics=body.overwrite_metrics,
    )

    return {
        "backup_id": backup_id,
        "restored_by": current_user.email,
        "report": report,
    }
