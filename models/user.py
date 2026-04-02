from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from models.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=True)
    company = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    # Role: ceo|management|coo|cmo|cfo|strategist|assistant|team_member|analyst|admin
    role = Column(String, nullable=False, default="admin")
    is_active = Column(Boolean, default=True)
    onboarding_done = Column(Boolean, default=False)
    active_workspace_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Extended fields for Decision Intelligence
    team_id = Column(Integer, nullable=True)          # FK to teams (soft ref to avoid circular)
    visibility_level = Column(String, nullable=False, default="full")     # full|limited|self_only
    onboarding_status = Column(String, nullable=False, default="pending") # pending|in_progress|done
    activity_status = Column(String, nullable=False, default="active")    # active|inactive
    last_login_at = Column(DateTime, nullable=True)
    preferred_view = Column(String, nullable=True)    # dashboard|tasks|analysis|planner


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False, index=True)
    # Valid roles: owner, admin, ceo, coo, cmo, cfo, strategist, assistant, manager, member
    role = Column(String, nullable=False, default="member")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "workspace_id", name="uq_workspace_membership_user_workspace"),
    )

