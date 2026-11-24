import base64
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
import jwt
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentUser, DB
from app.core.config import settings
from app.core.web_security import validate_web_request
from app.models import ClassroomConnection
from app.services import classroom
from app.services.auth_limits import enforce_limit

router = APIRouter(prefix='/integrations', tags=['integrations'])
FLOW_COOKIE = '__Secure-halicmind_classroom'
FLOW_PATH = '/api/v1/integrations/google'


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    term_id: int = Field(gt=0)
    course_ids: list[str] = Field(min_length=1, max_length=20)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    preview_id: str = Field(pattern=r'^[A-Za-z0-9_-]{43}$')


def enabled():
    if not settings.classroom_client_id:
        raise HTTPException(404, 'Google Classroom henüz yapılandırılmadı.')


@router.get('/google')
def status(user: CurrentUser, db: DB):
    row = db.get(ClassroomConnection, user.id)
    return {'enabled': bool(settings.classroom_client_id), 'connected': row is not None,
            'email': row.email if row else None, 'last_sync_at': row.last_sync_at if row else None}


@router.post('/google/connect')
def connect(request: Request, user: CurrentUser):
    enabled()
    validate_web_request(request)
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    now = datetime.now(timezone.utc)
    flow = jwt.encode({'state': state, 'nonce': nonce, 'verifier': verifier,
                       'uid': user.id, 'ver': user.session_version, 'iat': now,
                       'exp': now + timedelta(minutes=10), 'iss': 'halicmind', 'aud': 'classroom-oauth'},
                      settings.jwt_secret_key.get_secret_value(), algorithm='HS256')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode({
        'client_id': settings.classroom_client_id, 'redirect_uri': classroom.redirect_uri(),
        'response_type': 'code', 'scope': ' '.join(classroom.SCOPES), 'access_type': 'offline',
        'prompt': 'consent select_account', 'state': state, 'nonce': nonce,
        'code_challenge': challenge, 'code_challenge_method': 'S256',
    })
    response = JSONResponse({'authorization_url': url})
    response.set_cookie(FLOW_COOKIE, flow, max_age=600, secure=True, httponly=True, samesite='lax', path=FLOW_PATH)
    return response


@router.get('/google/callback', include_in_schema=False)
def callback(request: Request, user: CurrentUser, db: DB):
    enabled()
    result = 'error'
    try:
        flow = jwt.decode(request.cookies.get(FLOW_COOKIE, ''), settings.jwt_secret_key.get_secret_value(),
                          algorithms=['HS256'], audience='classroom-oauth', issuer='halicmind',
                          options={'require': ['exp', 'iat', 'uid', 'ver', 'state', 'nonce', 'verifier']})
        if flow['uid'] != user.id or flow['ver'] != user.session_version or not secrets.compare_digest(flow['state'], request.query_params.get('state', '')):
            raise ValueError('Invalid Classroom OAuth state')
        code = request.query_params.get('code')
        if request.query_params.get('error') or not code or len(code) > 8192:
            raise ValueError('Missing Google authorization')
        subject, email, encrypted_token = classroom.authorize(code, flow['verifier'], flow['nonce'])
        row = db.get(ClassroomConnection, user.id, with_for_update=True)
        if row is None:
            row = ClassroomConnection(user_id=user.id)
            db.add(row)
        row.google_subject, row.email, row.encrypted_refresh_token = subject, email, encrypted_token
        row.connected_at = datetime.now(timezone.utc)
        row.preview_hash = row.preview_data = row.preview_expires_at = None
        db.commit()
        result = 'connected'
    except (jwt.PyJWTError, ValueError, KeyError, TypeError, OSError, HTTPException, IntegrityError):
        db.rollback()
    response = RedirectResponse(settings.public_origin + '/app/#/connections?google=' + result, status_code=303)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_PATH, secure=True, httponly=True, samesite='lax')
    return response


@router.delete('/google', status_code=204)
def disconnect(user: CurrentUser, db: DB):
    row = db.get(ClassroomConnection, user.id, with_for_update=True)
    if row:
        db.delete(row)
        db.commit()


@router.get('/google/courses')
def courses(user: CurrentUser, db: DB):
    enabled()
    row = classroom.connection(db, user.id)
    return classroom.list_courses(classroom.access_token(row))


@router.post('/google/preview')
def preview(data: PreviewRequest, user: CurrentUser, db: DB):
    enabled()
    if any(not course_id or len(course_id) > 255 for course_id in data.course_ids):
        raise HTTPException(422, 'Geçersiz Classroom ders kimliği.')
    enforce_limit(db, 'classroom-preview', str(user.id), 5, 60)
    return classroom.preview(db, user.id, data.term_id, data.course_ids)


@router.post('/google/import')
def import_preview(data: ImportRequest, user: CurrentUser, db: DB):
    enabled()
    try:
        return classroom.import_preview(db, user.id, data.preview_id)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Ders veya ödev kaydı çakıştı. Yeniden önizle ve aktar.') from None
