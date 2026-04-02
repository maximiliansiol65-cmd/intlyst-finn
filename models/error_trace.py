from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from models.base import Base


class ErrorTrace(Base):
    __tablename__ = "error_traces"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=True, index=True)
    request_id = Column(String(64), nullable=True, index=True)
    method = Column(String(16), nullable=True)
    path = Column(String(512), nullable=True, index=True)
    error_type = Column(String(255), nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    traceback_text = Column(Text, nullable=True)
    context_json = Column(Text, nullable=True)
    status_code = Column(Integer, nullable=False, default=500)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
