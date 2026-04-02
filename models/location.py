from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from models.base import Base


class Location(Base):
    """
    Company location / branch model.
    Links teams to physical locations and supports location-specific KPI filtering.
    """

    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    name = Column(String(300), nullable=False)
    region = Column(String(200), nullable=True)
    country = Column(String(100), nullable=True)
    responsible_user_ids = Column(Text, nullable=True)   # JSON array of user IDs
    assigned_team_ids = Column(Text, nullable=True)      # JSON array of team IDs
    local_notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
