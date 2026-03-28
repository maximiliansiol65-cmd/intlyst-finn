import React, { useState, useMemo } from 'react';
import '../styles/ReportsHub.css';

export default function ReportsHub() {
  const [activePanel, setActivePanel] = useState('reports');
  const [selectedReportType, setSelectedReportType] = useState('monthly');
  const [period, setPeriod] = useState('März 2025');
  const [recipient, setRecipient] = useState('Geschäftsführung');
  const [company, setCompany] = useState('Acme GmbH');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [bookmarks, setBookmarks] = useState([
    { id: 1, text: 'Mobile Conversion-Rate sank um 18% — Hauptursache: Checkout-Fehler auf iOS Safari 17. Dringende UX-Optimierung nötig.', source: 'chat', date: '18. März 2025', tags: ['Conversion', 'Mobile'] },
    { id: 2, text: 'Preiserhöhung um +20% führt zu erwartetem Netto-Umsatz-Plus von +9%. Break-even liegt bei −18% Conversion — aktuell sicher.', source: 'report', date: '15. März 2025', tags: ['Preis', 'Umsatz'] },
    { id: 3, text: 'TikTok-Kanal zeigt nach 3 Tagen 4,8% Engagement-Rate. Empfehlung: 3× wöchentlich posten für optimales Wachstum/Aufwand-Verhältnis.', source: 'chat', date: '14. März 2025', tags: ['TikTok', 'Social'] },
    { id: 4, text: 'Newsletter-Segmentierung erhöhte CTR um 34%. Segment \'Power User\' konvertiert 3× besser als Gesamtliste.', source: 'report', date: '10. März 2025', tags: ['Newsletter', 'Segmentierung'] }
  ]);
  const [currentFilter, setCurrentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  const chatHistory = [
    { id: 1, title: 'Mobile Conversion-Analyse März', preview: 'Warum sinkt die mobile Conversion-Rate? Analyse der letzten 7 Tage nach Gerät, Browser und Checkout-Schritt...', date: '18. März', tags: ['Conversion', 'Mobile', 'Analyse'] },
    { id: 2, title: 'TikTok Strategie & Kanal-Planung', preview: 'Was-wäre-wenn: Szenario-Vergleich für TikTok-Posting-Frequenz. Erwartete Reichweite, Follower-Wachstum und Traffic-Effekte...', date: '14. März', tags: ['TikTok', 'Social', 'Strategie'] },
    { id: 3, title: 'Preis-Simulation +20%', preview: 'Simulation einer Preiserhöhung um 20%. Conversion-Elastizität, Netto-Umsatz-Effekt und Break-even-Berechnung...', date: '12. März', tags: ['Preis', 'Simulation'] },
    { id: 4, title: 'Newsletter-Performance Q1', preview: 'Analyse der Newsletter-Kampagnen Januar–März. Segmentierung, Open-Rates, CTR und Conversion nach Segment...', date: '10. März', tags: ['Newsletter', 'Email', 'Q1'] },
    { id: 5, title: 'Wöchentlicher KPI-Check KW11', preview: 'Übersicht aller KPIs für Kalenderwoche 11. Traffic, Conversion, Revenue, CAC, LTV und Benchmark-Vergleiche...', date: '8. März', tags: ['KPIs', 'Weekly'] },
    { id: 6, title: 'GA4 Funnel-Analyse', preview: 'Schritt-für-Schritt Funnel-Analyse im GA4. Drop-off-Punkte identifiziert: Produktseite → Warenkorb am kritischsten...', date: '5. März', tags: ['GA4', 'Funnel', 'Analyse'] },
    { id: 7, title: 'Wettbewerber-Monitoring', preview: 'Preisvergleich und Feature-Analyse der Top-3 Wettbewerber. Positionierungsempfehlungen basierend auf aktuellen Marktdaten...', date: '1. März', tags: ['Wettbewerb', 'Strategie'] }
  ];

  const summaryTopics = [
    { icon: '📱', title: 'Mobile Conversion-Krise', count: 3, desc: '3 Gespräche über mobile UX-Probleme und Checkout-Fehler. Höchste Priorität.', urgent: true },
    { icon: '📺', title: 'TikTok-Kanal Aufbau', count: 2, desc: 'Strategie und erste Ergebnisse. Empfehlung: 3× wöchentlich für optimales Ergebnis.', urgent: false },
    { icon: '💰', title: 'Preis-Optimierung', count: 1, desc: '+20%-Test läuft stabil. Nächster Schritt: Auswertung nach 30 Tagen.', urgent: false }
  ];

  const reportTypes = [
    { key: 'monthly', icon: '📋', title: 'Monatsreport', desc: 'Vollständige Analyse mit Executive Summary, KPI-Entwicklung und Empfehlungen', tags: ['PDF', 'KPIs', 'Empfehlungen'] },
    { key: 'investor', icon: '📈', title: 'Investoren-Report', desc: 'Professionelles Investor Update mit MRR, Wachstum und strategischem Ausblick', tags: ['MRR', 'Wachstum', 'Ausblick'] },
    { key: 'team', icon: '👥', title: 'Team-Report', desc: 'Einfache wöchentliche Zusammenfassung für Mitarbeiter — Ziele und Ergebnisse', tags: ['Wöchentlich', 'Ziele', 'Einfach'] }
  ];

  const reportTemplates = {
    monthly: `
      <h1>Monatsreport</h1>
      <div class="report-meta">Acme GmbH · ${period} · Erstellt am ${new Date().toLocaleDateString('de-DE')}</div>
      <h2>Executive Summary</h2>
      <p>Der Monat März 2025 verlief insgesamt positiv — Umsatz und MRR wuchsen trotz eines temporären Rückgangs der mobilen Conversion-Rate. Das Hauptrisiko bleibt die mobile UX, die dringend adressiert werden muss.</p>
      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-label">MRR</div><div class="kpi-val">€42.800</div><div class="kpi-delta up">↑ +12% ggü. Vormonat</div></div>
        <div class="kpi-box"><div class="kpi-label">Conversion Rate</div><div class="kpi-val">2,8%</div><div class="kpi-delta down">↓ −0,6pp mobile</div></div>
        <div class="kpi-box"><div class="kpi-label">CAC</div><div class="kpi-val">€68</div><div class="kpi-delta up">↑ effizienter</div></div>
        <div class="kpi-box"><div class="kpi-label">LTV:CAC</div><div class="kpi-val">4,2×</div><div class="kpi-delta up">↑ Ziel: 3×</div></div>
      </div>
      <h2>Was funktioniert hat</h2>
      <ul class="bullet-list">
        <li>Newsletter-Segmentierung → CTR +34%, Power-User-Segment konvertiert 3× besser</li>
        <li>Preistest +20% läuft stabil: Netto-Umsatz-Effekt +9%, Break-even sicher</li>
        <li>TikTok-Kanal gestartet: 4,8% Engagement in der ersten Woche</li>
      </ul>
      <h2>Herausforderungen</h2>
      <ul class="bullet-list">
        <li>Mobile Conversion-Rate −18% (Hauptursache: iOS Safari 17 Checkout-Bug)</li>
        <li>CAC im Paid-Kanal gestiegen (+8%) durch höhere CPMs auf Meta</li>
      </ul>
      <h2>Empfehlungen für April 2025</h2>
      <div class="rec-box"><p>🔴 <strong>Priorität 1:</strong> Mobile Checkout-Bug (iOS Safari 17) bis 1. April beheben — geschätztes Upside: +€5.000 MRR.</p></div>
      <div class="rec-box"><p>🟡 <strong>Priorität 2:</strong> TikTok auf 3× wöchentlich skalieren — prognostizierter Traffic-Effekt: +14%.</p></div>
      <div class="rec-box"><p>🟢 <strong>Priorität 3:</strong> Preistest nach 30 Tagen auswerten und ggf. dauerhaft einführen.</p></div>
    `,
    investor: `
      <h1>Investor Update</h1>
      <div class="report-meta">Acme GmbH · ${period} · Vertraulich · Nur für Investoren</div>
      <h2>Highlights</h2>
      <p>Starkes Quartal mit MRR-Wachstum von +12% MoM. Wir haben unsere Preis-Hypothese validiert und skalieren nun den TikTok-Kanal für organisches Wachstum.</p>
      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-label">MRR</div><div class="kpi-val">€42.800</div><div class="kpi-delta up">↑ +12% MoM</div></div>
        <div class="kpi-box"><div class="kpi-label">ARR (Proj.)</div><div class="kpi-val">€513.600</div><div class="kpi-delta up">↑ Run Rate</div></div>
        <div class="kpi-box"><div class="kpi-label">Churn</div><div class="kpi-val">1,4%</div><div class="kpi-delta up">↓ −0,3pp</div></div>
        <div class="kpi-box"><div class="kpi-label">NPS</div><div class="kpi-val">61</div><div class="kpi-delta up">↑ +4 Punkte</div></div>
      </div>
      <h2>Key Metrics</h2>
      <ul class="bullet-list">
        <li>Paying Customers: 284 (+23 ggü. Vormonat)</li>
        <li>LTV:CAC Ratio: 4,2× (Ziel: 3×, stabil übertroffen)</li>
        <li>Gross Margin: 78% (SaaS-Benchmark: 70–80%)</li>
      </ul>
      <h2>Strategischer Ausblick Q2 2025</h2>
      <p>Drei strategische Fokusthemen: (1) Mobile UX-Optimierung zur Wiederherstellung der vollen Conversion-Rate, (2) TikTok-Skalierung als organischer Growth-Kanal, (3) Preisarchitektur-Review für Enterprise-Tier.</p>
      <h2>Use of Funds (letzte 30 Tage)</h2>
      <ul class="bullet-list">
        <li>Product & Engineering: 45%</li>
        <li>Sales & Marketing: 35%</li>
        <li>Operations & G&A: 20%</li>
      </ul>
    `,
    team: `
      <h1>Team-Update</h1>
      <div class="report-meta">Acme GmbH · Woche 12, ${period} · Für alle Mitarbeiter</div>
      <h2>🎯 Was war diese Woche unser Ziel?</h2>
      <p>Wir wollten die mobile Conversion-Rate stabilisieren, den TikTok-Kanal offiziell starten und die Newsletter-Segmentierung produktiv schalten.</p>
      <h2>✅ Was haben wir erreicht?</h2>
      <ul class="bullet-list">
        <li>TikTok-Kanal live — erste Woche mit 4,8% Engagement-Rate</li>
        <li>Newsletter-Segmentierung aktiv — Power-User-Segment schon +34% CTR</li>
        <li>Bug-Ticket für iOS Safari Checkout erstellt und priorisiert</li>
      </ul>
      <h2>❌ Was hat nicht geklappt?</h2>
      <ul class="bullet-list">
        <li>Mobile Checkout-Bug noch offen — verschiebt sich auf nächste Woche</li>
      </ul>
      <h2>🚀 Nächste Woche</h2>
      <div class="rec-box"><p>Fokus: Mobile Bug fixen, TikTok-Posting-Plan für 3× wöchentlich aufsetzen, Preis-Test-Auswertung vorbereiten.</p></div>
      <p style="margin-top:1rem; font-size:13px; color:var(--c-text-3);">Fragen? Einfach im #team-channel melden. 👋</p>
    `
  };

  const handleGenerateReport = () => {
    setGeneratingReport(true);
    setTimeout(() => {
      setGeneratingReport(false);
      setReportGenerated(true);
    }, 1400);
  };

  const handleBookmarkReport = () => {
    const newBookmark = {
      id: Date.now(),
      text: selectedReportType === 'monthly'
        ? `Monatsreport ${period}: MRR +12%, mobile CR −18%, Top-Priorität: iOS Safari Checkout-Fix.`
        : selectedReportType === 'investor'
        ? `Investor Update: MRR €42.800 (+12% MoM), ARR-Run-Rate €513.600, LTV:CAC 4,2×.`
        : `Team-Update: TikTok live mit 4,8% Engagement. Mobile Bug noch offen — nächste Woche Priorität 1.`,
      source: 'report',
      date: new Date().toLocaleDateString('de-DE'),
      tags: ['Report', selectedReportType === 'monthly' ? 'Monat' : selectedReportType === 'investor' ? 'Investor' : 'Team']
    };
    setBookmarks([newBookmark, ...bookmarks]);
    showToast('Erkenntnis gespeichert! 🔖');
  };

  const filteredBookmarks = useMemo(() => {
    let items = bookmarks;
    if (currentFilter !== 'all') {
      items = items.filter(b => b.source === currentFilter);
    }
    if (searchQuery) {
      items = items.filter(b =>
        b.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    return items;
  }, [bookmarks, currentFilter, searchQuery]);

  const filteredHistory = useMemo(() => {
    return chatHistory.filter(h =>
      h.title.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      h.preview.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
      h.tags.some(t => t.toLowerCase().includes(historySearchQuery.toLowerCase()))
    );
  }, [historySearchQuery]);

  const showToast = (msg) => {
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: var(--c-primary);
      color: white;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  };

  const removeInsight = (id) => {
    setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  return (
    <div className="reports-hub">
      <div className="rh-topbar">
        <div className="rh-topbar-logo">Report<span>Hub</span></div>
        <div className="rh-topbar-right">
          <span className="rh-topbar-pill">{period}</span>
          <span className="rh-topbar-pill">Demo-Modus</span>
        </div>
      </div>

      <div className="rh-container">
        <nav className="rh-sidebar">
          <div className="rh-sidebar-section">
            <div className="rh-sidebar-heading">Reports</div>
            <div
              className={`rh-nav-item ${activePanel === 'reports' ? 'active' : ''}`}
              onClick={() => setActivePanel('reports')}
            >
              <span className="rh-nav-icon">📊</span>
              Report erstellen
            </div>
          </div>
          <div className="rh-sidebar-section">
            <div className="rh-sidebar-heading">Insights</div>
            <div
              className={`rh-nav-item ${activePanel === 'bookmarks' ? 'active' : ''}`}
              onClick={() => setActivePanel('bookmarks')}
            >
              <span className="rh-nav-icon">🔖</span>
              Gespeicherte Erkenntnisse
              <span className="rh-nav-badge">{bookmarks.length}</span>
            </div>
            <div
              className={`rh-nav-item ${activePanel === 'history' ? 'active' : ''}`}
              onClick={() => setActivePanel('history')}
            >
              <span className="rh-nav-icon">💬</span>
              Chat-History
            </div>
            <div
              className={`rh-nav-item ${activePanel === 'summary' ? 'active' : ''}`}
              onClick={() => setActivePanel('summary')}
            >
              <span className="rh-nav-icon">✨</span>
              KI-Zusammenfassung
            </div>
          </div>
        </nav>

        <main className="rh-main">
          {/* REPORTS PANEL */}
          {activePanel === 'reports' && (
            <>
              <div className="rh-page-header">
                <div className="rh-page-title">Report erstellen</div>
                <div className="rh-page-sub">
                  Wähle einen Report-Typ und generiere eine vollständige Analyse
                </div>
              </div>

              <div className="rh-report-grid">
                {reportTypes.map(rt => (
                  <div
                    key={rt.key}
                    className={`rh-report-card ${rt.key}`}
                    onClick={() => setSelectedReportType(rt.key)}
                  >
                    <div className="rh-report-card-icon">{rt.icon}</div>
                    <div className="rh-report-card-title">{rt.title}</div>
                    <div className="rh-report-card-desc">{rt.desc}</div>
                    <div className="rh-report-card-tags">
                      {rt.tags.map(t => (
                        <span key={t} className="rh-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rh-generate-box">
                <div className="rh-generate-title">
                  Report konfigurieren
                  <span className={`rh-generate-type-badge badge-${selectedReportType}`}>
                    {reportTypes.find(r => r.key === selectedReportType)?.title}
                  </span>
                </div>
                <div className="rh-form-row">
                  <div className="rh-form-group">
                    <label className="rh-form-label">Zeitraum</label>
                    <select
                      className="rh-form-select"
                      value={period}
                      onChange={e => setPeriod(e.target.value)}
                    >
                      <option>März 2025</option>
                      <option>Februar 2025</option>
                      <option>Januar 2025</option>
                      <option>Q1 2025</option>
                    </select>
                  </div>
                  <div className="rh-form-group">
                    <label className="rh-form-label">Sprache</label>
                    <select className="rh-form-select">
                      <option>Deutsch</option>
                      <option>Englisch</option>
                    </select>
                  </div>
                </div>
                <div className="rh-form-row">
                  <div className="rh-form-group">
                    <label className="rh-form-label">Unternehmen</label>
                    <input
                      className="rh-form-input"
                      type="text"
                      placeholder="z.B. Acme GmbH"
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                    />
                  </div>
                  <div className="rh-form-group">
                    <label className="rh-form-label">Empfänger</label>
                    <input
                      className="rh-form-input"
                      type="text"
                      placeholder="z.B. Geschäftsführung"
                      value={recipient}
                      onChange={e => setRecipient(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  className="rh-gen-btn"
                  onClick={handleGenerateReport}
                  disabled={generatingReport}
                >
                  <span>{generatingReport ? '⏳' : '⚡'}</span>
                  <span>{generatingReport ? 'Generiere Report...' : 'Report generieren'}</span>
                </button>
              </div>

              {reportGenerated && (
                <div className="rh-report-preview">
                  <div className="rh-report-toolbar">
                    <button className="rh-toolbar-btn" onClick={handleBookmarkReport}>
                      🔖 Als Erkenntnis merken
                    </button>
                    <button className="rh-toolbar-btn primary">
                      ⬇ PDF exportieren
                    </button>
                    <button
                      className="rh-toolbar-btn"
                      onClick={() => setReportGenerated(false)}
                    >
                      ✕ Schließen
                    </button>
                  </div>
                  <div
                    className="rh-report-body"
                    dangerouslySetInnerHTML={{
                      __html: reportTemplates[selectedReportType]
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* BOOKMARKS PANEL */}
          {activePanel === 'bookmarks' && (
            <>
              <div className="rh-page-header">
                <div className="rh-page-title">Gespeicherte Erkenntnisse</div>
                <div className="rh-page-sub">Wichtige Einsichten aus Reports und Chat-Analysen</div>
              </div>

              <div className="rh-insights-toolbar">
                <div className="rh-search-wrap">
                  <span className="rh-search-icon">🔍</span>
                  <input
                    className="rh-search-box"
                    type="text"
                    placeholder="Erkenntnisse durchsuchen..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  className={`rh-filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setCurrentFilter('all')}
                >
                  Alle
                </button>
                <button
                  className={`rh-filter-btn ${currentFilter === 'report' ? 'active' : ''}`}
                  onClick={() => setCurrentFilter('report')}
                >
                  Reports
                </button>
                <button
                  className={`rh-filter-btn ${currentFilter === 'chat' ? 'active' : ''}`}
                  onClick={() => setCurrentFilter('chat')}
                >
                  Chat
                </button>
              </div>

              <div className="rh-insights-list">
                {filteredBookmarks.length === 0 ? (
                  <div className="rh-empty-state">
                    <div className="rh-empty-state-icon">🔖</div>
                    <div className="rh-empty-state-text">Keine Erkenntnisse gefunden</div>
                  </div>
                ) : (
                  filteredBookmarks.map(b => (
                    <div key={b.id} className="rh-insight-card">
                      <div className="rh-insight-header">
                        <span className="rh-insight-icon">{b.source === 'report' ? '📋' : '💬'}</span>
                        <span className="rh-insight-text">{b.text}</span>
                      </div>
                      <div className="rh-insight-footer">
                        <span className="rh-insight-meta">{b.date}</span>
                        {b.tags.map(t => (
                          <span key={t} className="rh-insight-tag">
                            {t}
                          </span>
                        ))}
                        <button
                          className="rh-remove-btn"
                          onClick={() => removeInsight(b.id)}
                        >
                          ✕ Entfernen
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* HISTORY PANEL */}
          {activePanel === 'history' && (
            <>
              <div className="rh-page-header">
                <div className="rh-page-title">Chat-History</div>
                <div className="rh-page-sub">Vergangene Analysen und Gespräche durchsuchen</div>
              </div>

              <div className="rh-insights-toolbar">
                <div className="rh-search-wrap">
                  <span className="rh-search-icon">🔍</span>
                  <input
                    className="rh-search-box"
                    type="text"
                    placeholder="In Gesprächen suchen..."
                    value={historySearchQuery}
                    onChange={e => setHistorySearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="rh-history-list">
                {filteredHistory.length === 0 ? (
                  <div className="rh-empty-state">
                    <div className="rh-empty-state-icon">💬</div>
                    <div className="rh-empty-state-text">Keine Gespräche gefunden</div>
                  </div>
                ) : (
                  filteredHistory.map(h => (
                    <div key={h.id} className="rh-history-item">
                      <div className="rh-history-item-header">
                        <span className="rh-history-item-title">{h.title}</span>
                        <span className="rh-history-item-date">{h.date}</span>
                      </div>
                      <div className="rh-history-item-preview">{h.preview}</div>
                      <div className="rh-history-item-tags">
                        {h.tags.map(t => (
                          <span key={t} className="rh-tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {/* SUMMARY PANEL */}
          {activePanel === 'summary' && (
            <>
              <div className="rh-page-header">
                <div className="rh-page-title">KI-Zusammenfassung</div>
                <div className="rh-page-sub">Automatische Analyse der letzten 7 Gespräche</div>
              </div>

              <div className="rh-summary-card">
                <div className="rh-summary-label">✦ KI-Analyse · Letzte 7 Gespräche</div>
                <div className="rh-summary-text">
                  Deine wichtigsten Erkenntnisse dieser Woche: Die mobile Conversion-Rate ist das kritischste Problem — 3 von 7 Gesprächen thematisierten diesen Rückgang. TikTok zeigt vielversprechende frühe Signale. Der Preistest bei +20% läuft stabil, der Netto-Umsatz-Effekt ist positiv. Handlungsbedarf: Mobile UX-Optimierung hat höchste Priorität.
                </div>
                <div className="rh-summary-insights">
                  <div className="rh-summary-insight-item">
                    <div className="rh-summary-insight-num">7</div>
                    <div className="rh-summary-insight-label">Analysierte Gespräche</div>
                  </div>
                  <div className="rh-summary-insight-item">
                    <div className="rh-summary-insight-num">{bookmarks.length}</div>
                    <div className="rh-summary-insight-label">Gespeicherte Erkenntnisse</div>
                  </div>
                  <div className="rh-summary-insight-item">
                    <div className="rh-summary-insight-num">3</div>
                    <div className="rh-summary-insight-label">Kritische Themen</div>
                  </div>
                  <div className="rh-summary-insight-item">
                    <div className="rh-summary-insight-num">2</div>
                    <div className="rh-summary-insight-label">Offene Aktionspunkte</div>
                  </div>
                </div>
              </div>

              <div className="rh-page-header" style={{ marginBottom: '1rem' }}>
                <div className="rh-page-title" style={{ fontSize: '18px' }}>
                  Top-Themen dieser Woche
                </div>
              </div>

              <div>
                {summaryTopics.map((t, idx) => (
                  <div
                    key={idx}
                    className="rh-insight-card"
                    style={{
                      borderLeft: t.urgent ? '3px solid var(--c-danger)' : 'none'
                    }}
                  >
                    <div className="rh-insight-header">
                      <span className="rh-insight-icon">{t.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: '14px',
                            marginBottom: '4px'
                          }}
                        >
                          {t.title}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--c-text-3)' }}>
                          {t.desc}
                        </div>
                      </div>
                      <span className="rh-tag">{t.count}× erwähnt</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
