from pydantic import BaseModel


class NotificationSettingsResponse(BaseModel):
    # SMTP (password never returned — only whether one is stored)
    smtp_host: str | None
    smtp_port: int | None
    smtp_username: str | None
    smtp_from: str | None
    smtp_use_tls: bool
    default_email_to: str | None
    has_smtp_password: bool
    smtp_configured: bool          # host + from + (port) present
    # Teams
    teams_webhook_url: str | None
    teams_configured: bool


class NotificationSettingsUpdate(BaseModel):
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None   # write-only; stored encrypted
    smtp_from: str | None = None
    smtp_use_tls: bool | None = None
    default_email_to: str | None = None
    teams_webhook_url: str | None = None


class TestEmailRequest(BaseModel):
    to: str | None = None   # defaults to default_email_to, then the user's own email
