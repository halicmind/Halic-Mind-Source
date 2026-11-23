from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


RENDER_ORIGIN = 'https://halic-mind-source.onrender.com'
PAGES_ORIGIN = 'https://halic-mind-source.pages.dev'


class Settings(BaseSettings):
    application_name: str = Field(default='HalicMind', min_length=1, max_length=80)
    data_controller_name: str | None = Field(default=None, max_length=200)
    privacy_contact_email: str | None = Field(default=None, max_length=254)
    exam_sync_enabled: bool = True
    exam_sync_interval_seconds: int = Field(default=3600, ge=300, le=86400)
    exam_sync_ca_bundle: str | None = None
    database_url: str
    database_schema: str | None = Field(default=None, pattern=r'^[a-z][a-z0-9_]{0,62}$')
    public_origin: str | None = None
    render_external_url: str | None = None
    serve_frontend: bool = True
    classroom_client_id: str | None = None
    classroom_client_secret: SecretStr | None = None
    integration_encryption_key: SecretStr | None = None
    microsoft_client_id: str | None = None
    microsoft_client_secret: SecretStr | None = None
    microsoft_tenant_id: Literal['23fffcb6-2a4a-4b0c-b169-a2e1a5fefa4f'] = '23fffcb6-2a4a-4b0c-b169-a2e1a5fefa4f'
    mail_provider: Literal['smtp', 'resend', 'gmail'] = 'smtp'
    resend_api_key: SecretStr | None = None
    gmail_client_id: str | None = None
    gmail_client_secret: SecretStr | None = None
    gmail_refresh_token: SecretStr | None = None
    gmail_sender: str = 'halicmind@gmail.com'
    mail_from: str | None = None
    jwt_secret_key: SecretStr = Field(min_length=32)
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)
    email_verification_expire_minutes: int = Field(default=30, ge=1, le=1440)
    password_reset_expire_minutes: int = Field(default=15, ge=1, le=1440)
    smtp_host: str = '127.0.0.1'
    smtp_port: int = Field(default=1025, ge=1, le=65535)
    smtp_tls_mode: Literal['none', 'starttls', 'ssl'] = 'none'
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = 'noreply@halicmind.local'
    smtp_timeout_seconds: int = Field(default=10, ge=1, le=60)
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[3] / '.env', extra='ignore')

    @model_validator(mode='after')
    def validate_smtp(self):
        if self.render_external_url == RENDER_ORIGIN:
            self.public_origin = RENDER_ORIGIN
            self.serve_frontend = True
            self.exam_sync_enabled = True
        if self.public_origin:
            from urllib.parse import urlsplit
            origin = urlsplit(self.public_origin)
            if origin.scheme != 'https' or not origin.netloc or origin.path not in {'', '/'} or origin.query or origin.fragment or origin.username:
                raise ValueError('PUBLIC_ORIGIN must be an HTTPS origin')
            self.public_origin = self.public_origin.rstrip('/')
        if self.database_url.startswith('postgresql://'):
            self.database_url = self.database_url.replace('postgresql://', 'postgresql+psycopg://', 1)
        if self.database_schema:
            from sqlalchemy.engine import make_url
            url = make_url(self.database_url)
            options = url.query.get('options', '')
            url = url.update_query_dict({'options': f'{options} -csearch_path={self.database_schema}'.strip()})
            self.database_url = url.render_as_string(hide_password=False)
        if self.mail_provider == 'resend' and (not self.resend_api_key or not self.mail_from):
            raise ValueError('Resend requires RESEND_API_KEY and MAIL_FROM')
        if self.mail_provider == 'gmail' and not all((self.gmail_client_id, self.gmail_client_secret, self.gmail_refresh_token)):
            raise ValueError('Gmail requires GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN')
        if bool(self.microsoft_client_id) != bool(self.microsoft_client_secret):
            raise ValueError('Microsoft login requires both client ID and client secret')
        if self.microsoft_client_id and not self.public_origin:
            raise ValueError('Microsoft login requires PUBLIC_ORIGIN')
        if bool(self.classroom_client_id) != bool(self.classroom_client_secret):
            raise ValueError('Classroom requires both client ID and secret')
        if self.classroom_client_id:
            if not self.public_origin or not self.integration_encryption_key:
                raise ValueError('Classroom requires PUBLIC_ORIGIN and INTEGRATION_ENCRYPTION_KEY')
            from cryptography.fernet import Fernet
            Fernet(self.integration_encryption_key.get_secret_value().encode())
        if self.smtp_host not in {'127.0.0.1', 'localhost', '::1', 'mailpit'} and self.smtp_tls_mode == 'none':
            raise ValueError('Remote SMTP requires starttls or ssl')
        if self.smtp_username and not self.smtp_password:
            raise ValueError('SMTP_PASSWORD is required when SMTP_USERNAME is set')
        return self


settings = Settings()
