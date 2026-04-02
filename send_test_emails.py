# -*- coding: utf-8 -*-
"""Send 4 test notification emails to finn.huelskamp@icloud.com"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, r"c:\Users\T590\Desktop\intlyst-backend-main")

import os
from dotenv import load_dotenv
load_dotenv()

from services.email_service import send_email

TO = "finn.huelskamp@icloud.com"

# 1. Weekly KPI Report
weekly_html = """
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
  <div style="background:#000;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.05em">INTLYST</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:13px">Woechentlicher KPI-Bericht</p>
  </div>
  <div style="padding:32px">
    <h2 style="font-size:18px;color:#111;margin:0 0 16px">Deine Woche auf einen Blick</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="text-align:left;padding:10px 12px;font-size:13px;color:#555">KPI</th>
          <th style="text-align:right;padding:10px 12px;font-size:13px;color:#555">Diese Woche</th>
          <th style="text-align:right;padding:10px 12px;font-size:13px;color:#555">Vorwoche</th>
          <th style="text-align:right;padding:10px 12px;font-size:13px;color:#555">Trend</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 12px;font-size:14px">Umsatz</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right">12.450 &euro;</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#888">11.200 &euro;</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#22c55e">&#9650; +11.2%</td>
        </tr>
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 12px;font-size:14px">Bestellungen</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right">342</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#888">318</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#22c55e">&#9650; +7.5%</td>
        </tr>
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 12px;font-size:14px">&Oslash; Bestellwert</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right">36,40 &euro;</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#888">35,22 &euro;</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#22c55e">&#9650; +3.4%</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:14px">Neue Kunden</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right">87</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#888">94</td>
          <td style="padding:10px 12px;font-size:14px;text-align:right;color:#ef4444">&#9660; -7.4%</td>
        </tr>
      </tbody>
    </table>
    <h3 style="font-size:15px;color:#111;margin:0 0 8px">Zielfortschritt</h3>
    <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin-bottom:24px">
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#555;margin-bottom:4px">
          <span>Monatsumsatz 15.000 &euro;</span><span>83%</span>
        </div>
        <div style="background:#e5e5e5;border-radius:4px;height:8px">
          <div style="background:#000;width:83%;height:8px;border-radius:4px"></div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#555;margin-bottom:4px">
          <span>Neukunden 150/Monat</span><span>58%</span>
        </div>
        <div style="background:#e5e5e5;border-radius:4px;height:8px">
          <div style="background:#000;width:58%;height:8px;border-radius:4px"></div>
        </div>
      </div>
    </div>
    <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:14px 16px;border-radius:0 6px 6px 0;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#0c4a6e"><strong>Tipp der Woche:</strong> Dein Durchschnitts-Bestellwert steigt &ndash; das ist ein gutes Zeichen. Ueberlege, ob du gezielte Upsell-Angebote fuer Bestandskunden einfuehren kannst, um diesen Trend zu verstaerken.</p>
    </div>
    <p style="font-size:13px;color:#888;text-align:center">Intlyst &middot; Automatischer Wochenbericht</p>
  </div>
</div>
"""
print("Sending weekly report email...")
send_email(TO, "INTLYST: Dein woechentlicher KPI-Bericht - KW 13", weekly_html)
print("  Sent: Weekly report")

# 2. Critical Alert
alert_html = """
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
  <div style="background:#dc2626;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.05em">INTLYST</h1>
    <p style="color:#fca5a5;margin:4px 0 0;font-size:13px">Kritischer Umsatzalert</p>
  </div>
  <div style="padding:32px">
    <h2 style="font-size:18px;color:#dc2626;margin:0 0 8px">Umsatzrueckgang erkannt</h2>
    <p style="font-size:14px;color:#444;margin:0 0 20px">Dein Umsatz ist in den letzten 24 Stunden um <strong>-28%</strong> gegenueber dem Vortagesdurchschnitt gesunken.</p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#dc2626">Moegliche Ursachen:</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#7f1d1d;line-height:1.8">
        <li>Technisches Problem beim Checkout-Prozess</li>
        <li>Ausfall einer Zahlungsmethode (z. B. Kreditkarte / PayPal)</li>
        <li>Starke Konkurrenzaktion oder Preisunterschneidung</li>
        <li>Fehler bei einer laufenden Kampagne (falsche URL, abgelaufener Code)</li>
        <li>Saisonaler Einbruch oder verlaengertes Wochenende</li>
      </ul>
    </div>
    <div style="background:#f5f5f5;border-radius:6px;padding:16px;margin-bottom:24px">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#111">Empfohlene naechste Schritte:</p>
      <ol style="margin:0;padding-left:20px;font-size:13px;color:#444;line-height:1.8">
        <li>Checkout-Flow manuell testen (alle Zahlungsmethoden pruefen)</li>
        <li>Laufende Kampagnen auf Fehler oder abgelaufene Links pruefen</li>
        <li>Tracking-Daten (GA4, Shopify) auf Abbruchraten ueberpruefen</li>
        <li>Kundensupport auf erhoehtes Beschwerdeaufkommen pruefen</li>
        <li>Bei Bedarf: Notfall-Rabattaktion starten um Nachfrage anzukurbeln</li>
      </ol>
    </div>
    <p style="font-size:13px;color:#888;text-align:center">Intlyst &middot; Automatischer Alert</p>
  </div>
</div>
"""
print("Sending critical alert email...")
send_email(TO, "INTLYST ALERT: Umsatzrueckgang -28% erkannt", alert_html)
print("  Sent: Critical alert")

# 3. Goal Achieved
goal_html = """
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
  <div style="background:#000;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.05em">INTLYST</h1>
    <p style="color:#aaa;margin:4px 0 0;font-size:13px">Ziel erreicht!</p>
  </div>
  <div style="padding:32px;text-align:center">
    <h2 style="font-size:22px;color:#111;margin:0 0 8px">Herzlichen Glueckwunsch!</h2>
    <p style="font-size:15px;color:#555;margin:0 0 24px">Du hast dein Ziel <strong>Monatsumsatz 10.000 &euro;</strong> erreicht!</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:20px;margin-bottom:24px;text-align:left">
      <p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:#15803d">Naechstes Ziel - Vorschlag:</p>
      <p style="margin:0 0 8px;font-size:14px;color:#166534">Basierend auf deiner bisherigen Wachstumsrate empfehlen wir als naechstes Ziel:</p>
      <div style="background:#dcfce7;border-radius:6px;padding:12px;text-align:center">
        <p style="margin:0;font-size:18px;font-weight:bold;color:#15803d">Monatsumsatz 12.000 &euro;</p>
        <p style="margin:4px 0 0;font-size:12px;color:#166534">+20% gegenueber deinem letzten Ziel</p>
      </div>
    </div>
    <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin-bottom:24px;text-align:left">
      <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#111">Was jetzt?</p>
      <ul style="margin:0;padding-left:20px;font-size:13px;color:#555;line-height:1.8">
        <li>Setze das neue Ziel direkt in INTLYST</li>
        <li>Analysiere, welche Kanaele am meisten zum Erfolg beigetragen haben</li>
        <li>Dokumentiere deine erfolgreiche Strategie als Vorlage</li>
        <li>Teile den Erfolg mit deinem Team</li>
      </ul>
    </div>
    <p style="font-size:13px;color:#888">Intlyst &middot; Ziel-Benachrichtigung</p>
  </div>
</div>
"""
print("Sending goal achieved email...")
send_email(TO, "INTLYST: Ziel erreicht - Monatsumsatz 10.000 EUR geschafft!", goal_html)
print("  Sent: Goal achieved")

# 4. Sync Failure
sync_html = """
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
  <div style="background:#f59e0b;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:0.05em">INTLYST</h1>
    <p style="color:#fef3c7;margin:4px 0 0;font-size:13px">Integration Sync-Fehler</p>
  </div>
  <div style="padding:32px">
    <h2 style="font-size:18px;color:#92400e;margin:0 0 8px">Synchronisierungsfehler erkannt</h2>
    <p style="font-size:14px;color:#444;margin:0 0 20px">Bei <strong>2 deiner Integrationen</strong> sind heute Fehler aufgetreten. Deine Daten sind moeglicherweise nicht aktuell.</p>
    <div style="border:1px solid #fde68a;border-radius:6px;overflow:hidden;margin-bottom:20px">
      <div style="background:#fffbeb;padding:12px 16px;border-bottom:1px solid #fde68a">
        <p style="margin:0;font-size:14px;font-weight:bold;color:#92400e">Shopify - Authentifizierungsfehler</p>
        <p style="margin:4px 0 0;font-size:12px;color:#78350f">Fehler: 401 Unauthorized - Access Token abgelaufen</p>
      </div>
      <div style="padding:14px 16px;background:#fff">
        <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#555">Schritt-fuer-Schritt Loesung:</p>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#555;line-height:1.8">
          <li>Gehe zu <strong>Settings &rarr; Integrationen &rarr; Shopify</strong></li>
          <li>Klicke auf "Verbindung trennen"</li>
          <li>Melde dich erneut bei Shopify an und genehmige die App</li>
          <li>Klicke auf "Erneut verbinden" und teste die Verbindung</li>
        </ol>
      </div>
    </div>
    <div style="border:1px solid #fde68a;border-radius:6px;overflow:hidden;margin-bottom:24px">
      <div style="background:#fffbeb;padding:12px 16px;border-bottom:1px solid #fde68a">
        <p style="margin:0;font-size:14px;font-weight:bold;color:#92400e">Google Analytics 4 - Verbindungsfehler</p>
        <p style="margin:4px 0 0;font-size:12px;color:#78350f">Fehler: Service Account Credentials ungueltig oder abgelaufen</p>
      </div>
      <div style="padding:14px 16px;background:#fff">
        <p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#555">Schritt-fuer-Schritt Loesung:</p>
        <ol style="margin:0;padding-left:20px;font-size:13px;color:#555;line-height:1.8">
          <li>Oeffne die <strong>Google Cloud Console</strong> &rarr; IAM &rarr; Service Accounts</li>
          <li>Erstelle einen neuen JSON-Schluessel fuer den Service Account</li>
          <li>Gehe in INTLYST zu <strong>Settings &rarr; Integrationen &rarr; GA4</strong></li>
          <li>Lade den neuen JSON-Key hoch und speichere</li>
        </ol>
      </div>
    </div>
    <p style="font-size:13px;color:#888;text-align:center">Intlyst &middot; Automatische Sync-Ueberwachung</p>
  </div>
</div>
"""
print("Sending sync failure email...")
send_email(TO, "INTLYST: Sync-Fehler bei 2 Integrationen", sync_html)
print("  Sent: Sync failure")

print("\nAll 4 test emails sent to", TO)
