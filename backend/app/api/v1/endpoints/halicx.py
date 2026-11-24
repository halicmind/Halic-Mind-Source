"""HaliçX imports are scoped to one student, one term and selected courses."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
from urllib.parse import urlsplit, parse_qs
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, func
from app.api.dependencies import CurrentUser, DB
from app.core.web_security import validate_web_request
from app.models import User, Enrollment, Assignment
from app.models.halicx import HalicxConnection, HalicxItem
from app.services.academics import owned_term
from app.services.auth_limits import enforce_limit
router = APIRouter(prefix='/integrations/halicx', tags=['halicx'])
MAX_FILE = 5 * 1024 * 1024
QUOTA = 50 * 1024 * 1024

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')
class Pair(Strict):
    term_id: int = Field(gt=0)
class Item(Strict):
    id: str = Field(pattern=r'^(assign|resource|file|url|page|folder):[0-9]+(?::[a-f0-9]{16})?$')
    kind: Literal['assignment','material']
    title: str = Field(min_length=1,max_length=200)
    description: str | None = Field(default=None,max_length=10000)
    url: str = Field(max_length=2048)
    due_at: datetime | None = None
    @field_validator('url')
    @classmethod
    def source_url(cls,v):
        u=urlsplit(v)
        if u.scheme!='https' or u.netloc!='huzem.halic.edu.tr' or not u.path.startswith('/UE2/') or u.username or u.fragment or any(k.lower() in {'token','sesskey','wstoken','password'} for k in parse_qs(u.query)):
            raise ValueError('Only credential-free HaliçX source links are allowed')
        return v
    @field_validator('due_at')
    @classmethod
    def aware(cls,v):
        if v is not None and (v.tzinfo is None or not 2000<=v.year<=2100):raise ValueError('Timezone required')
        return v
class Course(Strict):
    id: str = Field(pattern=r'^[0-9]{1,12}$')
    name: str = Field(min_length=1,max_length=500)
    items: list[Item] = Field(max_length=300)
class Sync(Strict):
    account: str = Field(pattern=r'^[a-f0-9]{64}$')
    courses: list[Course] = Field(min_length=1,max_length=30)
class Selection(Strict):
    courses: list[str] = Field(min_length=1,max_length=30)
    @field_validator('courses')
    @classmethod
    def ids(cls,v):
        if len(set(v))!=len(v) or any(not x.isdigit() or len(x)>12 for x in v):raise ValueError('Invalid course IDs')
        return v

class ErrorReport(Strict):
    code: Literal['source_unavailable', 'files_incomplete', 'account_changed'] = 'source_unavailable'

@router.post('/pair')
def pair(data:Pair,request:Request,user:CurrentUser,db:DB):
    validate_web_request(request);owned_term(db,user.id,data.term_id)
    enforce_limit(db,'halicx-pair',str(user.id),5,60)
    token=secrets.token_urlsafe(32)
    row=db.get(HalicxConnection,user.id,with_for_update=True)
    if row is None:row=HalicxConnection(user_id=user.id);db.add(row)
    row.term_id=data.term_id;row.token_hash=digest(token);row.session_version=user.session_version
    row.expires_at=datetime.now(timezone.utc)+timedelta(days=90)
    row.selected_courses=[];row.source_account=None;row.last_error=None;row.last_sync_at=None
    db.commit()
    return {'pairing_key':token,'expires_at':row.expires_at}

@router.get('')
def status(user:CurrentUser,db:DB):
    row=db.get(HalicxConnection,user.id)
    valid=bool(row and row.token_hash and row.expires_at>datetime.now(timezone.utc) and row.session_version==user.session_version)
    return {'connected':valid,'paired':bool(row and row.token_hash),'term_id':row.term_id if row else None,
            'needs_repair':bool(row and row.token_hash and not valid),'expires_at':row.expires_at if row else None,
            'last_sync_at':row.last_sync_at if row else None,'last_error':row.last_error if row else None,
            'selected_courses':row.selected_courses if row else [],
            'unread':db.scalar(select(func.count()).select_from(HalicxItem).where(HalicxItem.user_id==user.id,HalicxItem.unread.is_(True)))}

@router.delete('',status_code=204)
def disconnect(request:Request,user:CurrentUser,db:DB):
    validate_web_request(request)
    row=db.get(HalicxConnection,user.id,with_for_update=True)
    if row:row.token_hash=None;row.selected_courses=[];db.commit()

def extension(request:Request,db:DB):
    # Never accept browser cookies as extension authorization.
    value=request.headers.get('authorization','')
    if not value.startswith('Bearer ') or len(value)!=50:raise HTTPException(401,'Eşleştirme anahtarı geçersiz.')
    row=db.scalar(select(HalicxConnection).where(HalicxConnection.token_hash==digest(value[7:])).with_for_update())
    if row is None or row.expires_at<=datetime.now(timezone.utc):raise HTTPException(401,'Bağlantıyı yeniden eşleştir.')
    owner_id=row.user_id
    enforce_limit(db,'halicx-extension',str(owner_id),60,60)
    # The limiter commits; reacquire the connection lock before validating and writing.
    row=db.scalar(select(HalicxConnection).where(HalicxConnection.token_hash==digest(value[7:])).execution_options(populate_existing=True).with_for_update())
    if row is None or row.expires_at<=datetime.now(timezone.utc):raise HTTPException(401,'Bağlantıyı yeniden eşleştir.')
    user=db.get(User,row.user_id,populate_existing=True)
    if not user or not user.is_active or user.email_verified_at is None or user.session_version!=row.session_version:raise HTTPException(401,'Bağlantıyı yeniden eşleştir.')
    owned_term(db,row.user_id,row.term_id)
    return row
Extension=Annotated[HalicxConnection,Depends(extension)]

@router.post('/selection')
def selection(data:Selection,row:Extension,db:DB):
    row.selected_courses=data.courses;db.commit();return {'selected':data.courses}

@router.get('/settings')
def settings(row:Extension):
    return {'selected_courses':row.selected_courses,'account':row.source_account}

@router.post('/sync')
def sync(data:Sync,row:Extension,db:DB):
    if row.source_account and row.source_account!=data.account:raise HTTPException(409,'HaliçX hesabı değişti. Yeniden eşleştir.')
    ids=[c.id for c in data.courses]
    if len(set(ids))!=len(ids) or not set(ids).issubset(set(row.selected_courses)):raise HTTPException(403,'Seçilmeyen ders aktarılamaz.')
    if sum(len(c.items) for c in data.courses)>1000:raise HTTPException(422,'Tek kontrolde en fazla 1000 içerik.')
    existing_count=db.scalar(select(func.count()).select_from(HalicxItem).where(HalicxItem.user_id==row.user_id))
    changed=0;uploads=[];archived_skipped=0
    for course in data.courses:
        code='HX-'+course.id
        enrollment=db.scalar(select(Enrollment).where(Enrollment.user_id==row.user_id,Enrollment.term_id==row.term_id,Enrollment.course_code==code,Enrollment.course_id.is_(None)).order_by(Enrollment.archived_at.asc().nullsfirst(),Enrollment.id.desc()))
        if enrollment is not None and enrollment.archived_at is not None:
            archived_skipped+=len(course.items)
            continue
        if enrollment is None:
            enrollment=Enrollment(user_id=row.user_id,term_id=row.term_id,course_code=code,course_name=course.name,status='in_progress');db.add(enrollment);db.flush()
        else:
            enrollment.course_name=course.name
        seen=set()
        for item in course.items:
            sid=course.id+':'+item.id
            if sid in seen:continue
            seen.add(sid)
            fingerprint=digest(json.dumps(item.model_dump(mode='json'),sort_keys=True))
            entry=db.scalar(select(HalicxItem).where(HalicxItem.user_id==row.user_id,HalicxItem.term_id==row.term_id,HalicxItem.source_id==sid))
            if entry is None:
                existing_count+=1
                if existing_count>5000:raise HTTPException(413,'İçerik sınırına ulaşıldı.')
                entry=HalicxItem(user_id=row.user_id,term_id=row.term_id,enrollment_id=enrollment.id,source_id=sid,file_size=0);db.add(entry)
            # Repair records from older clients that recreated an archived enrollment.
            entry.enrollment_id=enrollment.id
            content_changed=entry.content_hash!=fingerprint
            if content_changed:
                entry.unread=True;changed+=1
                entry.title=item.title;entry.description=item.description;entry.kind=item.kind;entry.source_url=item.url;entry.content_hash=fingerprint
                if item.kind=='assignment' and item.due_at:
                    assignment=db.get(Assignment,entry.assignment_id) if entry.assignment_id else None
                    if assignment is None:
                        assignment=Assignment(user_id=row.user_id,enrollment_id=enrollment.id,title=item.title,due_at=item.due_at,priority='normal',status='pending');db.add(assignment);db.flush();entry.assignment_id=assignment.id
                    if assignment.archived_at is None:
                        assignment.title=item.title;assignment.description=item.description;assignment.due_at=item.due_at
            db.flush()
            if item.id.startswith('file:'):uploads.append({'source_id':item.id,'item_id':entry.id,'file_hash':entry.file_hash,'content_changed':content_changed})
    missing_dates=sum(i.kind=='assignment' and i.due_at is None for c in data.courses for i in c.items)
    warning=f'{missing_dates} ödevin tarihi okunamadı; HaliçX üzerinden doğrula.' if missing_dates else None
    row.source_account=data.account;row.last_sync_at=datetime.now(timezone.utc);row.last_error=warning
    db.commit();return {'changed':changed,'uploads':uploads,'last_sync_at':row.last_sync_at,'warning':warning,'archived_skipped':archived_skipped}

@router.post('/error')
def report_error(request:Request,row:Extension,db:DB,data:ErrorReport=ErrorReport()):
    # No provider error text, URLs or credentials are accepted.
    row.last_error={'source_unavailable':'Bazı dersler okunamadı. HaliçX oturumunu ve eklentiyi kontrol et.',
                    'files_incomplete':'Bazı dosyalar kopyalanamadı; kaynak bağlantıları korunuyor.',
                    'account_changed':'HaliçX hesabı değişti. Eklentiyi durdurup yeniden eşleştir.'}[data.code]
    db.commit();return {'ok':True}

@router.put('/files/{item_id}')
async def upload(item_id:int,request:Request,row:Extension,db:DB):
    item=db.scalar(select(HalicxItem).where(HalicxItem.id==item_id,HalicxItem.user_id==row.user_id,HalicxItem.term_id==row.term_id).with_for_update())
    if not item or not item.source_id.split(':',1)[1].startswith('file:'):raise HTTPException(404)
    blob=bytearray()
    async for part in request.stream():
        blob.extend(part)
        if len(blob)>MAX_FILE:raise HTTPException(413,'Dosya sınırı 5 MB.')
    total=db.scalar(select(func.coalesce(func.sum(HalicxItem.file_size),0)).where(HalicxItem.user_id==row.user_id))
    if total-item.file_size+len(blob)>QUOTA:raise HTTPException(413,'Dosya kotası 50 MB.')
    fingerprint=hashlib.sha256(blob).hexdigest()
    changed=item.file_hash!=fingerprint
    if changed:
        item.file_data=bytes(blob);item.file_size=len(blob);item.file_hash=fingerprint;item.file_name=item.title;item.unread=True
    db.commit();return {'stored':True,'size':len(blob),'changed':changed}

@router.get('/items')
def items(user:CurrentUser,db:DB,limit:int=Query(200,ge=1,le=500),offset:int=Query(0,ge=0)):
    rows=db.execute(select(HalicxItem,Enrollment.course_name).join(Enrollment,Enrollment.id==HalicxItem.enrollment_id).where(HalicxItem.user_id==user.id).order_by(HalicxItem.updated_at.desc(),HalicxItem.id.desc()).offset(offset).limit(limit)).all()
    return [{'id':i.id,'enrollment_id':i.enrollment_id,'course_name':name,'term_id':i.term_id,'kind':i.kind,'title':i.title,'description':i.description,'source_url':i.source_url,'unread':i.unread,'file_size':i.file_size,'updated_at':i.updated_at} for i,name in rows]

@router.post('/items/{item_id}/read',status_code=204)
def mark_read(item_id:int,request:Request,user:CurrentUser,db:DB):
    validate_web_request(request)
    item=db.scalar(select(HalicxItem).where(HalicxItem.id==item_id,HalicxItem.user_id==user.id))
    if not item:raise HTTPException(404)
    item.unread=False;db.commit()

@router.get('/files/{item_id}')
def download(item_id:int,user:CurrentUser,db:DB):
    item=db.scalar(select(HalicxItem).where(HalicxItem.id==item_id,HalicxItem.user_id==user.id))
    if not item or item.file_data is None:raise HTTPException(404)
    from urllib.parse import quote
    return Response(item.file_data,media_type='application/octet-stream',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(item.file_name or 'ders-notu',safe=''),'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'})
