from datetime import timedelta
from fastapi import APIRouter,Query
from sqlalchemy import select,func
from app.api.dependencies import CurrentUser,DB
from app.models import Enrollment
from app.models.study_session import StudySession
from app.services.academics import owned_term
from app.api.v1.endpoints.study_sessions import today
router=APIRouter(prefix='/analytics',tags=['analytics'])
@router.get('/study')
def study(user:CurrentUser,db:DB,term_id:int|None=Query(None,gt=0)):
    if term_id:owned_term(db,user.id,term_id)
    start=today()-timedelta(days=6)
    query=select(StudySession.studied_on,func.sum(StudySession.duration_minutes)).join(Enrollment,Enrollment.id==StudySession.enrollment_id).where(StudySession.user_id==user.id,StudySession.archived_at.is_(None),StudySession.studied_on>=start)
    if term_id:query=query.where(Enrollment.term_id==term_id)
    counts=dict(db.execute(query.group_by(StudySession.studied_on)).all())
    days=[{'date':(start+timedelta(days=i)).isoformat(),'minutes':int(counts.get(start+timedelta(days=i),0))} for i in range(7)]
    return {'days':days,'total_minutes':sum(d['minutes'] for d in days),'today_minutes':days[-1]['minutes']}
