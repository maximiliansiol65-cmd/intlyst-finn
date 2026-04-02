"""
Notification Service — sendet E-Mail-Benachrichtigungen für:
  - Wöchentlichen KPI-Report (Montags 8 Uhr)
  - Kritische Alerts (täglich 7 Uhr geprüft)
  - Ziele erreicht (täglich 8 Uhr geprüft)
  - Sync-Fehler bei Integrationen (täglich 7:30 Uhr geprüft)
"""
import logging
from datetime import date, timedelta

from sqlalchemy import text
from database import SessionLocal
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.email_preferences import EmailPreferences
from services.email_service import send_email

def _get_active_users(db):
    rows = db.execute(text("SELECT id, email FROM users WHERE is_active = 1")).fetchall()
    return [{"id": r[0], "email": r[1]} for r in rows]

logger = logging.getLogger(__name__)

METRIC_LABELS = {
    "revenue":         "Umsatz",
    "traffic":         "Traffic",
    "new_customers":   "Neue Kunden",
    "conversion_rate": "Conversion Rate",
    "conversions":     "Conversions",
}

# ── HTML-Template helper ──────────────────────────────────────────────────────

def _base_email(icon: str, title: str, body_html: str) -> str:
    return f"""
    <div style="font-family:'Segoe UI',sans-serif;max-width:520px;margin:40px auto;background:#fff;
                border:1px solid #000;border-radius:16px;padding:40px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.10em;color:#000;margin-bottom:28px;">INTLYST</div>
      <div style="font-size:32px;margin-bottom:12px;">{icon}</div>
      <h2 style="font-size:18px;font-weight:700;color:#1d1d1f;margin:0 0 14px;">{title}</h2>
      {body_html}
      <hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0 16px;">
      <p style="color:#aeaeb2;font-size:11px;margin:0;">
        Du erhältst diese E-Mail weil du INTLYST-Benachrichtigungen aktiviert hast.<br>
        Einstellungen ändern: INTLYST → Einstellungen → Benachrichtigungen
      </p>
    </div>
    """

def _row(label: str, value: str, color: str = "#1d1d1f") -> str:
    return f"""
    <tr>
      <td style="padding:8px 0;color:#6e6e73;font-size:13px;">{label}</td>
      <td style="padding:8px 0;color:{color};font-size:13px;font-weight:600;text-align:right;">{value}</td>
    </tr>"""

# ── 1. Wöchentlicher Report ───────────────────────────────────────────────────

def send_weekly_report_emails():
    """Montags 8 Uhr: sendet Wochenreport an alle Nutzer mit weekly_summary=True."""
    db = SessionLocal()
    try:
        today = date.today()
        week_ago = today - timedelta(days=7)
        two_weeks_ago = today - timedelta(days=14)

        users = _get_active_users(db)
        sent = 0
        for user in users:
            prefs = db.query(EmailPreferences).filter_by(user_id=user["id"]).first()
            if not prefs or not prefs.enabled or not prefs.weekly_summary:
                continue

            # Metriken letzte Woche vs. Vorwoche
            this_week = db.query(DailyMetrics).filter(
                DailyMetrics.date >= week_ago,
                DailyMetrics.date < today,
                DailyMetrics.period == "daily",
            ).all()
            last_week = db.query(DailyMetrics).filter(
                DailyMetrics.date >= two_weeks_ago,
                DailyMetrics.date < week_ago,
                DailyMetrics.period == "daily",
            ).all()

            def total(rows, field): return sum(getattr(r, field, 0) or 0 for r in rows)
            def pct(now, prev):
                if not prev: return ""
                diff = ((now - prev) / prev) * 100
                arrow = "↑" if diff >= 0 else "↓"
                color = "#34C759" if diff >= 0 else "#FF3B30"
                return f'<span style="color:{color};font-size:11px;margin-left:6px;">{arrow} {abs(diff):.1f}%</span>'

            rev_now  = total(this_week, "revenue")
            rev_prev = total(last_week, "revenue")
            trx_now  = total(this_week, "traffic")
            trx_prev = total(last_week, "traffic")
            cus_now  = total(this_week, "new_customers")
            cus_prev = total(last_week, "new_customers")

            rows = (
                _row("Umsatz",       f"€ {rev_now:,.0f}{pct(rev_now, rev_prev)}") +
                _row("Traffic",      f"{trx_now:,}{pct(trx_now, trx_prev)}") +
                _row("Neue Kunden",  f"{cus_now:,}{pct(cus_now, cus_prev)}")
            )

            # Ziel-Status
            goals_all = db.query(Goal).filter(Goal.end_date >= today).all()
            goals_on_track = [g for g in goals_all if current_values_week(g, this_week) >= 80] if goals_all else []

            def current_values_week(g, rows):
                val = sum(getattr(r, g.metric, 0) or 0 for r in rows)
                return round((val / g.target_value) * 100, 0) if g.target_value else 0

            goal_lines = ""
            if goals_all:
                for g in goals_all[:3]:
                    p = current_values_week(g, this_week)
                    col = "#34C759" if p >= 80 else "#FF9F0A" if p >= 50 else "#FF3B30"
                    status = "Auf Kurs ✓" if p >= 80 else "Gefährdet" if p >= 50 else "Kritisch"
                    goal_lines += f'<tr><td style="padding:6px 0;color:#6e6e73;font-size:12px;">{METRIC_LABELS.get(g.metric, g.metric)}</td><td style="padding:6px 0;font-size:12px;font-weight:600;text-align:right;color:{col};">{p:.0f}% — {status}</td></tr>'

            goals_section = f"""
            <div style="margin-top:20px;">
              <div style="font-size:12px;font-weight:700;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Ziel-Fortschritt diese Woche</div>
              <table style="width:100%;border-collapse:collapse;">{goal_lines if goal_lines else '<tr><td style="color:#aeaeb2;font-size:12px;padding:6px 0;">Noch keine Ziele gesetzt.</td></tr>'}</table>
            </div>""" if goals_all else ""

            # Tipp basierend auf Entwicklung
            if rev_prev and rev_now < rev_prev:
                tip = "Dein Umsatz ist diese Woche gesunken. Prüfe deine Traffic-Quellen und ob eine Integration Daten verloren hat."
            elif trx_prev and trx_now > trx_prev * 1.1 and (not rev_prev or rev_now <= rev_prev):
                tip = "Dein Traffic ist gestiegen, aber der Umsatz nicht. Das deutet auf ein Conversion-Problem hin — prüfe deinen Checkout-Funnel."
            elif rev_prev and rev_now > rev_prev * 1.15:
                tip = "Starkes Wachstum diese Woche! Analysiere welche Kanäle am besten performen und erhöhe dort das Budget."
            else:
                tip = "Halte deine Integrationen aktuell und setze dir für nächste Woche ein konkretes Ziel im Dashboard."

            period_str = f"{week_ago.strftime('%d.%m.')} – {(today - timedelta(days=1)).strftime('%d.%m.%Y')}"
            body = f"""
            <p style="color:#6e6e73;font-size:14px;margin:0 0 20px;">
              Dein Wochenrückblick für <strong>{period_str}</strong>
            </p>
            <table style="width:100%;border-collapse:collapse;">
              {rows}
            </table>
            {goals_section}
            <div style="margin-top:20px;background:#f5f5f7;border-radius:10px;padding:14px 16px;">
              <div style="font-size:11px;font-weight:700;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">💡 Empfehlung für diese Woche</div>
              <p style="font-size:13px;color:#3a3a3c;margin:0;line-height:1.6;">{tip}</p>
            </div>
            <a href="#" style="display:inline-block;margin-top:24px;background:#000;color:#fff;
               text-decoration:none;border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;">
              Dashboard öffnen →
            </a>
            """
            if send_email(user["email"], f"📊 Dein INTLYST Wochenbericht – {period_str}", _base_email("📊", "Wochenbericht", body)):
                sent += 1

        logger.info("WEEKLY_REPORT sent=%d", sent)
    except Exception as e:
        logger.error("WEEKLY_REPORT_ERROR %s", e)
    finally:
        db.close()


# ── 2. Kritische Alerts ───────────────────────────────────────────────────────

def check_and_send_critical_alerts():
    """Täglich 7 Uhr: prüft ob Umsatz >20% gefallen ist, schickt Alert-Mail."""
    db = SessionLocal()
    try:
        today = date.today()
        yesterday = today - timedelta(days=1)
        day_before = today - timedelta(days=2)

        yesterday_data = db.query(DailyMetrics).filter(
            DailyMetrics.date == yesterday,
            DailyMetrics.period == "daily",
        ).first()
        before_data = db.query(DailyMetrics).filter(
            DailyMetrics.date == day_before,
            DailyMetrics.period == "daily",
        ).first()

        if not yesterday_data or not before_data:
            return
        if not before_data.revenue or before_data.revenue == 0:
            return

        drop_pct = ((yesterday_data.revenue - before_data.revenue) / before_data.revenue) * 100

        if drop_pct <= -20:
            users = _get_active_users(db)
            for user in users:
                prefs = db.query(EmailPreferences).filter_by(user_id=user["id"]).first()
                if not prefs or not prefs.enabled or not prefs.alerts:
                    continue

                body = f"""
                <p style="color:#6e6e73;font-size:14px;margin:0 0 16px;">
                  Dein Umsatz ist gestern im Vergleich zum Vortag stark gefallen.
                  Handele jetzt bevor sich der Trend fortsetzt.
                </p>
                <table style="width:100%;border-collapse:collapse;">
                  {_row("Vorgestern", f"€ {before_data.revenue:,.2f}")}
                  {_row("Gestern",    f"€ {yesterday_data.revenue:,.2f}", "#FF3B30")}
                  {_row("Rückgang",   f"{drop_pct:.1f}%", "#FF3B30")}
                </table>
                <div style="margin-top:20px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:11px;font-weight:700;color:#e00;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">🔍 Mögliche Ursachen</div>
                  <ul style="margin:0;padding-left:18px;color:#6e6e73;font-size:13px;line-height:1.8;">
                    <li>Integration getrennt oder Daten nicht synchronisiert</li>
                    <li>Technisches Problem im Checkout (Zahlungsausfall)</li>
                    <li>Kampagne ausgelaufen oder Budget aufgebraucht</li>
                    <li>Saisonaler Effekt oder Feiertag</li>
                  </ul>
                </div>
                <div style="margin-top:14px;background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:11px;font-weight:700;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">✅ Nächste Schritte</div>
                  <ol style="margin:0;padding-left:18px;color:#3a3a3c;font-size:13px;line-height:1.8;">
                    <li>Integrationen prüfen — Einstellungen → Integrationen</li>
                    <li>Analyse öffnen und Traffic-Quellen vergleichen</li>
                    <li>Alerts prüfen ob weitere Anomalien vorliegen</li>
                  </ol>
                </div>
                <a href="#" style="display:inline-block;margin-top:20px;background:#000;color:#fff;
                   text-decoration:none;border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;">
                  Analyse öffnen →
                </a>
                """
                send_email(
                    user["email"],
                    f"⚠️ INTLYST Alert: Umsatzrückgang {abs(drop_pct):.0f}%",
                    _base_email("⚠️", f"Starker Umsatzrückgang: {drop_pct:.1f}%", body),
                )
            logger.info("CRITICAL_ALERT sent revenue_drop=%.1f%%", drop_pct)
    except Exception as e:
        logger.error("CRITICAL_ALERT_ERROR %s", e)
    finally:
        db.close()


# ── 3. Ziel erreicht ─────────────────────────────────────────────────────────

def check_and_send_goal_achievements():
    """Täglich 8 Uhr: prüft ob Ziele 100% erreicht wurden und benachrichtigt."""
    db = SessionLocal()
    try:
        today = date.today()
        goals = db.query(Goal).filter(Goal.end_date >= today).all()

        # Aktuelle Metriken (letzte 30 Tage summiert)
        since = today - timedelta(days=30)
        metrics_rows = db.query(DailyMetrics).filter(
            DailyMetrics.date >= since,
            DailyMetrics.period == "daily",
        ).all()

        def total(field): return sum(getattr(r, field, 0) or 0 for r in metrics_rows)

        current_values = {
            "revenue":         total("revenue"),
            "traffic":         total("traffic"),
            "new_customers":   total("new_customers"),
            "conversions":     total("conversions"),
            "conversion_rate": (
                sum(r.conversion_rate or 0 for r in metrics_rows) / len(metrics_rows)
                if metrics_rows else 0
            ),
        }

        users = _get_active_users(db)
        user_map = {u.id: u for u in users}

        for goal in goals:
            current = current_values.get(goal.metric, 0)
            if goal.target_value <= 0:
                continue
            pct = (current / goal.target_value) * 100
            if pct < 100:
                continue

            # Ziel erreicht → alle aktiven Nutzer des Workspace benachrichtigen
            for user in users:
                prefs = db.query(EmailPreferences).filter_by(user_id=user["id"]).first()
                if not prefs or not prefs.enabled or not prefs.goals:
                    continue

                label = METRIC_LABELS.get(goal.metric, goal.metric)
                next_target = round(goal.target_value * 1.2 / 100) * 100
                body = f"""
                <p style="color:#6e6e73;font-size:14px;margin:0 0 16px;">
                  Glückwunsch! Du hast dein Ziel für <strong>{label}</strong> erreicht.
                  Das ist ein wichtiger Meilenstein — nutze diesen Schwung für das nächste Ziel.
                </p>
                <table style="width:100%;border-collapse:collapse;">
                  {_row("Zielwert",    f"{goal.target_value:,.0f}")}
                  {_row("Aktuell",     f"{current:,.0f}", "#34C759")}
                  {_row("Erreicht",    f"{pct:.0f}%", "#34C759")}
                  {_row("Zeitraum",    f"{goal.start_date.strftime('%d.%m.')} – {goal.end_date.strftime('%d.%m.%Y')}")}
                </table>
                <div style="margin-top:20px;background:#f0fff4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">🚀 Vorschlag: Nächstes Ziel</div>
                  <p style="font-size:13px;color:#3a3a3c;margin:0;line-height:1.6;">
                    Setze dir für den nächsten Monat ein neues Ziel für <strong>{label}</strong>:
                    <strong>{next_target:,.0f}</strong> (+20% gegenüber aktuellem Ziel).
                    Erstelle es direkt im Dashboard unter <em>Mehr → Ziele</em>.
                  </p>
                </div>
                <div style="margin-top:14px;background:#f5f5f7;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:11px;font-weight:700;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">💡 Was jetzt?</div>
                  <ul style="margin:0;padding-left:18px;color:#3a3a3c;font-size:13px;line-height:1.8;">
                    <li>Analysiere welche Maßnahmen am meisten beigetragen haben</li>
                    <li>Setze ein höheres Ziel für den nächsten Zeitraum</li>
                    <li>Teile den Erfolg mit deinem Team</li>
                  </ul>
                </div>
                <a href="#" style="display:inline-block;margin-top:20px;background:#000;color:#fff;
                   text-decoration:none;border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;">
                  Ziele ansehen →
                </a>
                """
                send_email(
                    user["email"],
                    f"🎯 Ziel erreicht: {label}!",
                    _base_email("🎯", f"Ziel erreicht: {label}", body),
                )

        logger.info("GOAL_CHECK done goals_checked=%d", len(goals))
    except Exception as e:
        logger.error("GOAL_CHECK_ERROR %s", e)
    finally:
        db.close()


# ── 4. Sync-Fehler Integrationen ──────────────────────────────────────────────

def check_and_send_sync_failures():
    """Täglich 7:30 Uhr: prüft Integrations-Status und schickt Mail bei Fehler."""
    db = SessionLocal()
    try:
        # UserIntegrations-Modell dynamisch laden
        from models.user_integrations import UserIntegration
        from datetime import datetime, timedelta as td

        threshold = datetime.utcnow() - td(hours=25)
        failed = db.query(UserIntegration).filter(
            UserIntegration.status == "error",
        ).all()

        if not failed:
            db.close()
            return

        users = _get_active_users(db)
        for user in users:
            prefs = db.query(EmailPreferences).filter_by(user_id=user["id"]).first()
            if not prefs or not prefs.enabled or not prefs.alerts:
                continue

            user_failures = [f for f in failed if f.user_id == user["id"]]
            if not user_failures:
                continue

            FIX_HINTS = {
                "shopify":          "Prüfe ob dein Admin API Access Token noch gültig ist (Shopify Admin → Apps → API-Tokens).",
                "google_analytics": "Prüfe ob die Property ID korrekt ist und der API-Key noch aktiv (Google Analytics → Admin).",
                "stripe":           "Prüfe ob dein Stripe Secret Key noch gültig ist (Stripe Dashboard → Entwickler → API-Schlüssel).",
                "instagram":        "Prüfe ob dein Instagram Access Token abgelaufen ist — Tokens laufen alle 60 Tage ab.",
                "meta_ads":         "Prüfe ob dein Meta Access Token noch aktiv ist (Meta Business Suite → Einstellungen).",
                "woocommerce":      "Prüfe Consumer Key und Secret (WooCommerce → Einstellungen → Erweitert → REST API).",
                "mailchimp":        "Prüfe deinen Mailchimp API Key (Mailchimp → Konto → Extras → API Keys).",
                "hubspot":          "Prüfe deinen HubSpot Private App Token (HubSpot → Einstellungen → Integrationen → Private Apps).",
            }
            rows = "".join(
                _row(f.integration_type.capitalize(), "Sync-Fehler", "#FF3B30")
                for f in user_failures
            )
            hints = "".join(
                f'<li style="margin-bottom:6px;"><strong>{f.integration_type.capitalize()}:</strong> {FIX_HINTS.get(f.integration_type, "Bitte API-Schlüssel überprüfen.")}</li>'
                for f in user_failures
            )
            body = f"""
            <p style="color:#6e6e73;font-size:14px;margin:0 0 16px;">
              Bei folgenden Integrationen ist ein Synchronisationsfehler aufgetreten.
              Solange der Fehler besteht werden keine neuen Daten importiert.
            </p>
            <table style="width:100%;border-collapse:collapse;">{rows}</table>
            <div style="margin-top:20px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:14px 16px;">
              <div style="font-size:11px;font-weight:700;color:#e00;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">🔧 So behebst du den Fehler</div>
              <ul style="margin:0;padding-left:18px;color:#3a3a3c;font-size:13px;line-height:1.8;">{hints}</ul>
            </div>
            <div style="margin-top:14px;background:#f5f5f7;border-radius:10px;padding:14px 16px;">
              <div style="font-size:11px;font-weight:700;color:#1d1d1f;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">📋 Schritte</div>
              <ol style="margin:0;padding-left:18px;color:#3a3a3c;font-size:13px;line-height:1.8;">
                <li>INTLYST öffnen → Einstellungen → Integrationen</li>
                <li>Betroffene Integration anklicken → neu verbinden</li>
                <li>Neuen API-Key eintragen und speichern</li>
              </ol>
            </div>
            <a href="#" style="display:inline-block;margin-top:20px;background:#000;color:#fff;
               text-decoration:none;border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;">
              Integrationen öffnen →
            </a>
            """
            send_email(
                user["email"],
                "⚠️ INTLYST: Sync-Fehler bei Integration",
                _base_email("⚠️", "Sync-Fehler bei Integration", body),
            )

        logger.info("SYNC_CHECK failures=%d", len(failed))
    except Exception as e:
        logger.error("SYNC_CHECK_ERROR %s", e)
    finally:
        db.close()
