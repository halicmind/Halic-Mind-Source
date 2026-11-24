from fastapi import APIRouter

from app.api.dependencies import CurrentUser,DB
from app.schemas.user import UserRead

router = APIRouter(prefix='/users', tags=['users'])


@router.get('/me', response_model=UserRead)
def me(user: CurrentUser):
    return user

@router.get('/me/export')
def export_my_data(user:CurrentUser,db:DB):
    from datetime import datetime,timezone
    from fastapi.encoders import jsonable_encoder
    from fastapi.responses import JSONResponse
    from sqlalchemy import select
    from app.models import AcademicProfile,AcademicTerm,Enrollment,Assignment
    from app.models.study_session import StudySession
    from app.models.halicx import HalicxItem
    from app.services.auth_limits import enforce_limit
    enforce_limit(db,'data-export',str(user.id),3,60)
    def records(model,fields):
        return [{key:getattr(row,key) for key in fields} for row in db.scalars(select(model).where(model.user_id==user.id))]
    data={'exported_at':datetime.now(timezone.utc),'user':{'id':user.id,'full_name':user.full_name,'email':user.email},
          'profile':records(AcademicProfile,['program_id','curriculum_id','entry_year','current_class','preparation_status']),
          'terms':records(AcademicTerm,['id','academic_year','term_type','program_id','curriculum_id','is_preparation']),
          'courses':records(Enrollment,['id','term_id','course_code','course_name','status','grade','ects','archived_at']),
          'assignments':records(Assignment,['id','enrollment_id','title','description','due_at','status','priority','completed_at','archived_at']),
          'study_sessions':records(StudySession,['id','enrollment_id','studied_on','duration_minutes','notes','archived_at']),
          'materials':records(HalicxItem,['id','term_id','enrollment_id','title','description','kind','source_url','file_size','unread']),
          'note':'Dosya kopyaları bu JSON içinde yer almaz; Materyaller ekranından ayrı indirilebilir.'}
    return JSONResponse(jsonable_encoder(data),headers={'Content-Disposition':'attachment; filename="halicmind-verilerim.json"','Cache-Control':'no-store'})
