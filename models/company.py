from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from models.base import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    slug = Column(String, nullable=True, unique=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Extended fields for Decision Intelligence
    industry = Column(String, nullable=True)          # e.g. SaaS, E-Commerce, Retail
    company_size = Column(String, nullable=True)      # micro|small|medium|large|enterprise
    region = Column(String, nullable=True)
    country = Column(String, nullable=True)
    growth_type = Column(String, nullable=True)       # bootstrapped|vc_backed|enterprise|startup
    team_structure = Column(Text, nullable=True)      # JSON
    primary_goal = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")   # active|paused|churned
    is_active = Column(Boolean, default=True)
    plan_tier = Column(String, nullable=False, default="free")  # free|pro|enterprise
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
