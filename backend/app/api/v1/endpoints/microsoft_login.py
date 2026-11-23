import base64
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
import jwt
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import DB
from app.core.config import settings
from app.core.security import create_access_token
from app.core.web_security import SESSION_COOKIE
from app.services import microsoft_login as microsoft

router = APIRouter(prefix='/auth/microsoft', tags=['auth'])
FLOW_COOKIE = '__Secure-halicmind_microsoft'
FLOW_PATH = '/api/v1/auth/microsoft'


def enabled():
    if not settings.microsoft_client_id:
        raise HTTPException(404, 'Microsoft girişi henüz yapılandırılmadı.')


@router.get('/start', include_in_schema=False)
def start(request: Request):
    enabled()
    origin = request.headers.get('origin')
    if origin and origin != settings.public_origin:
        raise HTTPException(403, 'Farklı bir kaynaktan giriş başlatılamaz.')
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    now = datetime.now(timezone.utc)
    flow = jwt.encode({'state': state, 'nonce': nonce, 'verifier': verifier,
                       'iat': now, 'exp': now + timedelta(minutes=10),
                       'iss': 'halicmind', 'aud': 'microsoft-oauth'},
                      settings.jwt_secret_key.get_secret_value(), algorithm='HS256')
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    response = RedirectResponse(microsoft.AUTHORITY + '/oauth2/v2.0/authorize?' + urlencode({
        'client_id': settings.microsoft_client_id, 'response_type': 'code',
        'redirect_uri': microsoft.callback_uri(), 'response_mode': 'query',
        'scope': 'openid profile User.Read', 'state': state, 'nonce': nonce,
        'code_challenge': challenge, 'code_challenge_method': 'S256', 'prompt': 'select_account',
        'domain_hint': 'ogr.halic.edu.tr',
    }), status_code=302)
    response.set_cookie(FLOW_COOKIE, flow, max_age=600, secure=True, httponly=True,
                        samesite='lax', path=FLOW_PATH)
    return response


@router.get('/callback', include_in_schema=False)
def callback(request: Request, db: DB):
    enabled()
    destination = settings.public_origin + '/#/login?microsoft_error=1'
    session_token = None
    try:
        flow = jwt.decode(request.cookies.get(FLOW_COOKIE, ''),
                          settings.jwt_secret_key.get_secret_value(), algorithms=['HS256'],
                          audience='microsoft-oauth', issuer='halicmind',
                          options={'require': ['exp', 'iat', 'state', 'nonce', 'verifier', 'iss', 'aud']})
        state = request.query_params.get('state', '')
        if not secrets.compare_digest(flow['state'], state) or request.query_params.get('error'):
            raise ValueError('Invalid OAuth response')
        code = request.query_params.get('code')
        if not code or len(code) > 8192:
            raise ValueError('Missing authorization code')
        object_id, email, name = microsoft.exchange_identity(code, flow['verifier'], flow['nonce'])
        user = microsoft.resolve_user(db, object_id, email, name)
        session_token = create_access_token(user.id, user.session_version)
        db.commit()
        destination = settings.public_origin + '/#/overview'
    except (jwt.PyJWTError, ValueError, KeyError, TypeError, OSError, IntegrityError):
        db.rollback()
        session_token = None
    response = RedirectResponse(destination, status_code=303)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_PATH, secure=True, httponly=True, samesite='lax')
    if session_token:
        response.set_cookie(SESSION_COOKIE, session_token,
                            max_age=settings.access_token_expire_minutes * 60,
                            secure=True, httponly=True, samesite='lax', path='/api/v1')
    return response
