from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from cryptography.hazmat.primitives.asymmetric import rsa
import jwt
from pydantic import SecretStr
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import User
from app.services import microsoft_login as microsoft

EMAIL = '23000000001@ogr.halic.edu.tr'
BASE = 'https://halicmind.test'


@pytest.fixture
def microsoft_config(monkeypatch):
    monkeypatch.setattr(settings, 'microsoft_client_id', 'test-client')
    monkeypatch.setattr(settings, 'microsoft_client_secret', SecretStr('test-secret'))
    monkeypatch.setattr(settings, 'public_origin', BASE)


@pytest.mark.parametrize('bad', ['nonce', 'issuer', 'audience', 'tenant', 'expired', None])
def test_id_token_signature_and_claims(monkeypatch, microsoft_config, bad):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(microsoft.KEYS, 'get_signing_key_from_jwt', lambda _: SimpleNamespace(key=key.public_key()))
    now = datetime.now(timezone.utc)
    claims = {'sub': 'subject', 'oid': str(uuid4()), 'tid': microsoft.TENANT, 'nonce': 'test-nonce',
              'iss': microsoft.ISSUER, 'aud': 'test-client', 'iat': now, 'exp': now + timedelta(minutes=5)}
    mutations = {'nonce': ('nonce', 'other'), 'issuer': ('iss', 'https://attacker.example'),
                 'audience': ('aud', 'other-client'), 'tenant': ('tid', str(uuid4())),
                 'expired': ('exp', now - timedelta(minutes=5))}
    if bad:
        field, value = mutations[bad]
        claims[field] = value
    token = jwt.encode(claims, key, algorithm='RS256')
    if bad:
        with pytest.raises((jwt.PyJWTError, ValueError)):
            microsoft.verify_id_token(token, 'test-nonce')
    else:
        assert microsoft.verify_id_token(token, 'test-nonce')['oid'] == claims['oid']


def test_start_uses_school_tenant_and_pkce(auth_app, microsoft_config):
    response = auth_app.client.get(BASE + '/api/v1/auth/microsoft/start', follow_redirects=False)
    assert response.status_code == 302
    target = urlsplit(response.headers['location'])
    query = parse_qs(target.query)
    assert microsoft.TENANT in target.path
    assert query['code_challenge_method'] == ['S256']
    assert query['scope'] == ['openid profile User.Read']
    assert query['redirect_uri'] == [BASE + '/api/v1/auth/microsoft/callback']
    assert 'HttpOnly' in response.headers['set-cookie'] and 'Secure' in response.headers['set-cookie']
    assert auth_app.client.get(BASE + '/api/v1/auth/microsoft/start', headers={'Origin':'https://attacker.example'}).status_code == 403


def test_invalid_state_never_exchanges_code(auth_app, microsoft_config, monkeypatch):
    def forbidden(*args):
        pytest.fail('A forged callback must not exchange a code')
    monkeypatch.setattr(microsoft, 'exchange_identity', forbidden)
    auth_app.client.get(BASE + '/api/v1/auth/microsoft/start', follow_redirects=False)
    response = auth_app.client.get(BASE + '/api/v1/auth/microsoft/callback?state=wrong&code=secret', follow_redirects=False)
    assert response.status_code == 303
    assert 'microsoft_error=1' in response.headers['location']
    assert 'halicmind_session=' not in response.headers.get('set-cookie', '')
    assert 'secret' not in response.headers['location']


def test_callback_creates_verified_session_and_cannot_be_replayed(auth_app, microsoft_config, monkeypatch):
    object_id = str(uuid4())
    calls = []
    def identity(code, verifier, nonce):
        assert code == 'test-code' and verifier and nonce
        calls.append(code)
        return object_id, EMAIL, 'Test Öğrenci'
    monkeypatch.setattr(microsoft, 'exchange_identity', identity)
    start = auth_app.client.get(BASE + '/api/v1/auth/microsoft/start', follow_redirects=False)
    state = parse_qs(urlsplit(start.headers['location']).query)['state'][0]
    callback = BASE + f'/api/v1/auth/microsoft/callback?code=test-code&state={state}'
    response = auth_app.client.get(callback, follow_redirects=False)
    assert response.headers['location'] == BASE + '/#/overview'
    assert 'halicmind_session=' in response.headers['set-cookie']
    assert 'HttpOnly' in response.headers['set-cookie'] and 'Secure' in response.headers['set-cookie']
    user = auth_app.client.get(BASE + '/api/v1/users/me')
    assert user.status_code == 200 and user.json()['email'] == EMAIL
    auth_app.client.get(callback, follow_redirects=False)
    assert len(calls) == 1


def test_precreated_unverified_account_cannot_retain_password(auth_app):
    with Session(bind=auth_app.connection, join_transaction_mode='create_savepoint') as db:
        user = User(email=EMAIL, full_name='Unverified', hashed_password=hash_password('attacker-password'),
                    reset_token_hash='x' * 64, reset_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5))
        db.add(user)
        db.flush()
        previous_id = user.id
        linked = microsoft.resolve_user(db, str(uuid4()), EMAIL, 'Owner')
        assert linked.id == previous_id and linked.email_verified_at is not None
        assert not verify_password('attacker-password', linked.hashed_password)
        assert linked.reset_token_hash is None and linked.session_version == 1


def test_school_identity_cannot_link_a_second_object(auth_app):
    with Session(bind=auth_app.connection, join_transaction_mode='create_savepoint') as db:
        user = microsoft.resolve_user(db, str(uuid4()), EMAIL, 'Student')
        assert microsoft.resolve_user(db, user.microsoft_object_id, EMAIL, 'Student').id == user.id
        with pytest.raises(ValueError):
            microsoft.resolve_user(db, str(uuid4()), EMAIL, 'Different identity')
        with pytest.raises(ValueError):
            microsoft.resolve_user(db, str(uuid4()), 'name@outlook.com', 'Personal account')
