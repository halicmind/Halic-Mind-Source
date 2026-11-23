import base64
from email import policy
from email.parser import BytesParser
from io import BytesIO
import json
from urllib.error import HTTPError
from urllib.parse import parse_qs

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import Settings, settings
from app.services.mail import GmailMailer, MailDeliveryError, get_mailer


@pytest.fixture
def gmail_settings(monkeypatch):
    for key, value in {'mail_provider': 'gmail', 'gmail_client_id': 'test-client',
                       'gmail_client_secret': SecretStr('test-secret'),
                       'gmail_refresh_token': SecretStr('test-refresh'),
                       'gmail_sender': 'halicmind@gmail.com'}.items():
        monkeypatch.setattr(settings, key, value)


@pytest.mark.parametrize('method', ['send_verification', 'send_password_reset'])
def test_gmail_refreshes_token_and_sends_utf8_message(monkeypatch, gmail_settings, method):
    requests = []
    class Reply(BytesIO):
        status = 200
    def send(request, **kwargs):
        requests.append(request)
        if len(requests) == 1:
            assert request.full_url == 'https://oauth2.googleapis.com/token'
            data = parse_qs(request.data.decode())
            assert data['grant_type'] == ['refresh_token']
            assert data['refresh_token'] == ['test-refresh']
            return Reply(b'{"access_token":"test-access"}')
        assert request.full_url == 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
        assert request.get_header('Authorization') == 'Bearer test-access'
        message = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(json.loads(request.data)['raw']))
        assert message['From'] == 'HalicMind <halicmind@gmail.com>'
        assert message['To'] == '23000000001@ogr.halic.edu.tr'
        assert 'one-time-code' in message.get_content()
        assert 'doğrula' in message['Subject'] if method == 'send_verification' else 'sıfırlama' in message['Subject']
        return Reply(b'{"id":"sent"}')
    monkeypatch.setattr('app.services.mail.urlopen', send)
    assert isinstance(get_mailer(), GmailMailer)
    getattr(get_mailer(), method)('23000000001@ogr.halic.edu.tr', 'one-time-code')
    assert len(requests) == 2


def test_revoked_gmail_grant_fails_without_sending(monkeypatch, gmail_settings):
    calls = []
    def fail(request, **kwargs):
        calls.append(request)
        raise HTTPError(request.full_url, 400, 'invalid_grant', {}, None)
    monkeypatch.setattr('app.services.mail.urlopen', fail)
    with pytest.raises(MailDeliveryError, match='Email could not be delivered through Gmail'):
        GmailMailer().send_verification('23000000001@ogr.halic.edu.tr', 'code')
    assert len(calls) == 1


def test_gmail_requires_all_oauth_credentials():
    values = dict(_env_file=None, database_url='postgresql://unused', jwt_secret_key='a' * 64, mail_provider='gmail')
    with pytest.raises(ValidationError):
        Settings(**values)
    config = Settings(**values, gmail_client_id='client', gmail_client_secret='secret', gmail_refresh_token='refresh')
    assert config.gmail_sender == 'halicmind@gmail.com'
    assert 'refresh' not in str(config.gmail_refresh_token)
