"""Read-only Google Classroom API and user-confirmed, idempotent imports."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
import secrets
from urllib.error import HTTPError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models import ClassroomConnection, Enrollment, Assignment
from app.services.academics import owned_term

SCOPES = ('openid', 'email', 'https://www.googleapis.com/auth/classroom.courses.readonly',
          'https://www.googleapis.com/auth/classroom.coursework.me.readonly')
KEYS = jwt.PyJWKClient('https://www.googleapis.com/oauth2/v3/certs', cache_keys=True, timeout=10)


def cipher():
    return Fernet(settings.integration_encryption_key.get_secret_value().encode())


def redirect_uri():
    return settings.public_origin + '/api/v1/integrations/google/callback'


def _json(request):
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code in (400, 401):
            raise HTTPException(409, 'Google bağlantısının yenilenmesi gerekiyor. Hesabını tekrar bağla.') from None
        if error.code == 403:
            raise HTTPException(403, 'Classroom erişimine izin verilmedi. Google izinlerini, Classroom API ayarını ve okul politikasını kontrol et.') from None
        raise HTTPException(502, 'Google Classroom şu anda yanıt veremiyor. Daha sonra tekrar dene.') from None
    except (OSError, ValueError):
        raise HTTPException(502, 'Google Classroom bağlantısı kurulamadı.') from None


def token_request(values):
    return _json(Request('https://oauth2.googleapis.com/token', method='POST',
        data=urlencode({'client_id': settings.classroom_client_id,
                        'client_secret': settings.classroom_client_secret.get_secret_value(), **values}).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'}))


def authorize(code, verifier, nonce):
    token = token_request({'code': code, 'code_verifier': verifier, 'redirect_uri': redirect_uri(), 'grant_type': 'authorization_code'})
    required = set(SCOPES[2:])
    if not required.issubset(set(token.get('scope', '').split())) or not token.get('refresh_token'):
        raise ValueError('Required offline Classroom permissions not granted')
    key = KEYS.get_signing_key_from_jwt(token['id_token']).key
    claims = jwt.decode(token['id_token'], key, algorithms=['RS256'], audience=settings.classroom_client_id,
        issuer=['https://accounts.google.com', 'accounts.google.com'],
        options={'require': ['sub', 'aud', 'iss', 'exp', 'iat', 'nonce', 'email', 'email_verified']})
    if not isinstance(claims['nonce'], str) or not secrets.compare_digest(claims['nonce'], nonce) or claims['email_verified'] is not True:
        raise ValueError('Google identity validation failed')
    if not isinstance(claims['sub'], str) or not 1 <= len(claims['sub']) <= 255 or len(claims['email']) > 254:
        raise ValueError('Invalid Google identity')
    return claims['sub'], claims['email'], cipher().encrypt(token['refresh_token'].encode()).decode()


def connection(db, user_id, lock=False):
    query = select(ClassroomConnection).where(ClassroomConnection.user_id == user_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(409, 'Önce Google Classroom hesabını bağla.')
    return row


def access_token(row):
    try:
        refresh = cipher().decrypt(row.encrypted_refresh_token.encode()).decode()
    except InvalidToken:
        raise HTTPException(409, 'Google hesabını tekrar bağlaman gerekiyor.') from None
    token = token_request({'grant_type': 'refresh_token', 'refresh_token': refresh})
    if not token.get('access_token'):
        raise HTTPException(502, 'Google erişim anahtarı alınamadı.')
    return token['access_token']


def get_all(path, key, token, **params):
    rows, page_token = [], None
    for _ in range(20):
        query = {**params, 'pageSize': 100}
        if page_token:
            query['pageToken'] = page_token
        response = _json(Request('https://classroom.googleapis.com/v1/' + path + '?' + urlencode(query),
                                 headers={'Authorization': 'Bearer ' + token}))
        rows.extend(response.get(key, []))
        page_token = response.get('nextPageToken')
        if not page_token:
            return rows
    raise HTTPException(422, 'Bu aktarım için kayıt sayısı çok fazla. Daha az ders seç.')


def list_courses(token):
    return [{'id': str(row['id']), 'name': row.get('name', '')[:500], 'section': row.get('section', '')[:200]}
            for row in get_all('courses', 'courses', token, studentId='me', courseStates='ACTIVE')]


def due_at(work):
    date = work.get('dueDate')
    if not date:
        return None
    time = work.get('dueTime')
    # Classroom defines missing dueTime as 23:59 UTC on the due date.
    time = {'hours': 23, 'minutes': 59} if time is None else time
    try:
        value = datetime(date['year'], date['month'], date['day'], time.get('hours', 0),
                         time.get('minutes', 0), time.get('seconds', 0), tzinfo=timezone.utc)
        if not 1900 <= value.year <= 2200:
            raise ValueError()
        return value.isoformat()
    except (KeyError, ValueError, TypeError):
        raise HTTPException(422, 'Classroom ödevinde geçersiz teslim tarihi var; aktarım yapılmadı.') from None


def source_id(subject, course, work=''):
    return hashlib.sha256(f'{subject}\0{course}\0{work}'.encode()).hexdigest()


def preview(db, user_id, term_id, course_ids):
    row = connection(db, user_id, lock=True)
    owned_term(db, user_id, term_id)
    token = access_token(row)
    available = {course['id']: course for course in list_courses(token)}
    if not set(course_ids).issubset(available):
        raise HTTPException(403, 'Seçilen derslerden biri bu Google hesabına ait değil.')
    data = {'term_id': term_id, 'courses': [], 'undated_count': 0}
    for course_id in dict.fromkeys(course_ids):
        course = {**available[course_id], 'assignments': []}
        for work in get_all('courses/' + quote(course_id, safe='') + '/courseWork', 'courseWork', token, courseWorkStates='PUBLISHED'):
            deadline = due_at(work)
            if deadline is None:
                data['undated_count'] += 1
                continue
            course['assignments'].append({'id': str(work['id']), 'title': work.get('title', '').strip()[:200] or 'Classroom ödevi',
                'description': work.get('description', '')[:5000] or None, 'due_at': deadline})
        data['courses'].append(course)
        if sum(len(item['assignments']) for item in data['courses']) > 2000:
            raise HTTPException(422, 'Önizlemede çok fazla ödev var. Daha az ders seç.')
    nonce = secrets.token_urlsafe(32)
    row.preview_hash = hashlib.sha256(nonce.encode()).hexdigest()
    row.preview_data = data
    row.preview_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.commit()
    return {'preview_id': nonce, **data}


def import_preview(db, user_id, preview_id):
    row = connection(db, user_id, lock=True)
    if not row.preview_hash or not secrets.compare_digest(row.preview_hash, hashlib.sha256(preview_id.encode()).hexdigest()) or not row.preview_expires_at or row.preview_expires_at <= datetime.now(timezone.utc):
        raise HTTPException(409, 'Önizleme geçersiz veya süresi dolmuş. Yeniden önizle.')
    data = row.preview_data
    term = owned_term(db, user_id, data['term_id'], lock=True)
    counts = {'courses_created': 0, 'assignments_created': 0, 'assignments_updated': 0,
              'archived_skipped': 0, 'undated_skipped': data['undated_count']}
    for course in data['courses']:
        identity = source_id(row.google_subject, course['id'])
        enrollment = db.scalar(select(Enrollment).where(Enrollment.user_id == user_id, Enrollment.term_id == term.id,
                                                         Enrollment.classroom_source_id == identity))
        if enrollment is None:
            enrollment = Enrollment(user_id=user_id, term_id=term.id, course_id=None, course_revision_id=None,
                course_code='GC-' + identity[:16].upper(), course_name=course['name'] or 'Classroom dersi',
                status='in_progress', classroom_source_id=identity)
            db.add(enrollment)
            db.flush()
            counts['courses_created'] += 1
        if enrollment.archived_at:
            counts['archived_skipped'] += len(course['assignments'])
            continue
        for work in course['assignments']:
            identity = source_id(row.google_subject, course['id'], work['id'])
            assignment = db.scalar(select(Assignment).where(Assignment.user_id == user_id,
                Assignment.enrollment_id == enrollment.id, Assignment.classroom_source_id == identity))
            if assignment is not None and assignment.archived_at:
                counts['archived_skipped'] += 1
                continue
            if assignment is None:
                assignment = Assignment(user_id=user_id, enrollment_id=enrollment.id, priority='normal',
                    status='pending', classroom_source_id=identity)
                db.add(assignment)
                counts['assignments_created'] += 1
            else:
                counts['assignments_updated'] += 1
            assignment.title, assignment.description = work['title'], work['description']
            assignment.due_at = datetime.fromisoformat(work['due_at'])
    row.last_sync_at = datetime.now(timezone.utc)
    row.preview_hash = row.preview_data = row.preview_expires_at = None
    db.commit()
    return counts
