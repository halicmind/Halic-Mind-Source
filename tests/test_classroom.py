from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt
from pydantic import SecretStr
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.services import classroom
from tests.test_academics import academic_app, term  # noqa: F401

BASE = 'https://halicmind.test'
WEB = {'X-HalicMind-Web':'1', 'Origin':BASE}


@pytest.fixture
def google_config(monkeypatch):
    monkeypatch.setattr(settings, 'classroom_client_id', 'test-web-client')
    monkeypatch.setattr(settings, 'classroom_client_secret', SecretStr('test-web-secret'))
    monkeypatch.setattr(settings, 'integration_encryption_key', SecretStr(Fernet.generate_key().decode()))
    monkeypatch.setattr(settings, 'public_origin', BASE)


def seed_connection(env, user_id=None, subject='google-student'):
    encrypted = classroom.cipher().encrypt(b'offline-token').decode()
    env.connection.execute(text('INSERT INTO classroom_connections (user_id,google_subject,email,encrypted_refresh_token) VALUES (:uid,:sub,:email,:token)'),
        {'uid':user_id or env.owner_id, 'sub':subject, 'email':'student@gmail.com', 'token':encrypted})


@pytest.fixture
def provider(monkeypatch, google_config):
    monkeypatch.setattr(classroom, 'access_token', lambda _: 'access-token')
    monkeypatch.setattr(classroom, 'list_courses', lambda _: [{'id':'course-1','name':'Algoritma','section':'A'}])
    works = [
        {'id':'task-1','title':'Ödev 1','description':'Çözüm hazırla','dueDate':{'year':2026,'month':12,'day':2},'dueTime':{'hours':12,'minutes':30}},
        {'id':'task-2','title':'Tarihsiz ödev'},
    ]
    monkeypatch.setattr(classroom, 'get_all', lambda *args, **kwargs: works)
    return works


def prepare(env, term_id):
    response = env.client.post('/api/v1/integrations/google/preview', json={'term_id':term_id,'course_ids':['course-1']})
    assert response.status_code == 200, response.text
    return response.json()


def test_preview_import_updates_without_duplicates_and_preserves_completion(academic_app, provider):
    env = academic_app
    term_id = term(env)['id']
    seed_connection(env)
    preview = prepare(env, term_id)
    assert preview['undated_count'] == 1
    assert preview['courses'][0]['assignments'][0]['due_at'] == '2026-12-02T12:30:00+00:00'
    imported = env.client.post('/api/v1/integrations/google/import', json={'preview_id':preview['preview_id']})
    assert imported.status_code == 200, imported.text
    assert imported.json()['courses_created'] == imported.json()['assignments_created'] == 1
    assert env.client.post('/api/v1/integrations/google/import', json={'preview_id':preview['preview_id']}).status_code == 409
    assignment = env.client.get('/api/v1/assignments').json()[0]
    assert env.client.patch('/api/v1/assignments/'+str(assignment['id']),json={'status':'completed','priority':'high'}).status_code == 200
    provider[0]['title'] = 'Güncellenmiş ödev'
    provider[0]['dueTime'] = {'hours':15}
    preview = prepare(env, term_id)
    response = env.client.post('/api/v1/integrations/google/import', json={'preview_id':preview['preview_id']})
    assert response.json()['courses_created'] == response.json()['assignments_created'] == 0
    assert response.json()['assignments_updated'] == 1
    items = env.client.get('/api/v1/assignments').json()
    assert len(items) == 1 and items[0]['status'] == 'completed' and items[0]['priority'] == 'high'
    assert items[0]['title'] == 'Güncellenmiş ödev'
    assert env.client.delete('/api/v1/assignments/'+str(items[0]['id'])).status_code == 204
    preview = prepare(env, term_id)
    response = env.client.post('/api/v1/integrations/google/import', json={'preview_id':preview['preview_id']})
    assert response.json()['archived_skipped'] == 1
    assert env.client.get('/api/v1/assignments').json() == []


def test_connection_and_previews_are_owned_and_disconnect_preserves_imports(academic_app, provider):
    env = academic_app
    term_id = term(env)['id']
    seed_connection(env)
    preview = prepare(env, term_id)
    response = env.client.get('/api/v1/integrations/google', headers=env.other_headers)
    assert response.json()['connected'] is False and response.json()['email'] is None
    assert env.client.post('/api/v1/integrations/google/import', headers=env.other_headers,json={'preview_id':preview['preview_id']}).status_code == 409
    env.client.post('/api/v1/integrations/google/import',json={'preview_id':preview['preview_id']})
    assert env.client.delete('/api/v1/integrations/google').status_code == 204
    assert env.client.get('/api/v1/integrations/google').json()['connected'] is False
    assert len(env.client.get('/api/v1/enrollments').json()) == 1
    assert len(env.client.get('/api/v1/assignments').json()) == 1


def test_preview_rejects_foreign_term_and_inaccessible_course(academic_app, provider):
    env = academic_app
    term_id = term(env)['id']
    seed_connection(env)
    seed_connection(env, env.other_id, 'other-google')
    response = env.client.post('/api/v1/integrations/google/preview',headers=env.other_headers,json={'term_id':term_id,'course_ids':['course-1']})
    assert response.status_code == 404
    response = env.client.post('/api/v1/integrations/google/preview',json={'term_id':term_id,'course_ids':['unknown']})
    assert response.status_code == 403


def test_expired_preview_is_rejected(academic_app, provider):
    env = academic_app
    term_id = term(env)['id']
    seed_connection(env)
    preview = prepare(env,term_id)
    env.connection.execute(text('UPDATE classroom_connections SET preview_expires_at=:expired'),{'expired':datetime.now(timezone.utc)-timedelta(seconds=1)})
    assert env.client.post('/api/v1/integrations/google/import',json={'preview_id':preview['preview_id']}).status_code == 409


def test_oauth_is_bound_to_logged_in_user_and_never_exposes_credentials(academic_app, google_config, monkeypatch):
    env = academic_app
    calls = []
    def authorize(code, verifier, nonce):
        calls.append(code)
        assert verifier and nonce
        return 'google-student','student@gmail.com',classroom.cipher().encrypt(b'private-refresh-token').decode()
    monkeypatch.setattr(classroom, 'authorize', authorize)
    assert env.client.post(BASE+'/api/v1/integrations/google/connect').status_code == 403
    start = env.client.post(BASE+'/api/v1/integrations/google/connect', headers=WEB)
    query = parse_qs(urlsplit(start.json()['authorization_url']).query)
    assert query['code_challenge_method'] == ['S256']
    assert 'gmail.send' not in query['scope'][0]
    assert 'HttpOnly' in start.headers['set-cookie'] and 'Secure' in start.headers['set-cookie']
    callback = BASE+'/api/v1/integrations/google/callback?code=test-code&state='+query['state'][0]
    wrong = env.client.get(callback,headers=env.other_headers,follow_redirects=False)
    assert 'google=error' in wrong.headers['location'] and not calls
    start = env.client.post(BASE+'/api/v1/integrations/google/connect',headers=WEB)
    state = parse_qs(urlsplit(start.json()['authorization_url']).query)['state'][0]
    callback = BASE+'/api/v1/integrations/google/callback?code=test-code&state='+state
    response = env.client.get(callback,follow_redirects=False)
    assert 'google=connected' in response.headers['location']
    status = env.client.get('/api/v1/integrations/google')
    assert status.json()['connected'] is True
    assert 'token' not in status.text and 'secret' not in status.text
    stored = env.connection.scalar(text('SELECT encrypted_refresh_token FROM classroom_connections'))
    assert 'private-refresh-token' not in stored
    assert classroom.cipher().decrypt(stored.encode()) == b'private-refresh-token'
    env.client.get(callback,follow_redirects=False)
    assert len(calls) == 1


def test_google_due_time_defaults_and_invalid_dates():
    assert classroom.due_at({'dueDate':{'year':2026,'month':12,'day':2}}) == '2026-12-02T23:59:00+00:00'
    assert classroom.due_at({}) is None
    with pytest.raises(Exception) as error:
        classroom.due_at({'dueDate':{'year':2026,'month':2,'day':31}})
    assert error.value.status_code == 422


def test_oauth_expired_local_session_returns_to_app_without_linking(academic_app, google_config):
    env = academic_app
    response = env.client.get(BASE + '/api/v1/integrations/google/callback?code=private-code&state=bad',
                              headers={'Authorization':'Bearer expired'}, follow_redirects=False)
    assert response.status_code == 303
    assert 'google=error&reason=session' in response.headers['location']
    assert 'private-code' not in response.headers['location']
    assert env.connection.scalar(text('SELECT count(*) FROM classroom_connections')) == 0


def test_google_api_pagination_and_limits(monkeypatch):
    pages = [{'courses':[{'id':'1'}], 'nextPageToken':'next'}, {'courses':[{'id':'2'}]}]
    requests = []
    def result(request):
        requests.append(request)
        return pages.pop(0)
    monkeypatch.setattr(classroom, '_json', result)
    assert [row['id'] for row in classroom.get_all('courses','courses','token',studentId='me')] == ['1','2']
    assert parse_qs(urlsplit(requests[1].full_url).query)['pageToken'] == ['next']


@pytest.mark.parametrize('failure', ['nonce', 'issuer', 'audience', 'scope', 'email_verified', None])
def test_google_authorization_verifies_id_token_and_permissions(monkeypatch, google_config, failure):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(classroom.KEYS, 'get_signing_key_from_jwt', lambda _: SimpleNamespace(key=key.public_key()))
    now = datetime.now(timezone.utc)
    claims = {'sub':'google-student','aud':'test-web-client','iss':'https://accounts.google.com',
              'iat':now,'exp':now+timedelta(minutes=5),'nonce':'nonce','email':'student@gmail.com','email_verified':True}
    changes = {'nonce':('nonce','bad'), 'issuer':('iss','https://attacker.example'),
               'audience':('aud','other-app'), 'email_verified':('email_verified',False)}
    if failure in changes:
        field, value = changes[failure]
        claims[field] = value
    response = {'refresh_token':'private-refresh','scope':' '.join(classroom.SCOPES) if failure != 'scope' else 'openid email',
                'id_token':jwt.encode(claims,key,algorithm='RS256')}
    monkeypatch.setattr(classroom,'token_request',lambda _:response)
    if failure:
        with pytest.raises((jwt.PyJWTError, ValueError)):
            classroom.authorize('code','verifier','nonce')
    else:
        subject, email, encrypted = classroom.authorize('code','verifier','nonce')
        assert subject == 'google-student' and email == 'student@gmail.com'
        assert classroom.cipher().decrypt(encrypted.encode()) == b'private-refresh'

def test_unchanged_classroom_import_is_counted_without_false_updates(academic_app,provider):
    env=academic_app;tid=term(env)['id'];seed_connection(env)
    first=prepare(env,tid)
    env.client.post('/api/v1/integrations/google/import',json={'preview_id':first['preview_id']})
    second=prepare(env,tid)
    result=env.client.post('/api/v1/integrations/google/import',json={'preview_id':second['preview_id']})
    assert result.status_code==200
    assert result.json()['assignments_updated']==0 and result.json()['assignments_unchanged']==1
    assert env.connection.scalar(text('SELECT count(*) FROM assignments'))==1
