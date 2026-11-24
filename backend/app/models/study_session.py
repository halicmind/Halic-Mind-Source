"""User-owned, manually recorded study sessions."""
from datetime import date,datetime
from sqlalchemy import BigInteger,CheckConstraint,Date,DateTime,ForeignKeyConstraint,Identity,Integer,String,Text,UniqueConstraint,Uuid,func
from sqlalchemy.orm import Mapped,mapped_column
from app.db.base import Base

class StudySession(Base):
    __tablename__='study_sessions'
    __table_args__=(ForeignKeyConstraint(['enrollment_id','user_id'],['enrollments.id','enrollments.user_id'],ondelete='RESTRICT',name='fk_study_enrollment_owner'),UniqueConstraint('user_id','client_id',name='uq_study_client'),CheckConstraint('duration_minutes BETWEEN 1 AND 720',name='ck_study_duration'))
    id:Mapped[int]=mapped_column(BigInteger,Identity(),primary_key=True)
    user_id:Mapped[int]=mapped_column(BigInteger,nullable=False,index=True)
    enrollment_id:Mapped[int]=mapped_column(BigInteger,nullable=False,index=True)
    client_id:Mapped[str]=mapped_column(Uuid(as_uuid=False),nullable=False)
    studied_on:Mapped[date]=mapped_column(Date,nullable=False,index=True)
    duration_minutes:Mapped[int]=mapped_column(Integer,nullable=False)
    notes:Mapped[str|None]=mapped_column(Text)
    archived_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    created_at:Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now(),nullable=False)
