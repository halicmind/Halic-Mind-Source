from datetime import date,datetime,timedelta,timezone
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter,HTTPException,Query
from pydantic import BaseModel,BeforeValidator,ConfigDict,Field,field_validator
from sqlalchemy import select
from app.api.dependencies import CurrentUser,DB
from app.models import Enrollment,User
from app.models.study_session import StudySession
from app.services.academics import commit,owned_term
from app.services.enrollments import owned_enrollment
from app.services.auth_limits import enforce_limit
router=APIRouter(prefix='/study-sessions',tags=['study'])

def today():return datetime.now(timezone(timedelta(hours=3))).date()
class StudyWrite(BaseModel):
    model_config=ConfigDict(extra='forbid')
    enrollment_id:int=Field(gt=0)
    client_id:UUID
    studied_on:date
    duration_minutes:int=Field(ge=1,le=720)
    notes:Annotated[str|None,BeforeValidator(lambda v:v.strip() or None if isinstance(v,str) else v)]=Field(default=None,max_length=2000)
    @field_validator('studied_on')
    @classmethod
    def actual_date(cls,v):
        if v.year<1900 or v>today():raise ValueError('Çalışma tarihi geçmişte veya bugün olmalıdır.')
        return v

def payload(row,course):
    return {k:getattr(row,k) for k in ['id','enrollment_id','client_id','studied_on','duration_minutes','notes','archived_at','created_at']}|{'term_id':course.term_id,'course_name':course.course_name,'course_code':course.course_code}

@router.post('',status_code=201)
def create(data:StudyWrite,user:CurrentUser,db:DB):
    enforce_limit(db,'study-create',str(user.id),30,60)
    db.scalar(select(User).where(User.id==user.id).with_for_update())
    course=owned_enrollment(db,user.id,data.enrollment_id,include_archived=True)
    # Same term lock as enrollment archiving and concurrent duplicate submissions.
    owned_term(db,user.id,course.term_id,lock=True);db.refresh(course)
    row=db.scalar(select(StudySession).where(StudySession.user_id==user.id,StudySession.client_id==str(data.client_id)))
    if row:
        if (row.enrollment_id,row.studied_on,row.duration_minutes,row.notes)!=(data.enrollment_id,data.studied_on,data.duration_minutes,data.notes):raise HTTPException(409,'Bu çalışma kaydı zaten farklı bilgilerle kaydedildi.')
        return payload(row,course)
    if course.archived_at:raise HTTPException(409,'Önce arşivli dersi geri yükle.')
    row=StudySession(user_id=user.id,**(data.model_dump()|{'client_id':str(data.client_id)}));db.add(row);commit(db);return payload(row,course)

@router.get('')
def listing(user:CurrentUser,db:DB,term_id:int|None=Query(None,gt=0),include_archived:bool=False,limit:int=Query(200,ge=1,le=200),offset:int=Query(0,ge=0)):
    if term_id:owned_term(db,user.id,term_id)
    query=select(StudySession,Enrollment).join(Enrollment,Enrollment.id==StudySession.enrollment_id).where(StudySession.user_id==user.id)
    if term_id:query=query.where(Enrollment.term_id==term_id)
    if not include_archived:query=query.where(StudySession.archived_at.is_(None))
    return [payload(r,c) for r,c in db.execute(query.order_by(StudySession.studied_on.desc(),StudySession.id.desc()).limit(limit).offset(offset))]

def owned(db,user_id,identifier):
    row=db.scalar(select(StudySession).where(StudySession.id==identifier,StudySession.user_id==user_id).with_for_update())
    if not row:raise HTTPException(404,'Çalışma kaydı bulunamadı.')
    return row
@router.delete('/{identifier}',status_code=204)
def archive(identifier:int,user:CurrentUser,db:DB):
    row=owned(db,user.id,identifier);row.archived_at=row.archived_at or datetime.now(timezone.utc);commit(db)
@router.post('/{identifier}/restore')
def restore(identifier:int,user:CurrentUser,db:DB):
    row=owned(db,user.id,identifier);row.archived_at=None;commit(db);return payload(row,db.get(Enrollment,row.enrollment_id))
