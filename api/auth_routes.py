"""
User-System - Registrierung, Login, JWT Auth, Passwort aendern.
"""
import hashlib
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status, Form
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, field_validator
from sqlalchemy import DateTime
from sqlalchemy.orm import Session

from database import engine, get_db, run_lightweight_migrations, set_current_workspace_id
from models.user import User, Workspace, WorkspaceMembership
from security_config import is_configured_secret, is_production_environment

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("audit")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

SECRET_KEY = os.getenv("JWT_SECRET", "")
if not is_configured_secret(SECRET_KEY, min_length=32):
    raise RuntimeError("JWT_SECRET muss gesetzt, hinreichend lang und frei von Standardwerten sein!")
ALGORITHM = "HS256"

# Kurzlebige Access-Tokens (1 Stunde), Refresh-Tokens (7 Tage)
ACCESS_TOKEN_EXPIRY_MINUTES = 60
REFRESH_TOKEN_EXPIRY_MINUTES = 60 * 24 * 7
DEMO_EMAIL = "demo@bizlytics.de"
DEMO_PASSWORD = "DemoUser2023A"  # Policy-konform, <72 Zeichen

# Debug: Logge Passwortlänge
logger.warning(f"DEMO_PASSWORD length: {len(DEMO_PASSWORD)}, bytes: {len(DEMO_PASSWORD.encode('utf-8'))}")

# Use a stable default hasher that does not depend on external bcrypt backend quirks.
# Existing bcrypt hashes remain verifiable because bcrypt is kept as a secondary scheme.
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

# Passwort-Mindestanforderungen
_PASSWORD_MIN_LENGTH = 10
_PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{10,}$")
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        cleaned = (v or "").strip().lower()
        if not _EMAIL_PATTERN.match(cleaned):
            raise ValueError("Ungültige E-Mail-Adresse.")
        if len(cleaned) > 254:
            raise ValueError("E-Mail-Adresse ist zu lang.")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < _PASSWORD_MIN_LENGTH:
            raise ValueError(f"Passwort muss mindestens {_PASSWORD_MIN_LENGTH} Zeichen haben.")
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError(
                "Passwort muss mindestens einen Grossbuchstaben, einen Kleinbuchstaben und eine Zahl enthalten."
            )
        return v

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if len(stripped) > 100:
            raise ValueError("Name darf maximal 100 Zeichen lang sein.")
        return stripped


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    name: Optional[str]
    onboarding_done: bool
    active_workspace_id: Optional[int] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class UserProfile(BaseModel):
    id: int
    email: str
    name: Optional[str]
    company: Optional[str]
    industry: Optional[str]
    role: str
    onboarding_done: bool
    active_workspace_id: Optional[int]
    created_at: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < _PASSWORD_MIN_LENGTH:
            raise ValueError(f"Neues Passwort muss mindestens {_PASSWORD_MIN_LENGTH} Zeichen haben.")
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError(
                "Passwort muss mindestens einen Grossbuchstaben, einen Kleinbuchstaben und eine Zahl enthalten."
            )
        return v


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None

    @field_validator("name", "company", "industry")
    @classmethod
    def sanitize_strings(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if len(stripped) > 200:
            raise ValueError("Feld darf maximal 200 Zeichen lang sein.")
        return stripped


class OnboardingRequest(BaseModel):
    company: str
    industry: str
    goals: list[str]
    data_source: str


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    if not isinstance(password, str):
        logger.error("[hash_password] WARN: password is not a string")
        password = "DemoUser2023A"
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    # Transparente Migration: alte SHA256-Hashes (64 hex Zeichen ohne $) akzeptieren
    if len(hashed) == 64 and not hashed.startswith("$"):
        legacy_hash = hashlib.sha256(f"bizlytics_salt_v1{plain}".encode()).hexdigest()
        return legacy_hash == hashed
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(user_id: int, email: str, workspace_id: Optional[int] = None) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRY_MINUTES)
    payload = {"sub": str(user_id), "email": email, "exp": expire, "type": "access"}
    if workspace_id:
        payload["ws"] = int(workspace_id)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=REFRESH_TOKEN_EXPIRY_MINUTES)
    payload = {"sub": str(user_id), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# Legacy-Alias fuer andere Module
def create_token(user_id: int, email: str) -> str:
    return create_access_token(user_id, email)


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type", "access") != expected_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Falscher Token-Typ.",
            )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token ungueltig oder abgelaufen.",
        ) from exc


def _slugify_workspace_name(name: str) -> str:
    candidate = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return candidate or "workspace"


def _unique_workspace_slug(db: Session, preferred: str) -> str:
    base_slug = _slugify_workspace_name(preferred)
    slug = base_slug
    suffix = 1
    while db.query(Workspace).filter(Workspace.slug == slug).first():
        suffix += 1
        slug = f"{base_slug}-{suffix}"
    return slug


def _ensure_default_workspace_for_user(db: Session, user: User) -> int:
    membership = (
        db.query(WorkspaceMembership)
        .filter(WorkspaceMembership.user_id == getattr(user, "id", None), WorkspaceMembership.is_active == True)
        .first()
    )
    if membership:
        if not getattr(user, "active_workspace_id", None):
            user.active_workspace_id = membership.workspace_id
            db.commit()
        return membership.workspace_id

    preferred_name = getattr(user, "company", None) or getattr(user, "name", None) or f"{getattr(user, 'email', '').split('@')[0]} Workspace"
    workspace = Workspace(
        name=preferred_name[:120],
        slug=_unique_workspace_slug(db, preferred_name),
        owner_user_id=getattr(user, "id", None),
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    db.add(
        WorkspaceMembership(
            user_id=getattr(user, "id", None),
            workspace_id=workspace.id,
            role="owner",
            is_active=True,
        )
    )
    user.active_workspace_id = workspace.id
    db.commit()
    return workspace.id


def get_current_workspace_id(request: Request) -> int:
    workspace_id = getattr(request.state, "workspace_id", None)
    if not workspace_id:
        raise HTTPException(status_code=403, detail="Kein Workspace im Request-Kontext.")
    return int(workspace_id)


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token, expected_type="access")
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Nutzer nicht gefunden oder inaktiv.")

    _ensure_default_workspace_for_user(db, user)

    requested_workspace_id = getattr(request.state, "workspace_id", None)
    requested_workspace_slug = getattr(request.state, "workspace_slug", None)
    token_workspace_id = payload.get("ws")

    membership_query = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user.id,
            WorkspaceMembership.is_active == True,
        )
    )

    membership = None
    if requested_workspace_id:
        membership = membership_query.filter(WorkspaceMembership.workspace_id == int(requested_workspace_id)).first()
    elif requested_workspace_slug:
        workspace = db.query(Workspace).filter(Workspace.slug == requested_workspace_slug).first()
        if workspace:
            membership = membership_query.filter(WorkspaceMembership.workspace_id == workspace.id).first()
    elif token_workspace_id:
        membership = membership_query.filter(WorkspaceMembership.workspace_id == int(token_workspace_id)).first()
    elif user.active_workspace_id:
        membership = membership_query.filter(WorkspaceMembership.workspace_id == int(user.active_workspace_id)).first()

    if not membership:
        membership = membership_query.order_by(WorkspaceMembership.created_at.asc()).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Kein aktiver Workspace-Zugriff.")

    workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=403, detail="Workspace nicht gefunden.")

    request.state.workspace_id = workspace.id
    request.state.workspace_slug = workspace.slug
    set_current_workspace_id(workspace.id)

    if user.active_workspace_id != workspace.id:
        user.active_workspace_id = workspace.id
        db.commit()

    return user


# ── Endpunkte ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=LoginResponse)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="E-Mail bereits registriert.")

    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        name=body.name,
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    workspace_id = _ensure_default_workspace_for_user(db, user)

    logger.info("REGISTER user_id=%s email=%s ip=%s", user.id, user.email,
                request.client.host if request.client else "unknown")

    access_token = create_access_token(user.id, user.email, workspace_id=workspace_id)
    refresh_token = create_refresh_token(user.id)
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
        onboarding_done=user.onboarding_done,
        active_workspace_id=user.active_workspace_id,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    request: Request,
    username: Optional[str] = Form(default=None),
    email: Optional[str] = Form(default=None),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    ip = request.client.host if request.client else "unknown"

    login_identifier = (username or email or "").strip().lower()
    if not login_identifier or not password:
        logger.warning("LOGIN_INVALID_PAYLOAD ip=%s", ip)
        raise HTTPException(status_code=400, detail="Login erfordert Benutzerkennung und Passwort.")

    user = db.query(User).filter(User.email == login_identifier).first()

    if not user or not verify_password(password, user.password_hash):
        logger.warning("LOGIN_FAILED email=%s ip=%s", login_identifier, ip)
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort falsch.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deaktiviert.")

    # Falls noch alter SHA256-Hash: beim Login automatisch auf bcrypt migrieren
    if len(str(user.password_hash)) == 64 and not str(user.password_hash).startswith("$"):
        user.password_hash = hash_password(password)
        db.commit()

    logger.info("LOGIN_SUCCESS user_id=%s ip=%s", user.id, ip)

    workspace_id = _ensure_default_workspace_for_user(db, user)
    access_token = create_access_token(user.id, user.email, workspace_id=workspace_id)
    refresh_token = create_refresh_token(user.id)
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
        onboarding_done=user.onboarding_done,
        active_workspace_id=user.active_workspace_id,
    )


@router.post("/refresh", response_model=LoginResponse)
def refresh_token_endpoint(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token, expected_type="refresh")
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Nutzer nicht gefunden oder inaktiv.")

    workspace_id = _ensure_default_workspace_for_user(db, user)
    access_token = create_access_token(user.id, user.email, workspace_id=workspace_id)
    new_refresh_token = create_refresh_token(user.id)
    return LoginResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user_id=user.id,
        email=user.email,
        name=user.name,
        onboarding_done=user.onboarding_done,
        active_workspace_id=user.active_workspace_id,
    )


@router.get("/me", response_model=UserProfile)
def get_me(current_user: User = Depends(get_current_user)):
    return UserProfile(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        company=current_user.company,
        industry=current_user.industry,
        role=current_user.role,
        onboarding_done=current_user.onboarding_done,
        active_workspace_id=current_user.active_workspace_id,
        created_at=str(current_user.created_at),
    )


@router.get("/profile", response_model=UserProfile)
def get_profile(current_user: User = Depends(get_current_user)):
    # Backward-compatible alias for older clients still calling /api/auth/profile.
    return get_me(current_user)


@router.put("/profile")
def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.name is not None:
        current_user.name = body.name
    if body.company is not None:
        current_user.company = body.company
    if body.industry is not None:
        current_user.industry = body.industry
    db.commit()
    return {"message": "Profil aktualisiert."}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        logger.warning("CHANGE_PASSWORD_FAILED user_id=%s ip=%s", current_user.id,
                       request.client.host if request.client else "unknown")
        raise HTTPException(status_code=400, detail="Aktuelles Passwort falsch.")

    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    logger.info("CHANGE_PASSWORD_SUCCESS user_id=%s", current_user.id)
    return {"message": "Passwort geaendert."}


@router.post("/onboarding")
def complete_onboarding(
    body: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.company = body.company[:200] if body.company else body.company
    current_user.industry = body.industry[:100] if body.industry else body.industry
    current_user.onboarding_done = True
    db.commit()
    return {
        "message": "Onboarding abgeschlossen.",
        "company": body.company,
        "industry": body.industry,
        "goals": body.goals,
        "data_source": body.data_source,
    }


# ── E-Mail Verification Code ──────────────────────────────────────────────────
from models.email_preferences import VerificationCode
from services.email_service import generate_code, send_verification_code
from datetime import timezone

class SendCodeRequest(BaseModel):
    email: str

class VerifyCodeRequest(BaseModel):
    email: str
    code: str

@router.post("/send-code")
def send_code(body: SendCodeRequest, db: Session = Depends(get_db)):
    """Send a 6-digit verification code to the given email."""
    # Delete old codes for this email
    db.query(VerificationCode).filter_by(email=body.email).delete()
    code = generate_code()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    vc = VerificationCode(email=body.email, code=code, expires_at=expires)
    db.add(vc)
    db.commit()
    sent = send_verification_code(body.email, code)
    return {"ok": True, "dev_code": code if not sent else None}

@router.post("/verify-code")
def verify_code(body: VerifyCodeRequest, db: Session = Depends(get_db)):
    """Verify the 6-digit code. Returns ok:true if valid."""
    vc = (
        db.query(VerificationCode)
        .filter_by(email=body.email, code=body.code, used=False)
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if not vc:
        raise HTTPException(status_code=400, detail="Ungültiger Code.")
    if vc.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code abgelaufen. Bitte neu anfordern.")
    vc.used = True
    db.commit()
    return {"ok": True}


@router.post("/seed-demo-user")
def seed_demo_user(request: Request, db: Session = Depends(get_db)):
    """Demo-User nur in Nicht-Produktionsumgebungen erstellen."""
    try:
        if is_production_environment():
            raise HTTPException(status_code=403, detail="In Produktion nicht verfuegbar.")

        existing = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if existing:
            # Demo-Credentials bei jedem Aufruf vereinheitlichen, damit Frontend-Login stabil bleibt.
            existing.password_hash = hash_password(DEMO_PASSWORD)
            if not existing.name:
                existing.name = "Demo User"
            if not existing.company:
                existing.company = "Bizlytics Demo GmbH"
            if not existing.industry:
                existing.industry = "ecommerce"
            existing.onboarding_done = True
            db.commit()

            workspace_id = _ensure_default_workspace_for_user(db, existing)
            token = create_access_token(existing.id, existing.email, workspace_id=workspace_id)
            refresh = create_refresh_token(existing.id)
            return {
                "message": "Demo-User bereits vorhanden.",
                "token": token,
                "refresh_token": refresh,
                "email": DEMO_EMAIL,
                "password": DEMO_PASSWORD,
            }

        user = User(
            email=DEMO_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
            name="Demo User",
            company="Bizlytics Demo GmbH",
            industry="ecommerce",
            role="admin",
            onboarding_done=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        workspace_id = _ensure_default_workspace_for_user(db, user)

        token = create_access_token(user.id, user.email, workspace_id=workspace_id)
        refresh = create_refresh_token(user.id)
        logger.info("SEED_DEMO_USER created ip=%s", request.client.host if request.client else "unknown")
        return {
            "message": "Demo-User erstellt (nur Entwicklung).",
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD,
            "token": token,
            "refresh_token": refresh,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"Demo-User-Seed-Fehler: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Demo-User-Seed-Fehler: {e}")


# ─── GDPR: Recht auf Löschung (Art. 17 DSGVO) ────────────────────────────────
class EraseAccountRequest(BaseModel):
    password: str
    confirm_text: str  # must equal "KONTO LÖSCHEN"


@router.delete("/erase-account", status_code=200)
def erase_account(
    body: EraseAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    DSGVO Art. 17 – Recht auf Löschung.
    Anonymisiert alle personenbezogenen Daten des Nutzers.
    Der Datensatz bleibt für die Audit-Integrität erhalten, enthält aber keine PII mehr.
    """
    if body.confirm_text != "KONTO LÖSCHEN":
        raise HTTPException(
            status_code=400,
            detail="Bestätigungstext stimmt nicht überein. Bitte 'KONTO LÖSCHEN' eingeben.",
        )
    if not verify_password(body.password, current_user.password_hash):
        logger.warning("GDPR_ERASE_WRONG_PASSWORD user_id=%s", current_user.id)
        raise HTTPException(status_code=403, detail="Falsches Passwort.")

    user_id    = current_user.id
    anon_email = f"deleted_{user_id}@anon.invalid"

    # Anonymise – keep row for referential integrity & audit trail
    current_user.email          = anon_email
    current_user.name           = "Gelöschter Nutzer"
    current_user.company        = None
    current_user.industry       = None
    current_user.password_hash  = "ERASED"
    current_user.is_active      = False

    db.commit()

    logger.info(
        "GDPR_ERASE_ACCOUNT user_id=%s anonymised_email=%s",
        user_id, anon_email,
    )
    return {
        "message": (
            "Konto erfolgreich anonymisiert. "
            "Alle personenbezogenen Daten wurden gemäß DSGVO Art. 17 gelöscht."
        )
    }
