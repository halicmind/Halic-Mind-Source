"""School-tenant OAuth login; email claims alone never establish identity."""
from datetime import datetime, timezone
import json
import secrets
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.email_policy import normalize_student_email
from app.core.security import hash_password
from app.models import EmailVerification, User

TENANT = '23fffcb6-2a4a-4b0c-b169-a2e1a5fefa4f'
AUTHORITY = f'https://login.microsoftonline.com/{TENANT}'
ISSUER = f'{AUTHORITY}/v2.0'
KEYS = jwt.PyJWKClient(f'{AUTHORITY}/discovery/v2.0/keys', cache_keys=True, timeout=10)


def callback_uri():
    return settings.public_origin + '/api/v1/auth/microsoft/callback'


def verify_id_token(token: str, nonce: str) -> dict:
    key = KEYS.get_signing_key_from_jwt(token).key
    claims = jwt.decode(token, key, algorithms=['RS256'], audience=settings.microsoft_client_id,
                        issuer=ISSUER, options={'require': ['sub', 'exp', 'iat', 'aud', 'iss', 'tid', 'oid', 'nonce']})
    if claims['tid'] != TENANT or not isinstance(claims['nonce'], str) or not secrets.compare_digest(claims['nonce'], nonce):
        raise ValueError('Invalid Microsoft tenant or nonce')
    UUID(claims['oid'])
    return claims


def exchange_identity(code: str, verifier: str, nonce: str) -> tuple[str, str, str]:
    request = Request(f'{AUTHORITY}/oauth2/v2.0/token', method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        data=urlencode({'client_id': settings.microsoft_client_id,
                        'client_secret': settings.microsoft_client_secret.get_secret_value(),
                        'grant_type': 'authorization_code', 'code': code, 'code_verifier': verifier,
                        'redirect_uri': callback_uri(), 'scope': 'openid profile User.Read'}).encode())
    with urlopen(request, timeout=15) as response:
        token = json.load(response)
    claims = verify_id_token(token['id_token'], nonce)
    # Read UPN from the pinned tenant's directory, not the editable email claim.
    profile_request = Request('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName,displayName',
                              headers={'Authorization': 'Bearer ' + token['access_token']})
    with urlopen(profile_request, timeout=15) as response:
        profile = json.load(response)
    if profile['id'] != claims['oid']:
        raise ValueError('Microsoft directory identity mismatch')
    email = normalize_student_email(profile['userPrincipalName'])
    return str(UUID(claims['oid'])), email, (profile.get('displayName') or email)[:200]


def resolve_user(db: Session, object_id: str, email: str, name: str) -> User:
    email = normalize_student_email(email)
    object_id = str(UUID(object_id))
    user = db.scalar(select(User).where(User.microsoft_object_id == object_id).with_for_update())
    if user is not None:
        if not user.is_active or user.email != email:
            raise ValueError('Linked school account is unavailable')
        return user
    user = db.scalar(select(User).where(User.email == email).with_for_update())
    if user is not None and (not user.is_active or user.microsoft_object_id is not None):
        raise ValueError('School identity conflict')
    if user is None:
        user = User(email=email, full_name=name, hashed_password=hash_password(secrets.token_urlsafe(48)))
        db.add(user)
    elif user.email_verified_at is None:
        # A pre-created, unverified account must not retain an attacker's password/reset grant.
        user.hashed_password = hash_password(secrets.token_urlsafe(48))
        user.reset_token_hash = None
        user.reset_expires_at = None
        user.session_version += 1
        challenge = db.get(EmailVerification, user.id)
        if challenge is not None:
            db.delete(challenge)
    user.microsoft_object_id = object_id
    user.email_verified_at = user.email_verified_at or datetime.now(timezone.utc)
    db.flush()
    return user
