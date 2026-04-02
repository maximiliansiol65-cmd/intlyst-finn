# Verwendet Python's eingebautes smtplib - keine extra Dependencies nötig
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import os
from pathlib import Path
from dotenv import load_dotenv

# Lade .env relativ zur Projektroot (2 Ebenen über diesem File: services/ -> root)
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

def generate_code(length=6):
    return "".join(random.choices(string.digits, k=length))

def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Sends an email. Returns True on success, False on failure."""
    smtp_server   = os.getenv("SMTP_SERVER",   "mail.gmx.net")
    smtp_port     = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    sender_email  = os.getenv("SENDER_EMAIL",  smtp_username)

    if not smtp_username or not smtp_password:
        print(f"[EMAIL DEV MODE] To: {to_email}\nSubject: {subject}\n{html_body}")
        return True
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"INTLYST <{sender_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP(smtp_server, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.sendmail(sender_email, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False

def send_verification_code(to_email: str, code: str) -> bool:
    subject = "Dein INTLYST Bestätigungscode"
    html = f"""
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:40px auto;background:#fff;border:1px solid #000;border-radius:16px;padding:40px;">
      <div style="font-size:26px;font-weight:800;letter-spacing:0.10em;background:linear-gradient(135deg,#000,#888);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;">INTLYST</div>
      <h2 style="font-size:18px;font-weight:700;color:#1d1d1f;margin:24px 0 8px;">Dein Bestätigungscode</h2>
      <p style="color:#6e6e73;font-size:14px;margin-bottom:28px;">Gib diesen Code in der App ein um dich anzumelden:</p>
      <div style="background:#f5f5f7;border-radius:12px;padding:24px;text-align:center;font-size:36px;font-weight:800;letter-spacing:0.18em;color:#000;margin-bottom:24px;">{code}</div>
      <p style="color:#aeaeb2;font-size:12px;">Der Code ist 10 Minuten gültig. Falls du das nicht warst, ignoriere diese E-Mail.</p>
    </div>
    """
    return send_email(to_email, subject, html)

def send_notification_email(to_email: str, title: str, message: str, notif_type: str = "info") -> bool:
    icon = {"alert":"⚠️","goal":"🎯","recommendation":"💡","report":"📊"}.get(notif_type, "🔔")
    subject = f"{icon} INTLYST: {title}"
    html = f"""
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:40px auto;background:#fff;border:1px solid #000;border-radius:16px;padding:40px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.10em;color:#000;margin-bottom:24px;">INTLYST</div>
      <div style="font-size:28px;margin-bottom:12px;">{icon}</div>
      <h2 style="font-size:17px;font-weight:700;color:#1d1d1f;margin:0 0 10px;">{title}</h2>
      <p style="color:#6e6e73;font-size:14px;line-height:1.6;margin-bottom:24px;">{message}</p>
      <a href="#" style="display:inline-block;background:#000;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;">App öffnen</a>
      <p style="color:#aeaeb2;font-size:11px;margin-top:24px;">Du erhältst diese E-Mail weil du INTLYST-Benachrichtigungen aktiviert hast. Du kannst sie in den Einstellungen deaktivieren.</p>
    </div>
    """
    return send_email(to_email, subject, html)
