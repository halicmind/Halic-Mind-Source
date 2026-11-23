from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class ClassroomConnection(Base):
    __tablename__ = 'classroom_connections'
    __table_args__ = (UniqueConstraint('google_subject', name='uq_classroom_google_subject'),)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    google_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preview_hash: Mapped[str | None] = mapped_column(String(64))
    preview_data: Mapped[dict | None] = mapped_column(JSONB)
    preview_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
