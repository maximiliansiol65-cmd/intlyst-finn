"""
Referral System — persönliche Links, Tracking,
skalierendes Incentive, automatische Gutschriften
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import secrets, string, os, logging
from database import get_db, Base
from api.auth_routes import get_current_user

router = APIRouter(prefix="/api/referral", tags=["referral"])
logger = logging.getLogger("intlyst.referral")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
APP_NAME     = os.getenv("APP_NAME", "Intlyst")

# ── Incentive Stufen ──────────────────────────────────────
INCENTIVE_TIERS = [
    {"min": 1,  "max": 2,  "reward_days": 14,  "label": "2 Wochen gratis",  "emoji": "🎁", "milestone": False},
    {"min": 3,  "max": 4,  "reward_days": 30,  "label": "1 Monat gratis",   "emoji": "⭐", "milestone": True},
    {"min": 5,  "max": 9,  "reward_days": 60,  "label": "2 Monate gratis",  "emoji": "🔥", "milestone": True},
    {"min": 10, "max": 19, "reward_days": 180, "label": "6 Monate gratis",  "emoji": "💎", "milestone": True},
    {"min": 20, "max": 49, "reward_days": 365, "label": "1 Jahr gratis",    "emoji": "👑", "milestone": True},
    {"min": 50, "max": 999,"reward_days": 9999,"label": "Lifetime gratis",  "emoji": "🏆", "milestone": True},
]

def get_tier(count: int) -> dict:
    for t in INCENTIVE_TIERS:
        if count <= t["max"]:
            return t
    return INCENTIVE_TIERS[-1]

def get_next_tier(count: int) -> Optional[dict]:
    for t in INCENTIVE_TIERS:
        if count < t["min"]:
            return t
    return None

def reward_for_count(count: int) -> int:
    """Gibt Reward-Tage für den n-ten Referral."""
    tier = get_tier(count)
    return tier["reward_days"]

# ── Models ────────────────────────────────────────────────
class ReferralCode(Base):
    __tablename__ = "referral_codes"
    id                = Column(Integer, primary_key=True)
    user_id           = Column(Integer, nullable=False, unique=True)
    code              = Column(String(10), unique=True, nullable=False)
    total_clicks      = Column(Integer, default=0)
    total_signups     = Column(Integer, default=0)
    total_active      = Column(Integer, default=0)
    total_days_earned = Column(Integer, default=0)
    is_active         = Column(Boolean, default=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    last_used_at      = Column(DateTime, nullable=True)

class ReferralEvent(Base):
    __tablename__ = "referral_events"
    id               = Column(Integer, primary_key=True)
    referrer_code    = Column(String(10), nullable=False)
    referrer_user_id = Column(Integer, nullable=False)
    referred_email   = Column(String, nullable=True)
    referred_user_id = Column(Integer, nullable=True)
    referred_name    = Column(String, nullable=True)
    event_type       = Column(String, nullable=False)
    reward_days      = Column(Integer, default=0)
    reward_applied   = Column(Boolean, default=False)
    created_at       = Column(DateTime, default=datetime.utcnow)

class ReferralReward(Base):
    __tablename__ = "referral_rewards"
    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, nullable=False)
    reward_days = Column(Integer, default=0)
    tier_label  = Column(String, nullable=True)
    is_milestone= Column(Boolean, default=False)
    reason      = Column(String)
    applied_at  = Column(DateTime, default=datetime.utcnow)

# ── Hilfsfunktionen ───────────────────────────────────────
def _gen_code() -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(chars) for _ in range(8))

def get_or_create_code(user_id: int, db: Session) -> ReferralCode:
    obj = db.query(ReferralCode).filter(
        ReferralCode.user_id == user_id
    ).first()
    if not obj:
        while True:
            code = _gen_code()
            if not db.query(ReferralCode).filter(ReferralCode.code == code).first():
                break
        obj = ReferralCode(user_id=user_id, code=code)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj

async def _fire_reward(
    referrer_user_id: int,
    referred_user_id: int,
    referred_name: str,
    code_obj: ReferralCode,
    db: Session,
):
    """Schreibt Reward gut und broadcastet Notification."""
    code_obj.total_active   += 1
    code_obj.last_used_at    = datetime.utcnow()
    n = code_obj.total_active

    days       = reward_for_count(n)
    tier       = get_tier(n)
    prev_tier  = get_tier(n - 1)
    is_ms      = tier["min"] != prev_tier["min"] and tier.get("milestone")

    reward = ReferralReward(
        user_id     = referrer_user_id,
        reward_days = days,
        tier_label  = tier["label"] if is_ms else None,
        is_milestone= bool(is_ms),
        reason      = f"Referral #{n} aktiviert ({referred_name})",
    )
    db.add(reward)
    code_obj.total_days_earned += days

    ev = ReferralEvent(
        referrer_code    = code_obj.code,
        referrer_user_id = referrer_user_id,
        referred_user_id = referred_user_id,
        referred_name    = referred_name,
        event_type       = "activated",
        reward_days      = days,
        reward_applied   = True,
    )
    db.add(ev)
    db.commit()

    try:
        from routers.websocket import send_notification_to_user
        if is_ms:
            await send_notification_to_user(
                referrer_user_id,
                f"{tier['emoji']} Milestone: {tier['label']}!",
                f"{referred_name} ist dein {n}. Referral — du hast jetzt {tier['label']} freigeschaltet!",
                "success",
            )
        else:
            await send_notification_to_user(
                referrer_user_id,
                "🎉 Neuer Referral aktiviert!",
                f"{referred_name} hat sich über deinen Link angemeldet — {days} Tage gratis für dich!",
                "success",
            )
    except Exception:
        pass

    logger.info(f"Referral reward fired: referrer={referrer_user_id}, n={n}, days={days}, milestone={is_ms}")

# ── Endpunkte ─────────────────────────────────────────────
@router.get("/my-code")
def my_code(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user.id
    obj  = get_or_create_code(user_id, db)
    n    = obj.total_active
    next = get_next_tier(n)
    curr = get_tier(n)
    url  = f"{FRONTEND_URL}/register?ref={obj.code}"

    return {
        "code":             obj.code,
        "referral_url":     url,
        "total_clicks":     obj.total_clicks,
        "total_signups":    obj.total_signups,
        "total_active":     obj.total_active,
        "total_days_earned":obj.total_days_earned,
        "current_tier":     curr,
        "next_tier":        next,
        "progress_pct": (
            round((n - (curr["min"] - 1)) /
                  (next["min"] - (curr["min"] - 1)) * 100)
            if next else 100
        ),
        "tiers": INCENTIVE_TIERS,
        "share": {
            "whatsapp":       f"https://wa.me/?text={_encode(f'Ich nutze {APP_NAME} für meine Business-Analyse — du bekommst 2 Wochen gratis: {url}')}" ,
            "email_subject":  f"2 Wochen {APP_NAME} gratis für dich",
            "email_body":     f"Hey,\n\nIch nutze {APP_NAME} für meine Geschäftsanalysen und bin begeistert.\nDu kannst es 2 Wochen komplett gratis testen:\n{url}\n\nKein Kreditkarte nötig.\n\nViele Grüße",
            "twitter":        f"https://twitter.com/intent/tweet?text={_encode(f'Gerade {APP_NAME} entdeckt — KI-Business-Analyse für KMU. 2 Wochen gratis: {url}')}" ,
            "linkedin":       f"https://www.linkedin.com/sharing/share-offsite/?url={_encode(url)}",
        },
    }

def _encode(text: str) -> str:
    from urllib.parse import quote
    return quote(text)

@router.post("/track-click/{code}")
def track_click(code: str, db: Session = Depends(get_db)):
    obj = db.query(ReferralCode).filter(ReferralCode.code == code).first()
    if obj:
        obj.total_clicks += 1
        db.commit()
    return {"ok": True}

@router.post("/register")
async def register_via_referral(
    code:       str,
    new_user_id:int,
    new_name:   str = "Neuer Nutzer",
    db: Session = Depends(get_db),
):
    """Aufgerufen wenn neuer Nutzer sich über Referral-Link registriert."""
    obj = db.query(ReferralCode).filter(
        ReferralCode.code    == code,
        ReferralCode.is_active == True,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Ungültiger Referral-Code")

    # Kein Selbst-Referral
    if obj.user_id == new_user_id:
        raise HTTPException(status_code=400, detail="Eigener Code nicht erlaubt")

    # Bereits genutzt?
    already = db.query(ReferralEvent).filter(
        ReferralEvent.referred_user_id == new_user_id,
        ReferralEvent.referrer_code    == code,
    ).first()
    if already:
        return {"ok": True, "message": "Bereits registriert"}

    obj.total_signups += 1
    ev = ReferralEvent(
        referrer_code    = code,
        referrer_user_id = obj.user_id,
        referred_user_id = new_user_id,
        referred_name    = new_name,
        event_type       = "signup",
        reward_days      = 0,
        reward_applied   = False,
    )
    db.add(ev)
    db.commit()

    # Reward sofort auslösen
    await _fire_reward(obj.user_id, new_user_id, new_name, obj, db)

    return {
        "ok":          True,
        "referrer_id": obj.user_id,
        "reward_days": reward_for_count(obj.total_active),
    }

@router.get("/history")
def history(
    current_user=Depends(get_current_user),
    limit: int = Query(20),
    db: Session = Depends(get_db),
):
    user_id = current_user.id
    obj = db.query(ReferralCode).filter(ReferralCode.user_id == user_id).first()
    if not obj:
        return {"events": [], "rewards": []}

    events = db.query(ReferralEvent).filter(
        ReferralEvent.referrer_user_id == user_id,
        ReferralEvent.event_type.in_(["signup", "activated"]),
    ).order_by(ReferralEvent.created_at.desc()).limit(limit).all()

    rewards = db.query(ReferralReward).filter(
        ReferralReward.user_id == user_id
    ).order_by(ReferralReward.applied_at.desc()).limit(10).all()

    return {
        "events": [
            {
                "name":        e.referred_name or "Anonym",
                "type":        e.event_type,
                "reward_days": e.reward_days,
                "date":        str(e.created_at)[:10],
            }
            for e in events
        ],
        "rewards": [
            {
                "days":        r.reward_days,
                "label":       r.tier_label,
                "milestone":   r.is_milestone,
                "reason":      r.reason,
                "date":        str(r.applied_at)[:10],
            }
            for r in rewards
        ],
    }

@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    """Top Referrer — anonym."""
    top = db.query(ReferralCode).filter(
        ReferralCode.total_active > 0
    ).order_by(ReferralCode.total_active.desc()).limit(10).all()

    return {
        "top": [
            {
                "rank":        i + 1,
                "code":        f"{r.code[:3]}***",
                "active":      r.total_active,
                "days_earned": r.total_days_earned,
                "tier":        get_tier(r.total_active)["label"],
                "emoji":       get_tier(r.total_active)["emoji"],
            }
            for i, r in enumerate(top)
        ]
    }

@router.get("/validate/{code}")
def validate_code(code: str, db: Session = Depends(get_db)):
    obj = db.query(ReferralCode).filter(
        ReferralCode.code     == code,
        ReferralCode.is_active == True,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Code ungültig")
    return {
        "valid":       True,
        "reward_days": 14,
        "reward_label":"2 Wochen gratis",
    }
