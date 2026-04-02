from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import engine, get_db
from models.base import Base
from models.company import Company

router = APIRouter(prefix="/api/companies", tags=["companies"])

Base.metadata.create_all(bind=engine)


class CompanyCreate(BaseModel):
    name: str
    slug: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None


def _payload(row: Company) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "owner_user_id": row.owner_user_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(Company).filter(Company.owner_user_id == current_user.id).all()
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_company(
    body: CompanyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = Company(
        name=body.name,
        slug=body.slug,
        owner_user_id=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.get("/{company_id}")
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(Company).filter(Company.id == company_id).first()
    if not row or row.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company nicht gefunden.")
    return _payload(row)


@router.patch("/{company_id}")
def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(Company).filter(Company.id == company_id).first()
    if not row or row.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company nicht gefunden.")
    if body.name is not None:
        row.name = body.name
    if body.slug is not None:
        row.slug = body.slug
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(Company).filter(Company.id == company_id).first()
    if not row or row.owner_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Company nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": company_id}
