"""Notification delivery: email (SMTP) and Microsoft Teams.

Both are synchronous/network calls — callers run them in a threadpool.
Functions raise on failure so callers can surface a useful error (e.g. the
"send test email" endpoint); the alert dispatcher swallows failures so a
delivery problem never loses the in-app record.
"""
import smtplib
import ssl
from email.message import EmailMessage

import httpx


def send_email(*, host: str, port: int, username: str | None, password: str | None,
               from_addr: str, to_addrs: list[str], subject: str, body: str,
               use_tls: bool = True,
               attachments: list[tuple[str, bytes, str]] | None = None) -> None:
    """Send a plain-text email via SMTP, optionally with attachments.
    Each attachment is (filename, content_bytes, mime_subtype e.g. 'csv').
    Raises on failure."""
    if not host or not from_addr or not to_addrs:
        raise ValueError("SMTP host, from address, and at least one recipient are required.")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(body)

    for filename, content, subtype in (attachments or []):
        maintype = "application"
        if subtype == "csv":
            maintype, subtype = "text", "csv"
        msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    port = port or 587
    if port == 465:
        # implicit TLS
        with smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context()) as server:
            if username and password:
                server.login(username, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            if use_tls:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if username and password:
                server.login(username, password)
            server.send_message(msg)


def send_teams(webhook_url: str, *, title: str, text: str, color: str = "EF4444") -> None:
    """Post a MessageCard to a Microsoft Teams incoming webhook. Raises on failure."""
    if not webhook_url:
        raise ValueError("Teams webhook URL is not configured.")
    card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color,
        "summary": title,
        "sections": [{
            "activityTitle": title,
            "text": text,
            "markdown": True,
        }],
    }
    resp = httpx.post(webhook_url, json=card, timeout=10)
    resp.raise_for_status()
