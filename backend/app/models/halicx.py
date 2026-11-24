"""Student-scoped HaliçX pairing and imported content; no school credentials."""
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class HalicxConnection(Base):
    __tablename__ = 'halicx_connections'
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), primary_key=True)
    term_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('academic_terms.id'), nullable=False)
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    session_version: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    selected_courses: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source_account: Mapped[str | None] = mapped_column(String(64))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(100))

class HalicxItem(Base):
    __tablename__ = 'halicx_items'
    __table_args__ = (UniqueConstraint('user_id','term_id','source_id',name='uq_halicx_source'),)
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('users.id'), nullable=False, index=True)
    term_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('academic_terms.id'), nullable=False)
    enrollment_id: Mapped[int] = mapped_column(BigInteger, ForeignKey('enrollments.id'), nullable=False)
    assignment_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey('assignments.id'))
    source_id: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    unread: Mapped[bool] = mapped_column(default=True)
    file_data: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(200))
    file_hash: Mapped[str | None] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
