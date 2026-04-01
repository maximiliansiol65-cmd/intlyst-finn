/* eslint-disable */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCompanyProfile } from "../contexts/CompanyProfileContext";
import "../styles/premium-dashboard.css";

// ─── Profil-basierte Standard-Szenarien (Punkt 7: Multi-Unternehmensfähigkeit) ─
const PROFILE_SCENARIOS = {
  finance_cfo: [
    {
      id: "a", name: "Liquidität sichern", emoji: "🧾",
      description: "Konservatives Finanzszenario mit Fokus auf Cash-Erhalt, Ausgabensteuerung und Stabilität.",
      kpi_projections: [
        { kpi: "Cashflow",         current: 100, projected: 118, unit: "Idx" },
        { kpi: "Kosten",           current: 100, projected: 94,  unit: "Idx" },
        { kpi: "EBITDA Marge",     current: 14,  projected: 18,  unit: "%" },
        { kpi: "Liquiditätsreserve", current: 2.1, projected: 3.6, unit: "Monate" },
      ],
      roi_estimate: 2.9, budget_pct: 4, effort_hours: 50, timeline_weeks: 6,
      risks: ["Weniger Wachstumstempo", "Investitionen werden verschoben"],
      opportunities: ["Mehr finanzieller Spielraum", "Geringeres Insolvenz- und Stressrisiko", "Planbarere Budgetsteuerung"],
      owner: "CFO + COO",
      benchmark_gap: "gering",
      recommended_when: "Bei Cashflow-Druck, unsicherer Nachfrage oder knapper Liquidität",
    },
    {
      id: "b", name: "Gezielte Wachstumsinvestition", emoji: "📈",
      description: "Selektive Reallokation in Projekte mit hohem ROI und klarer strategischer Wirkung.",
      kpi_projections: [
        { kpi: "Umsatz",           current: 100, projected: 122, unit: "Idx" },
        { kpi: "ROI",              current: 2.6, projected: 4.1, unit: "x" },
        { kpi: "Cashflow",         current: 100, projected: 92,  unit: "Idx" },
        { kpi: "Gross Margin",     current: 38,  projected: 44,  unit: "%" },
      ],
      roi_estimate: 4.1, budget_pct: 16, effort_hours: 120, timeline_weeks: 12,
      risks: ["Kurzfristig geringere Liquidität", "Fehlallokation bei schwacher Umsetzung"],
      opportunities: ["Höherer Umsatzbeitrag", "Besserer Kapitalhebel", "Strategische Wachstumsoptionen werden ausgebaut"],
      owner: "CFO + CEO + CMO",
      benchmark_gap: "mittel",
      recommended_when: "Bei belastbaren Forecasts, freiem Budget und priorisierten Wachstumshebeln",
    },
    {
      id: "c", name: "Kostenbasis restrukturieren", emoji: "⚖️",
      description: "Was-wäre-wenn-Szenario für nachhaltige Kostensenkung, Budgetdisziplin und Margenverbesserung.",
      kpi_projections: [
        { kpi: "Kosten",           current: 100, projected: 87,  unit: "Idx" },
        { kpi: "EBITDA Marge",     current: 14,  projected: 22,  unit: "%" },
        { kpi: "Cashflow",         current: 100, projected: 112, unit: "Idx" },
        { kpi: "ROI",              current: 2.6, projected: 3.5, unit: "x" },
      ],
      roi_estimate: 3.5, budget_pct: 6, effort_hours: 90, timeline_weeks: 10,
      risks: ["Operative Reibung", "Kurzfristige Umstellungskosten", "Moegliche Team-Belastung"],
      opportunities: ["Schneller Margeneffekt", "Mehr Budgetspielraum für Kerninitiativen", "Höhere Widerstandsfähigkeit im Abschwung"],
      owner: "CFO + Operations",
      benchmark_gap: "hoch",
      recommended_when: "Bei anhaltendem Kostendruck, Budgetabweichungen oder sinkender Marge",
    },
  ],
  management_ceo: [
    {
      id: "a", name: "Konservatives Wachstum", emoji: "🛡️",
      description: "Stabiles, risikoarmes Wachstum durch Optimierung bestehender Kanäle und Prozessverbesserungen.",
      kpi_projections: [
        { kpi: "Umsatz",          current: 100, projected: 108, unit: "%" },
        { kpi: "Conversion Rate", current: 2.8, projected: 3.1, unit: "%" },
        { kpi: "Neue Kunden",     current: 100, projected: 110, unit: "Idx" },
        { kpi: "Team-Effizienz",  current: 71,  projected: 78,  unit: "%" },
      ],
      roi_estimate: 2.8, budget_pct: 8, effort_hours: 80, timeline_weeks: 8,
      risks: ["Geringeres Wachstumstempo als Markt", "Langsamere Marktanteilsgewinne"],
      opportunities: ["Niedriger Ressourceneinsatz", "Stabiler Cashflow", "Team-Kapazität bleibt erhalten"],
      owner: "COO + Teams",
      benchmark_gap: "gering",
      recommended_when: "Bei stabiler Marktlage und internem Optimierungsbedarf",
    },
    {
      id: "b", name: "Aggressives Wachstum", emoji: "🚀",
      description: "Maximale Investition in Marketing und Sales für schnellen Marktanteilsgewinn.",
      kpi_projections: [
        { kpi: "Umsatz",          current: 100, projected: 128, unit: "%" },
        { kpi: "Conversion Rate", current: 2.8, projected: 3.8, unit: "%" },
        { kpi: "Neue Kunden",     current: 100, projected: 145, unit: "Idx" },
        { kpi: "Team-Effizienz",  current: 71,  projected: 65,  unit: "%" },
      ],
      roi_estimate: 4.2, budget_pct: 22, effort_hours: 240, timeline_weeks: 16,
      risks: ["Hoher Cashflow-Bedarf", "Team-Überlastung möglich", "Marktbedingungen unsicher"],
      opportunities: ["Marktanteil schnell ausbauen", "Netzwerkeffekte aktivieren", "Top-Talente anziehen"],
      owner: "CEO + CMO + Sales",
      benchmark_gap: "hoch",
      recommended_when: "Bei starkem Marktmomentum und ausreichend Kapitalreserven",
    },
    {
      id: "c", name: "Effizienzoptimierung", emoji: "⚙️",
      description: "Fokus auf Kostenstruktur, Prozesse und Margenverbesserung ohne externe Wachstumsinvestitionen.",
      kpi_projections: [
        { kpi: "Umsatz",          current: 100, projected: 104, unit: "%" },
        { kpi: "EBITDA Marge",    current: 14,  projected: 19,  unit: "%" },
        { kpi: "Team-Effizienz",  current: 71,  projected: 86,  unit: "%" },
        { kpi: "Conversion Rate", current: 2.8, projected: 3.3, unit: "%" },
      ],
      roi_estimate: 3.1, budget_pct: 5, effort_hours: 60, timeline_weeks: 6,
      risks: ["Keine Marktanteilsgewinne", "Gefahr der internen Stagnation"],
      opportunities: ["Sofortige Margenverbesserung", "Bessere Prozesse als Fundament für späteres Wachstum"],
      owner: "COO + Finance",
      benchmark_gap: "mittel",
      recommended_when: "Bei Kostendruch oder Cashflow-Engpässen",
    },
  ],
  startup: [
    {
      id: "a", name: "Product-led Growth", emoji: "🛠️",
      description: "Wachstum durch überragendes Produkt — besseres Onboarding, Virality und kostenloser Einstieg.",
      kpi_projections: [
        { kpi: "MoM Wachstum",    current: 7,  projected: 14,  unit: "%" },
        { kpi: "Retention (M1)",  current: 40, projected: 58,  unit: "%" },
        { kpi: "Activation",      current: 35, projected: 55,  unit: "%" },
        { kpi: "CAC",             current: 95, projected: 52,  unit: "€" },
      ],
      roi_estimate: 5.8, budget_pct: 12, effort_hours: 200, timeline_weeks: 16,
      risks: ["Lange Vorlaufzeit", "Feature-Priorisierung schwierig", "Konkurrenz kann schneller sein"],
      opportunities: ["Selbsttragend skalierbar", "Niedriger CAC", "Starke Retention = LTV steigt"],
      owner: "Product + Engineering",
      benchmark_gap: "hoch",
      recommended_when: "Bei starker Produkt-Differenzierung und aktivem Onboarding-Problem",
    },
    {
      id: "b", name: "Sales-led Growth", emoji: "📞",
      description: "Wachstum über Outbound Sales, Partnerkanäle und direkten Vertrieb.",
      kpi_projections: [
        { kpi: "MoM Wachstum",    current: 7,  projected: 18,  unit: "%" },
        { kpi: "Neue Kunden",     current: 100, projected: 160, unit: "Idx" },
        { kpi: "CAC",             current: 95, projected: 140, unit: "€" },
        { kpi: "Burn Multiple",   current: 2.1, projected: 2.8, unit: "x" },
      ],
      roi_estimate: 3.2, budget_pct: 25, effort_hours: 280, timeline_weeks: 12,
      risks: ["Hoher Burn", "Skalierungsgrenze bei Team-Kapazität", "Hoher CAC"],
      opportunities: ["Schnelle Umsatzergebnisse", "Enterprise-Kunden erreichbar", "Direktes Kundenfeedback"],
      owner: "Sales + Founder",
      benchmark_gap: "mittel",
      recommended_when: "Bei klarem ICP und Bereitschaft für aggressive Outbound-Investition",
    },
    {
      id: "c", name: "Content & SEO Growth", emoji: "📝",
      description: "Organisches Wachstum über Content-Marketing, SEO und Community-Aufbau.",
      kpi_projections: [
        { kpi: "MoM Wachstum",    current: 7,  projected: 10,  unit: "%" },
        { kpi: "CAC",             current: 95, projected: 38,  unit: "€" },
        { kpi: "Traffic",         current: 100, projected: 180, unit: "Idx" },
        { kpi: "Retention (M1)",  current: 40, projected: 48,  unit: "%" },
      ],
      roi_estimate: 6.1, budget_pct: 6, effort_hours: 120, timeline_weeks: 24,
      risks: ["Langsame Ergebnisse (6-12 Monate)", "Abhängigkeit von SEO-Algorithmen"],
      opportunities: ["Nachhaltig niedrigster CAC", "Skaliert ohne proportionale Kosten", "Autorität im Markt"],
      owner: "Content + Marketing",
      benchmark_gap: "gering",
      recommended_when: "Bei langen Zeithorizonten und Budget-Einschränkungen",
    },
  ],
  agency: [
    {
      id: "a", name: "Upsell & Retention", emoji: "🔄",
      description: "Fokus auf Bestandskunden: mehr Projekte, höhere Margen, Cross-Sell.",
      kpi_projections: [
        { kpi: "Projektmarge",    current: 28, projected: 36,  unit: "%" },
        { kpi: "Kundenbindung",   current: 68, projected: 82,  unit: "%" },
        { kpi: "Umsatz",          current: 100, projected: 118, unit: "Idx" },
        { kpi: "Auslastung",      current: 72, projected: 78,  unit: "%" },
      ],
      roi_estimate: 4.5, budget_pct: 6, effort_hours: 60, timeline_weeks: 8,
      risks: ["Abhängigkeit von wenigen Kunden", "Wenig Neukundenwachstum"],
      opportunities: ["Kostengünstig", "Sofortige Wirkung", "Starke Kundenbindung"],
      owner: "Account Management",
      benchmark_gap: "gering",
      recommended_when: "Bei hoher Kundenzufriedenheit und Kapazitätsproblemen",
    },
    {
      id: "b", name: "Neukundenakquise", emoji: "🎯",
      description: "Aktiver Aufbau neuer Kundenbeziehungen über Outbound, Referrals und Networking.",
      kpi_projections: [
        { kpi: "Neue Kunden",     current: 100, projected: 145, unit: "Idx" },
        { kpi: "Auslastung",      current: 72, projected: 88,  unit: "%" },
        { kpi: "Umsatz",          current: 100, projected: 132, unit: "Idx" },
        { kpi: "Projektmarge",    current: 28, projected: 24,  unit: "%" },
      ],
      roi_estimate: 3.1, budget_pct: 14, effort_hours: 180, timeline_weeks: 16,
      risks: ["Onboarding-Aufwand", "Anfangs niedrigere Margen", "Risiko der Überlastung"],
      opportunities: ["Diversifiziertes Portfolio", "Langfristiges Umsatzwachstum"],
      owner: "Business Development",
      benchmark_gap: "hoch",
      recommended_when: "Bei freier Kapazität und Wachstumsambitionen",
    },
    {
      id: "c", name: "Servicequalität erhöhen", emoji: "⭐",
      description: "Investition in Prozesse, Tools und Training für bessere Delivery und höhere Zufriedenheit.",
      kpi_projections: [
        { kpi: "Kundenzufriedenheit", current: 3.8, projected: 4.5, unit: "/5" },
        { kpi: "Kundenbindung",   current: 68, projected: 79,  unit: "%" },
        { kpi: "Projektmarge",    current: 28, projected: 33,  unit: "%" },
        { kpi: "Auslastung",      current: 72, projected: 75,  unit: "%" },
      ],
      roi_estimate: 3.8, budget_pct: 8, effort_hours: 100, timeline_weeks: 10,
      risks: ["Keine kurzfristige Umsatzsteigerung", "Change Management im Team"],
      opportunities: ["Basis für Premium-Pricing", "Differenzierung vom Wettbewerb"],
      owner: "Operations + Leads",
      benchmark_gap: "mittel",
      recommended_when: "Bei Unzufriedenheit im Team oder bei steigender Kundenabwanderung",
    },
  ],
  marketing_team: [
    {
      id: "a", name: "Performance-Kampagne", emoji: "⚡",
      description: "Bezahlte Ads mit starkem Targeting auf Bottom-of-Funnel — direkte Lead-Generierung.",
      kpi_projections: [
        { kpi: "Lead-Generierung", current: 100, projected: 165, unit: "Idx" },
        { kpi: "CPL",              current: 58, projected: 42,   unit: "€"  },
        { kpi: "Conversion Rate",  current: 12, projected: 17,   unit: "%"  },
        { kpi: "Marketing ROI",    current: 4.2, projected: 5.8,  unit: "x"  },
      ],
      roi_estimate: 5.8, budget_pct: 30, effort_hours: 80, timeline_weeks: 6,
      risks: ["Hoher Budget-Einsatz", "Abhängigkeit von Plattform-Algorithmen"],
      opportunities: ["Sofort messbar", "Schnelle Lead-Generierung", "Skalierbar"],
      owner: "Performance Marketing",
      benchmark_gap: "hoch",
      recommended_when: "Bei klarem ICP und Budget für Skalierung",
    },
    {
      id: "b", name: "Content & Brand", emoji: "🎨",
      description: "Organischer Aufbau durch Content, Social und Brand-Awareness.",
      kpi_projections: [
        { kpi: "Social Reach",    current: 100, projected: 180, unit: "Idx" },
        { kpi: "Traffic",         current: 100, projected: 145, unit: "Idx" },
        { kpi: "CPL",             current: 58, projected: 28,   unit: "€"  },
        { kpi: "Marketing ROI",   current: 4.2, projected: 6.5,  unit: "x"  },
      ],
      roi_estimate: 6.5, budget_pct: 12, effort_hours: 160, timeline_weeks: 20,
      risks: ["Lange Vorlaufzeit", "Schwer kurzfristig messbar"],
      opportunities: ["Nachhaltig niedrige Lead-Kosten", "Starke Marke als Moat"],
      owner: "Content + Brand",
      benchmark_gap: "mittel",
      recommended_when: "Bei langfristigem Zeithorizont und Markenstärkung als Ziel",
    },
    {
      id: "c", name: "E-Mail & Retention", emoji: "📧",
      description: "Lead-Nurturing und Reaktivierung über E-Mail-Automatisierung und Segmentierung.",
      kpi_projections: [
        { kpi: "E-Mail Open Rate", current: 22, projected: 31,  unit: "%" },
        { kpi: "Conversion Rate",  current: 12, projected: 19,  unit: "%" },
        { kpi: "Lead-zu-Kunde",    current: 12, projected: 20,  unit: "%" },
        { kpi: "Marketing ROI",    current: 4.2, projected: 7.1, unit: "x" },
      ],
      roi_estimate: 7.1, budget_pct: 5, effort_hours: 60, timeline_weeks: 4,
      risks: ["Begrenzte Reichweite auf bestehende Liste"],
      opportunities: ["Höchster ROI aller Kanäle", "Schnell umsetzbar", "Automatisierbar"],
      owner: "CRM + Marketing",
      benchmark_gap: "gering",
      recommended_when: "Bei aktiver E-Mail-Liste und Optimierungsbedarf im Funnel",
    },
  ],
  sales_team: [
    {
      id: "a", name: "Inbound-Pipeline optimieren", emoji: "🔧",
      description: "Warme Leads besser qualifizieren, schneller nachfassen und Conversion steigern.",
      kpi_projections: [
        { kpi: "Abschlussquote",  current: 22, projected: 31,  unit: "%" },
        { kpi: "Sales Cycle",     current: 28, projected: 20,  unit: "Tage" },
        { kpi: "Lead-Qualität",   current: 3.2, projected: 4.1, unit: "/5" },
        { kpi: "Neue Kunden",     current: 100, projected: 138, unit: "Idx" },
      ],
      roi_estimate: 4.8, budget_pct: 5, effort_hours: 60, timeline_weeks: 6,
      risks: ["Setzt CRM-Disziplin voraus"],
      opportunities: ["Sofortige Wirkung auf bestehende Pipeline", "Kostengünstig"],
      owner: "Sales Ops + Team",
      benchmark_gap: "gering",
      recommended_when: "Wenn viele Leads nicht konvertieren oder lange im Funnel stecken",
    },
    {
      id: "b", name: "Outbound Expansion", emoji: "📡",
      description: "Aktive Neukundengewinnung durch Outbound-Sequenzen, Kaltakquise und Social Selling.",
      kpi_projections: [
        { kpi: "Neue Leads",      current: 100, projected: 175, unit: "Idx" },
        { kpi: "Neue Kunden",     current: 100, projected: 148, unit: "Idx" },
        { kpi: "CAC",             current: 100, projected: 130, unit: "Idx" },
        { kpi: "Sales Cycle",     current: 28, projected: 22,   unit: "Tage" },
      ],
      roi_estimate: 3.4, budget_pct: 18, effort_hours: 200, timeline_weeks: 12,
      risks: ["Hoher Aufwand", "Risiko niedriger Response-Rates"],
      opportunities: ["Neue Marktsegmente erschließen", "Skalierbares Wachstum"],
      owner: "Sales Team",
      benchmark_gap: "hoch",
      recommended_when: "Bei freier Kapazität und klarem ICP für Outbound",
    },
    {
      id: "c", name: "Bestandskunden reaktivieren", emoji: "💎",
      description: "Bestehende und ehemalige Kunden für Folgekäufe und Upsell reaktivieren.",
      kpi_projections: [
        { kpi: "Abschlussquote",  current: 22, projected: 38,   unit: "%" },
        { kpi: "Umsatz",          current: 100, projected: 122,  unit: "Idx" },
        { kpi: "CAC",             current: 100, projected: 45,   unit: "Idx" },
        { kpi: "Neue Kunden",     current: 100, projected: 112,  unit: "Idx" },
      ],
      roi_estimate: 6.2, budget_pct: 4, effort_hours: 40, timeline_weeks: 4,
      risks: ["Limitiert auf vorhandene Kundenliste"],
      opportunities: ["Niedrigster CAC", "Sofortige Abschlüsse möglich", "Starke Beziehung"],
      owner: "Account + Sales",
      benchmark_gap: "gering",
      recommended_when: "Bei guter Bestandskundenbasis und kurzfristigem Umsatzbedarf",
    },
  ],
  midsize: [
    {
      id: "a", name: "Prozessoptimierung", emoji: "🔩",
      description: "Effizienzsteigerung durch Standardisierung, Automatisierung und klare Verantwortlichkeiten.",
      kpi_projections: [
        { kpi: "Team-Effizienz",  current: 68, projected: 82,  unit: "%" },
        { kpi: "EBITDA Marge",    current: 12, projected: 17,  unit: "%" },
        { kpi: "Prozesseffizienz",current: 65, projected: 80,  unit: "%" },
        { kpi: "Umsatz",          current: 100, projected: 106, unit: "Idx" },
      ],
      roi_estimate: 3.9, budget_pct: 6, effort_hours: 100, timeline_weeks: 10,
      risks: ["Change-Resistance im Team", "Initialer Aufwand hoch"],
      opportunities: ["Nachhaltige Verbesserung", "Skaliert ohne Mehrkosten"],
      owner: "Operations + Management",
      benchmark_gap: "gering",
      recommended_when: "Bei internen Reibungsverlusten und operativen Engpässen",
    },
    {
      id: "b", name: "Marktexpansion", emoji: "🗺️",
      description: "Neue Märkte, Segmente oder Regionen erschließen.",
      kpi_projections: [
        { kpi: "Umsatz",          current: 100, projected: 126, unit: "Idx" },
        { kpi: "Neue Kunden",     current: 100, projected: 140, unit: "Idx" },
        { kpi: "Team-Effizienz",  current: 68, projected: 60,  unit: "%" },
        { kpi: "EBITDA Marge",    current: 12, projected: 10,  unit: "%" },
      ],
      roi_estimate: 3.2, budget_pct: 20, effort_hours: 240, timeline_weeks: 24,
      risks: ["Hoher Investitionsbedarf", "Marktkenntnis fehlt anfangs", "Team-Belastung"],
      opportunities: ["Signifikantes Wachstumspotenzial", "Diversifizierung"],
      owner: "CEO + Sales + Marketing",
      benchmark_gap: "hoch",
      recommended_when: "Bei ausgereiztem Kernmarkt und ausreichend Kapital",
    },
    {
      id: "c", name: "Digitale Transformation", emoji: "💡",
      description: "Investition in digitale Prozesse, Tools und Plattformen für Wettbewerbsfähigkeit.",
      kpi_projections: [
        { kpi: "Team-Effizienz",  current: 68, projected: 84,  unit: "%" },
        { kpi: "Kundenzufriedenheit", current: 3.8, projected: 4.4, unit: "/5" },
        { kpi: "Prozesseffizienz",current: 65, projected: 82,  unit: "%" },
        { kpi: "EBITDA Marge",    current: 12, projected: 16,  unit: "%" },
      ],
      roi_estimate: 4.1, budget_pct: 10, effort_hours: 140, timeline_weeks: 16,
      risks: ["Implementierungsrisiken", "Schulungsbedarf", "Technologieauswahl"],
      opportunities: ["Langfristiger Wettbewerbsvorteil", "Skalierbarkeit"],
      owner: "IT + Management",
      benchmark_gap: "mittel",
      recommended_when: "Bei veralteten Prozessen und steigendem Technologiedruck",
    },
  ],
  small_business: [
    {
      id: "a", name: "Stammkunden aktivieren", emoji: "❤️",
      description: "Bestehende Kunden häufiger kaufen lassen durch Loyalty, Follow-up und persönlichen Kontakt.",
      kpi_projections: [
        { kpi: "Wiederkaufrate",  current: 28, projected: 42,  unit: "%" },
        { kpi: "Umsatz",          current: 100, projected: 118, unit: "Idx" },
        { kpi: "Neue Kunden",     current: 100, projected: 108, unit: "Idx" },
        { kpi: "Conversion Rate", current: 2.1, projected: 2.8, unit: "%" },
      ],
      roi_estimate: 5.2, budget_pct: 3, effort_hours: 20, timeline_weeks: 4,
      risks: ["Begrenzt auf bestehende Kundenbasis"],
      opportunities: ["Höchster ROI", "Sofortiger Effekt", "Stärkt Kundenbeziehung"],
      owner: "Inhaber:in",
      benchmark_gap: "gering",
      recommended_when: "Immer als erste Maßnahme — günstigster ROI",
    },
    {
      id: "b", name: "Sichtbarkeit lokal stärken", emoji: "📍",
      description: "Google-Profil, lokale Werbung und Empfehlungsmarketing für mehr lokale Nachfrage.",
      kpi_projections: [
        { kpi: "Neue Kunden",     current: 100, projected: 135, unit: "Idx" },
        { kpi: "Traffic",         current: 100, projected: 155, unit: "Idx" },
        { kpi: "Umsatz",          current: 100, projected: 120, unit: "Idx" },
        { kpi: "Conversion Rate", current: 2.1, projected: 2.5, unit: "%" },
      ],
      roi_estimate: 3.8, budget_pct: 8, effort_hours: 40, timeline_weeks: 6,
      risks: ["Saisonale Schwankungen", "Lokaler Wettbewerb"],
      opportunities: ["Neue Kunden im Einzugsgebiet", "Dauerhafter Sichtbarkeitseffekt"],
      owner: "Inhaber:in + Marketing",
      benchmark_gap: "mittel",
      recommended_when: "Bei niedrigem lokalen Bekanntheitsgrad",
    },
    {
      id: "c", name: "Angebot schärfen", emoji: "🎯",
      description: "Klares Kernprodukt definieren, Pricing optimieren und Positionierung verbessern.",
      kpi_projections: [
        { kpi: "Conversion Rate", current: 2.1, projected: 3.2, unit: "%" },
        { kpi: "Ø Bestellwert",   current: 100, projected: 128, unit: "Idx" },
        { kpi: "Umsatz",          current: 100, projected: 116, unit: "Idx" },
        { kpi: "Neue Kunden",     current: 100, projected: 110, unit: "Idx" },
      ],
      roi_estimate: 4.3, budget_pct: 2, effort_hours: 30, timeline_weeks: 3,
      risks: ["Kundenfeedback nötig", "Verändert bestehendes Angebot"],
      opportunities: ["Sofort mehr Marge", "Klare Differenzierung"],
      owner: "Inhaber:in",
      benchmark_gap: "gering",
      recommended_when: "Wenn viele Interessenten nicht kaufen oder Preise unter Markt liegen",
    },
  ],
  content_team: [
    {
      id: "a", name: "Evergreen-Content skalieren", emoji: "🌲",
      description: "Bestperformende Inhalte als Serie fortführen und auf weitere Kanäle distribuieren.",
      kpi_projections: [
        { kpi: "Engagement Rate", current: 3.2, projected: 5.8, unit: "%" },
        { kpi: "Reichweite/Post", current: 1200, projected: 3200, unit: "Pers." },
        { kpi: "Social CTR",      current: 1.1, projected: 2.1, unit: "%" },
        { kpi: "Traffic",         current: 100, projected: 148, unit: "Idx" },
      ],
      roi_estimate: 6.4, budget_pct: 4, effort_hours: 80, timeline_weeks: 8,
      risks: ["Themen-Sättigung möglich", "Abhängigkeit von wenigen Formaten"],
      opportunities: ["Hohe Effizienz durch Repurposing", "Bewährte Performance"],
      owner: "Content Team",
      benchmark_gap: "gering",
      recommended_when: "Wenn Top-Content klar identifizierbar ist",
    },
    {
      id: "b", name: "Video-First Strategie", emoji: "🎥",
      description: "Shift zu Short-Form und Long-Form Video für maximale Reichweite auf Social.",
      kpi_projections: [
        { kpi: "Reichweite/Post", current: 1200, projected: 5800, unit: "Pers." },
        { kpi: "Video-Completion",current: 42, projected: 62,    unit: "%" },
        { kpi: "Engagement Rate", current: 3.2, projected: 6.2,  unit: "%" },
        { kpi: "Traffic",         current: 100, projected: 175,  unit: "Idx" },
      ],
      roi_estimate: 5.2, budget_pct: 15, effort_hours: 200, timeline_weeks: 12,
      risks: ["Hohe Produktionskosten", "Neue Fähigkeiten nötig", "Vorlaufzeit"],
      opportunities: ["Höchste organische Reichweite", "Algorithmus-Favorit"],
      owner: "Content + Production",
      benchmark_gap: "hoch",
      recommended_when: "Bei Budget für Video-Produktion und jüngerer Zielgruppe",
    },
    {
      id: "c", name: "SEO & Blog-Aufbau", emoji: "🔍",
      description: "Systematischer Aufbau von SEO-relevanten Inhalten für dauerhaften organischen Traffic.",
      kpi_projections: [
        { kpi: "Traffic",         current: 100, projected: 210, unit: "Idx" },
        { kpi: "Social CTR",      current: 1.1, projected: 1.8, unit: "%" },
        { kpi: "Engagement Rate", current: 3.2, projected: 3.8, unit: "%" },
        { kpi: "Reichweite/Post", current: 1200, projected: 2200, unit: "Pers." },
      ],
      roi_estimate: 7.8, budget_pct: 6, effort_hours: 140, timeline_weeks: 20,
      risks: ["Sehr lange bis erste Ergebnisse", "SEO-Know-how nötig"],
      opportunities: ["Dauerhaft niedrige Traffic-Kosten", "Autorität im Thema"],
      owner: "SEO + Content",
      benchmark_gap: "mittel",
      recommended_when: "Bei langfristigem Zeithorizont und Such-Intent in der Zielgruppe",
    },
  ],
};

// Fallback für fehlende Profile
const FALLBACK_SCENARIOS = PROFILE_SCENARIOS.management_ceo;

// ─── Früh­warn­system-Konfiguration (Punkt 3) ─────────────────────────────────
const WARNING_THRESHOLDS = [
  {
    id: "high_budget",
    check: (s) => s.budget_pct > 18,
    severity: "high",
    label: "Hohes Budget-Risiko",
    detail: "Dieser Ansatz erfordert signifikante Investitionen (>{budget_pct}% des Umsatzes). Prüfe Cashflow-Puffer.",
  },
  {
    id: "long_timeline",
    check: (s) => s.timeline_weeks > 16,
    severity: "medium",
    label: "Langer Zeithorizont",
    detail: "Ergebnisse erst nach {timeline_weeks} Wochen sichtbar. Brückenmaßnahmen einplanen.",
  },
  {
    id: "high_effort",
    check: (s) => s.effort_hours > 180,
    severity: "medium",
    label: "Hoher Ressourcenbedarf",
    detail: "{effort_hours} Stunden Aufwand — prüfe Team-Kapazität vor Start.",
  },
  {
    id: "low_roi",
    check: (s) => s.roi_estimate < 2.5,
    severity: "low",
    label: "Unterdurchschnittlicher ROI",
    detail: "ROI von {roi_estimate}x liegt unter dem Branchenmittel. Alternative oder Optimierung prüfen.",
  },
];

function getWarnings(scenario) {
  return WARNING_THRESHOLDS
    .filter(w => w.check(scenario))
    .map(w => ({
      ...w,
      detail: w.detail
        .replace("{budget_pct}", scenario.budget_pct)
        .replace("{timeline_weeks}", scenario.timeline_weeks)
        .replace("{effort_hours}", scenario.effort_hours)
        .replace("{roi_estimate}", scenario.roi_estimate),
    }));
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────
function deltaColor(current, projected, lower_is_better = false) {
  const better = lower_is_better ? projected < current : projected > current;
  return better ? "#15803d" : "#dc2626";
}

function deltaArrow(current, projected, lower_is_better = false) {
  const better = lower_is_better ? projected < current : projected > current;
  const neutral = projected === current;
  if (neutral) return "→";
  return better ? "↑" : "↓";
}

function deltaPct(current, projected) {
  if (!current || !projected) return 0;
  return Math.round(((projected - current) / current) * 100);
}

function roiColor(roi) {
  if (roi >= 5) return "#15803d";
  if (roi >= 3) return "#0369a1";
  return "#d97706";
}

const SEV_CONFIG = {
  high:   { color: "#b91c1c", bg: "#fff1f2", label: "Risiko: Hoch"   },
  medium: { color: "#d97706", bg: "#fffbeb", label: "Risiko: Mittel" },
  low:    { color: "#0369a1", bg: "#eff6ff", label: "Hinweis"         },
};

// ─── Szenario-Karte ───────────────────────────────────────────────────────────
function SzenarioCard({ scenario, isSelected, onSelect, rank }) {
  const warnings = getWarnings(scenario);
  const criticalWarnings = warnings.filter(w => w.severity === "high");
  const bg = isSelected ? "#0f172a" : "#fff";
  const textCol = isSelected ? "#f8fafc" : "#0f172a";
  const mutedCol = isSelected ? "#94a3b8" : "#64748b";
  const borderStyle = isSelected ? "2px solid #0f172a" : "1px solid #e2e8f0";

  return (
    <div
      style={{ border: borderStyle, borderRadius: 14, background: bg, overflow: "hidden", cursor: "pointer", transition: "all 0.15s ease" }}
      onClick={() => onSelect(scenario.id)}
    >
      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${isSelected ? "#1e293b" : "#f1f5f9"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>{scenario.emoji}</span>
              {rank === 1 && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fef9c3", color: "#854d0e", fontWeight: 700 }}>
                  Empfohlen
                </span>
              )}
              {criticalWarnings.length > 0 && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#fff1f2", color: "#b91c1c", fontWeight: 700 }}>
                  ⚠ Risiko
                </span>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: textCol }}>{scenario.name}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: mutedCol, lineHeight: 1.5 }}>{scenario.description}</div>
          </div>
        </div>

        {/* Key metrics row */}
        <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: mutedCol }}>
            ROI{" "}
            <strong style={{ color: roiColor(scenario.roi_estimate), fontSize: 14 }}>
              {scenario.roi_estimate}x
            </strong>
          </div>
          <div style={{ fontSize: 12, color: mutedCol }}>
            Budget{" "}
            <strong style={{ color: textCol, fontSize: 13 }}>{scenario.budget_pct}%</strong>
          </div>
          <div style={{ fontSize: 12, color: mutedCol }}>
            Zeit{" "}
            <strong style={{ color: textCol, fontSize: 13 }}>{scenario.timeline_weeks} Wo.</strong>
          </div>
          <div style={{ fontSize: 12, color: mutedCol }}>
            Aufwand{" "}
            <strong style={{ color: textCol, fontSize: 13 }}>{scenario.effort_hours}h</strong>
          </div>
        </div>
      </div>

      {/* KPI Projections preview (top 2) */}
      <div style={{ padding: "12px 18px" }}>
        {scenario.kpi_projections.slice(0, 2).map((p) => {
          const pct = deltaPct(p.current, p.projected);
          const col = deltaColor(p.current, p.projected);
          return (
            <div key={p.kpi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: mutedCol }}>{p.kpi}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? col : col }}>
                {deltaArrow(p.current, p.projected)} {pct > 0 ? "+" : ""}{pct}%
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: mutedCol, marginTop: 4 }}>
          Owner: {scenario.owner}
        </div>
      </div>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function Szenarien() {
  const { authHeader }         = useAuth();
  const { profile, profileId } = useCompanyProfile();

  const [briefing, setBriefing]       = useState(null);
  const [outcomes, setOutcomes]       = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedIds, setSelectedIds] = useState(["a", "b", "c"]);
  const [activeDetail, setActiveDetail] = useState(null);
  const [tab, setTab]                 = useState("vergleich");

  const scenarios = PROFILE_SCENARIOS[profileId] || FALLBACK_SCENARIOS;

  // Daten laden
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/decision/briefing", { headers: authHeader() }).then(r => r.ok ? r.json() : null),
      fetch("/api/learning/outcomes", { headers: authHeader() }).then(r => r.ok ? r.json() : null),
    ]).then(([briefingData, outcomesData]) => {
      if (!alive) return;
      setBriefing(briefingData);
      setOutcomes(outcomesData?.items || []);
    }).catch(() => {}).finally(() => { if (alive) setLoadingData(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // Ranking-Funktion: empfohlenes Szenario (Punkt 1, Punkt 3)
  const rankedScenarios = useMemo(() => {
    const hasCriticalSignal = (briefing?.counts?.critical ?? 0) > 0;
    const hasEarlyWarning   = (briefing?.counts?.early_warnings ?? 0) > 0;

    return scenarios.map((s) => {
      let score = s.roi_estimate * 10;
      // Bei kritischen Signalen: risikoarme Szenarien bevorzugen
      if (hasCriticalSignal || hasEarlyWarning) {
        if (s.budget_pct <= 8)    score += 15;
        if (s.timeline_weeks <= 8) score += 10;
        if (s.benchmark_gap === "gering") score += 8;
      } else {
        // Bei normalem Zustand: hohes Wachstumspotenzial bevorzugen
        if (s.roi_estimate >= 5) score += 15;
        if (s.budget_pct <= 15)  score += 5;
      }
      return { ...s, score };
    }).sort((a, b) => b.score - a.score);
  }, [scenarios, briefing]);

  const topScenario = rankedScenarios[0];

  // Frühwarnungen für alle Szenarien (Punkt 3)
  const allWarnings = useMemo(() =>
    scenarios.reduce((acc, s) => ({ ...acc, [s.id]: getWarnings(s) }), {}),
    [scenarios]
  );

  const selectedScenarios = useMemo(() =>
    scenarios.filter(s => selectedIds.includes(s.id)),
    [scenarios, selectedIds]
  );

  // Alle KPIs über alle Szenarien
  const allKpis = useMemo(() => {
    const kpiSet = new Set();
    selectedScenarios.forEach(s => s.kpi_projections.forEach(p => kpiSet.add(p.kpi)));
    return Array.from(kpiSet);
  }, [selectedScenarios]);

  function toggleSelection(id) {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(x => x !== id) : prev
        : prev.length < 3 ? [...prev, id] : prev
    );
  }

  const today = useMemo(() =>
    new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);

  return (
    <div style={{ padding: "var(--s-5)", display: "grid", gap: "var(--s-5)", maxWidth: 1060, margin: "0 auto" }}>

      {/* ── Header ── */}
      <header style={{ borderBottom: "1px solid var(--c-border)", paddingBottom: "var(--s-4)" }}>
        <div style={{ fontSize: 11, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          {today} · {profile.label} · Szenarien-Planung
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
          Strategische Szenarien & Vergleich
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 6, lineHeight: 1.6, marginBottom: 0 }}>
          Vergleiche mehrere Strategien gleichzeitig — mit KPI-Projektion, ROI-Schätzung, Risiken und Chancen. Keine Aktion wird automatisch ausgeführt.
        </p>

        {/* Frühwarnsystem Live-Banner (Punkt 3) */}
        {!loadingData && briefing && (briefing.counts?.critical > 0 || briefing.counts?.early_warnings > 0) && (
          <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: "#fff1f2", border: "1px solid #fecaca" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c", marginBottom: 4 }}>
              ⚠ Frühwarnsystem: {briefing.counts.critical > 0 ? `${briefing.counts.critical} kritische Signale` : ""} {briefing.counts.early_warnings > 0 ? `· ${briefing.counts.early_warnings} Frühwarnungen` : ""}
            </div>
            <div style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.6 }}>
              Angesichts der aktuellen KPI-Lage werden risikoarme Szenarien mit kurzem Zeithorizont priorisiert. Die Szenario-Empfehlung berücksichtigt diese Signale.
            </div>
          </div>
        )}
      </header>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--c-border)" }}>
        {[
          { id: "vergleich",    label: "Szenario-Vergleich",   emoji: "⚖️" },
          { id: "kpi_table",    label: "KPI-Projektionstabelle", emoji: "📊" },
          { id: "empfehlung",   label: "Systemempfehlung",      emoji: "🎯" },
          { id: "frühwarn",    label: "Frühwarnsystem",        emoji: "⚠️" },
          { id: "lernhistorie", label: "Lernhistorie",          emoji: "🧠" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 16px", border: "none", cursor: "pointer", background: "transparent",
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color:        tab === t.id ? "#0f172a" : "#64748b",
            borderBottom: tab === t.id ? "2px solid #0f172a" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1: Szenario-Vergleich (Punkt 1 & 7)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "vergleich" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>

          {/* Szenario-Auswahl Banner */}
          <div style={{ padding: "12px 16px", background: "var(--c-surface-2)", borderRadius: 10, fontSize: 13, color: "#64748b" }}>
            Wähle 2–3 Szenarien für den Vergleich. Basierend auf dem Unternehmensprofil <strong>{profile.label}</strong> — angepasst an deine KPI-Prioritäten.
          </div>

          {/* Szenario-Karten (Punkt 1) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {rankedScenarios.map((s, idx) => (
              <div key={s.id}>
                <SzenarioCard
                  scenario={s}
                  isSelected={selectedIds.includes(s.id)}
                  onSelect={toggleSelection}
                  rank={idx + 1}
                />
              </div>
            ))}
          </div>

          {/* Side-by-Side Detail für selektierte Szenarien */}
          {selectedScenarios.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 14 }}>
                Detailvergleich: {selectedScenarios.map(s => s.emoji + " " + s.name).join(" vs. ")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${selectedScenarios.length}, 1fr)`, gap: 12 }}>
                {selectedScenarios.map((s) => {
                  const warnings = allWarnings[s.id] || [];
                  return (
                    <div key={s.id} style={{ padding: "16px 18px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{s.emoji} {s.name}</div>

                      {/* ROI + Budget + Timeline */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {[
                          { label: "ROI", value: `${s.roi_estimate}x`, col: roiColor(s.roi_estimate) },
                          { label: "Budget", value: `${s.budget_pct}% Umsatz` },
                          { label: "Aufwand", value: `${s.effort_hours}h` },
                          { label: "Zeitraum", value: `${s.timeline_weeks} Wo.` },
                        ].map(m => (
                          <div key={m.label} style={{ padding: "8px 10px", borderRadius: 8, background: "#f8fafc" }}>
                            <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{m.label}</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: m.col || "#0f172a" }}>{m.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Chancen */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Chancen</div>
                        {s.opportunities.slice(0, 2).map((o, i) => (
                          <div key={i} style={{ fontSize: 12, color: "#166534", display: "flex", gap: 6, marginBottom: 4 }}>
                            <span style={{ flexShrink: 0 }}>✓</span> {o}
                          </div>
                        ))}
                      </div>

                      {/* Risiken */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Risiken</div>
                        {s.risks.slice(0, 2).map((r, i) => (
                          <div key={i} style={{ fontSize: 12, color: "#b91c1c", display: "flex", gap: 6, marginBottom: 4 }}>
                            <span style={{ flexShrink: 0 }}>✗</span> {r}
                          </div>
                        ))}
                      </div>

                      {/* Wann empfohlen */}
                      <div style={{ padding: "8px 10px", background: "#f0f9ff", borderRadius: 8, fontSize: 12, color: "#0369a1", lineHeight: 1.5 }}>
                        <strong>Wann:</strong> {s.recommended_when}
                      </div>

                      {/* Frühwarnungen */}
                      {warnings.length > 0 && (
                        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                          {warnings.map((w) => {
                            const cfg = SEV_CONFIG[w.severity];
                            return (
                              <div key={w.id} style={{ padding: "7px 10px", borderRadius: 7, background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}: {w.label}</div>
                                <div style={{ fontSize: 11, color: cfg.color, marginTop: 2, lineHeight: 1.5 }}>{w.detail}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* CTA */}
                      <div style={{ marginTop: 14 }}>
                        <Link to="/command" style={{
                          display: "block", textAlign: "center", padding: "8px 14px",
                          borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc",
                          color: "#334155", fontSize: 12, fontWeight: 600, textDecoration: "none",
                        }}>
                          Maßnahme planen →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2: KPI-Projektionstabelle (Punkt 1 & 5)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "kpi_table" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <div style={{ padding: "12px 16px", background: "var(--c-surface-2)", borderRadius: 10, fontSize: 13, color: "#64748b" }}>
            KPI-Projektionen für alle Szenarien im Vergleich. Grün = Verbesserung · Rot = Verschlechterung. Werte sind Schätzungen, keine Garantien.
          </div>

          {/* KPI-Tabelle */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0" }}>
                    KPI
                  </th>
                  {scenarios.map(s => (
                    <th key={s.id} style={{ padding: "12px 16px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #e2e8f0", minWidth: 120 }}>
                      {s.emoji} {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allKpis.map((kpi, rowIdx) => (
                  <tr key={kpi} style={{ background: rowIdx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#334155", borderBottom: "1px solid #f1f5f9" }}>
                      {kpi}
                    </td>
                    {scenarios.map(s => {
                      const proj = s.kpi_projections.find(p => p.kpi === kpi);
                      if (!proj) return (
                        <td key={s.id} style={{ padding: "12px 16px", textAlign: "center", fontSize: 13, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>—</td>
                      );
                      const pct = deltaPct(proj.current, proj.projected);
                      const col = deltaColor(proj.current, proj.projected);
                      const arrow = deltaArrow(proj.current, proj.projected);
                      return (
                        <td key={s.id} style={{ padding: "12px 16px", textAlign: "center", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: col }}>
                            {arrow} {pct > 0 ? "+" : ""}{pct}%
                          </div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                            {proj.projected} {proj.unit}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* ROI row */}
                <tr style={{ background: "#f0f9ff" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#0369a1", borderTop: "2px solid #bfdbfe" }}>
                    ROI-Schätzung
                  </td>
                  {scenarios.map(s => (
                    <td key={s.id} style={{ padding: "12px 16px", textAlign: "center", borderTop: "2px solid #bfdbfe" }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: roiColor(s.roi_estimate) }}>{s.roi_estimate}x</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
            * Alle Projektionen sind Schätzwerte auf Basis von Branchendaten und historischen Benchmarks für <strong>{profile.label}</strong>. Tatsächliche Ergebnisse können abweichen.
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 3: Systemempfehlung (Punkte 2 & 4)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "empfehlung" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>

          {/* Empfehlungs-Header */}
          <div style={{ padding: "18px 20px", borderRadius: 12, background: "#0f172a", color: "#f8fafc" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Systemempfehlung für {profile.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              {topScenario.emoji} {topScenario.name}
            </div>
            <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
              {topScenario.description}
            </div>
          </div>

          {/* Begründung */}
          <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 12 }}>
              Warum dieses Szenario?
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#334155" }}>
                <span style={{ flexShrink: 0, fontSize: 16 }}>📊</span>
                <span style={{ lineHeight: 1.6 }}>
                  <strong>ROI von {topScenario.roi_estimate}x</strong> — {topScenario.roi_estimate >= 5 ? "überdurchschnittlicher Ertrag relativ zum Risiko" : "solider Ertrag mit überschaubarem Einsatz"}.
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#334155" }}>
                <span style={{ flexShrink: 0, fontSize: 16 }}>⏱️</span>
                <span style={{ lineHeight: 1.6 }}>
                  <strong>{topScenario.timeline_weeks} Wochen bis erste Ergebnisse</strong> — {topScenario.timeline_weeks <= 8 ? "schnelle Wirkung für kurzfristige KPI-Verbesserung" : "mittelfristiger Ansatz mit nachhaltiger Wirkung"}.
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#334155" }}>
                <span style={{ flexShrink: 0, fontSize: 16 }}>💰</span>
                <span style={{ lineHeight: 1.6 }}>
                  <strong>{topScenario.budget_pct}% Budget-Einsatz</strong> — {topScenario.budget_pct <= 8 ? "risikoarme Investition mit hohem Hebel" : "signifikante Investition, Cashflow-Puffer prüfen"}.
                </span>
              </div>
              {(briefing?.counts?.critical ?? 0) > 0 && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#b91c1c" }}>
                  <span style={{ flexShrink: 0, fontSize: 16 }}>⚠️</span>
                  <span style={{ lineHeight: 1.6 }}>
                    <strong>Angepasst an aktuelle Warnsignale:</strong> Bei {briefing.counts.critical} kritischen KPI-Signalen werden konservativere, schnell wirkende Szenarien bevorzugt.
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#334155" }}>
                <span style={{ flexShrink: 0, fontSize: 16 }}>🎯</span>
                <span style={{ lineHeight: 1.6 }}>
                  <strong>Für {profile.label} besonders geeignet:</strong> {topScenario.recommended_when}
                </span>
              </div>
            </div>
          </div>

          {/* Top-KPI Projektionen */}
          <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 14 }}>
              Erwartete KPI-Verbesserungen
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              {topScenario.kpi_projections.map((p) => {
                const pct = deltaPct(p.current, p.projected);
                const col = deltaColor(p.current, p.projected);
                return (
                  <div key={p.kpi} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${col}33`, background: pct > 0 ? "#f0fdf4" : "#fff1f2" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>{p.kpi}</div>
                    <div style={{ fontWeight: 800, fontSize: 20, color: col }}>
                      {pct > 0 ? "+" : ""}{pct}%
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      → {p.projected} {p.unit}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Szenario-Ranking Vergleich */}
          <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 14 }}>
              Szenario-Ranking (aktuell)
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {rankedScenarios.map((s, idx) => (
                <div key={s.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: idx === 0 ? "#f0fdf4" : "#f8fafc", border: idx === 0 ? "1px solid #bbf7d0" : "1px solid #f1f5f9" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: idx === 0 ? "#15803d" : "#e2e8f0", color: idx === 0 ? "#fff" : "#64748b",
                    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14,
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.emoji} {s.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>ROI {s.roi_estimate}x · Budget {s.budget_pct}% · {s.timeline_weeks} Wo.</div>
                  </div>
                  {idx === 0 && (
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#dcfce7", color: "#166534", fontWeight: 700 }}>
                      Empfohlen
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Aktionsplan */}
          <div style={{ padding: "16px 20px", borderRadius: 12, background: "#eff6ff", border: "1px solid #dbeafe" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>
              Nächste Schritte für {topScenario.name}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                `Szenario mit Owner <strong>${topScenario.owner}</strong> besprechen`,
                `Budget von <strong>${topScenario.budget_pct}%</strong> des Umsatzes reservieren`,
                `Zeithorizont von <strong>${topScenario.timeline_weeks} Wochen</strong> im Plan blockieren`,
                "KPI-Baselines dokumentieren (Ausgangswerte für späteres Review)",
                "Maßnahmen als Aufgaben delegieren und Owner zuweisen",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#1e40af" }}>
                  <span style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                    background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                  }}>{i + 1}</span>
                  <span style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: step }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Link to="/command" style={{
                padding: "8px 18px", borderRadius: 8, background: "#0f172a", color: "#fff",
                fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}>
                Szenario in Planung übernehmen →
              </Link>
              <Link to="/tasks" style={{
                padding: "8px 18px", borderRadius: 8, border: "1px solid #bfdbfe",
                background: "#fff", color: "#1d4ed8", fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}>
                Aufgaben erstellen
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 4: Frühwarnsystem (Punkt 3)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "frühwarn" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <div style={{ padding: "14px 18px", background: "var(--c-surface-2)", borderRadius: 10, border: "1px solid var(--c-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>Frühwarnsystem</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              Erkenne abweichende Trends und Risiken frühzeitig — bevor sie KPI-Schäden verursachen. Warnungen basieren auf Szenario-Risiken und aktuellen Live-Signalen.
            </div>
          </div>

          {/* Live KPI-Signale aus Briefing */}
          {briefing && (
            <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 14 }}>
                Aktuelle Live-Signale aus dem System
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {[
                  { label: "Gesamtsignale",   value: briefing.counts?.events         ?? 0, warn: false },
                  { label: "Kritisch",         value: briefing.counts?.critical       ?? 0, warn: (briefing.counts?.critical ?? 0) > 0 },
                  { label: "Frühwarnungen",    value: briefing.counts?.early_warnings ?? 0, warn: (briefing.counts?.early_warnings ?? 0) > 0 },
                  { label: "Externe Signale",  value: briefing.counts?.external_signals ?? 0, warn: false },
                ].map(s => (
                  <div key={s.label} style={{ padding: "12px 14px", borderRadius: 10, background: s.warn ? "#fff1f2" : "#f8fafc", border: s.warn ? "1px solid #fecaca" : "1px solid #f1f5f9" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.warn ? "#dc2626" : "#0f172a" }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: s.warn ? "#dc2626" : "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {briefing.summary && (
                <div style={{ marginTop: 14, fontSize: 13, color: "#334155", lineHeight: 1.6, padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
                  <strong>Briefing-Zusammenfassung:</strong> {briefing.summary}
                </div>
              )}
            </div>
          )}

          {/* Szenario-Risiko-Profil */}
          <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 14 }}>
              Risiko-Profil pro Szenario
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              {scenarios.map((s) => {
                const warnings = allWarnings[s.id] || [];
                const riskScore = warnings.reduce((sum, w) => sum + (w.severity === "high" ? 3 : w.severity === "medium" ? 2 : 1), 0);
                const maxScore = 6;
                const riskPct = Math.min(100, (riskScore / maxScore) * 100);
                const riskCol = riskScore >= 4 ? "#dc2626" : riskScore >= 2 ? "#d97706" : "#15803d";

                return (
                  <div key={s.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{s.emoji} {s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: riskCol }}>
                        Risiko-Score: {riskScore}/{maxScore}
                      </span>
                    </div>
                    <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ height: "100%", width: `${riskPct}%`, background: riskCol, borderRadius: 4, transition: "width 0.4s ease" }} />
                    </div>
                    {warnings.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#15803d" }}>✓ Kein erhöhtes Risiko erkannt</div>
                    ) : (
                      <div style={{ display: "grid", gap: 5 }}>
                        {warnings.map((w) => {
                          const cfg = SEV_CONFIG[w.severity];
                          return (
                            <div key={w.id} style={{ padding: "6px 10px", borderRadius: 7, background: cfg.bg, fontSize: 12, color: cfg.color }}>
                              <strong>{w.label}:</strong> {w.detail}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Was tun bei Frühwarnung */}
          <div style={{ padding: "16px 20px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 12 }}>
              Was bedeuten Frühwarnungen? — Handlungsempfehlungen
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { icon: "🔴", label: "Kritisches Signal", text: "Sofortmaßnahme erforderlich. Konservatives Szenario wählen, schnelle Wirkung priorisieren. Kein aggressives Wachstum in dieser Phase." },
                { icon: "🟡", label: "Frühwarnung", text: "Potenzielle Risikosituation. Ursachen analysieren, Szenario-Zeitplan anpassen und Puffer einbauen." },
                { icon: "🟢", label: "Kein Signal", text: "Normalbetrieb. Alle Szenarien können bewertet werden. Fokus auf ROI und strategische Passung." },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 13, color: "#334155" }}>
                  <span style={{ flexShrink: 0, fontSize: 18 }}>{item.icon}</span>
                  <div>
                    <strong>{item.label}:</strong> <span style={{ lineHeight: 1.6 }}>{item.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 5: Lernhistorie (Punkt 6)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === "lernhistorie" && (
        <div style={{ display: "grid", gap: "var(--s-4)" }}>
          <div style={{ padding: "14px 18px", background: "var(--c-surface-2)", borderRadius: 10, border: "1px solid var(--c-border)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>
              Lernhistorie für Szenario-Verbesserung
            </div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
              Vergangene Maßnahmen und deren tatsächliche Wirkung fließen in die Szenario-Empfehlungen ein. Je mehr Outcomes bewertet werden, desto präziser werden die Prognosen.
            </div>
          </div>

          {outcomes.length === 0 ? (
            <div style={{ padding: "var(--s-6)", borderRadius: 12, background: "var(--c-surface-2)", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🧠</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#334155" }}>Noch keine Lernhistorie vorhanden</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, lineHeight: 1.6, maxWidth: 400, margin: "6px auto 0" }}>
                Wenn du Maßnahmen im <Link to="/ceo" style={{ color: "#0369a1", fontWeight: 600, textDecoration: "none" }}>Beratungs-Center</Link> mit tatsächlichen Ergebnissen bewertest, verbessert das System die Prognosegenauigkeit für zukünftige Szenarien.
              </div>
            </div>
          ) : (
            <>
              {/* Lerninsights für Szenarien */}
              <div style={{ padding: "18px 20px", borderRadius: 12, border: "1px solid var(--c-border)", background: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 14 }}>
                  Aus vergangenen Maßnahmen gelernt
                </div>
                <div style={{ display: "grid", gap: 12 }}>
                  {outcomes.slice(0, 5).map((o) => {
                    const expected = o.expected_impact_pct;
                    const actual   = o.actual_impact_pct;
                    const ok = actual != null && expected != null && actual >= expected * 0.8;
                    return (
                      <div key={o.id} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`, background: ok ? "#f0fdf4" : "#fff9f9" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{o.title || o.recommendation_title}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: ok ? "#15803d" : "#dc2626", flexShrink: 0 }}>
                            {ok ? "Erfolgreich" : "Unter Erwartung"}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                          Erwartet: {expected != null ? `+${expected}%` : "–"} · Tatsächlich: {actual != null ? `+${actual}%` : "–"}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: ok ? "#15803d" : "#dc2626", lineHeight: 1.5 }}>
                          {ok
                            ? "→ Ähnliche Szenarien werden in Zukunft stärker gewichtet"
                            : "→ Annahmen für diesen Ansatz in Szenarien nach unten korrigiert"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Footer-Navigation ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: "var(--s-3)", borderTop: "1px solid var(--c-border)" }}>
        {[
          { label: "Beratung & Empfehlungen", href: "/ceo",         emoji: "🤖" },
          { label: "Analyse vertiefen",        href: "/analyse",    emoji: "📊" },
          { label: "Maßnahmen planen",          href: "/command",   emoji: "🎯" },
          { label: "Aufgaben delegieren",       href: "/tasks",     emoji: "✅" },
        ].map(({ label, href, emoji }) => (
          <Link key={href} to={href} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid var(--c-border)",
            background: "var(--c-surface)", color: "var(--c-text)",
            textDecoration: "none", fontSize: 13, fontWeight: 500,
          }}>
            {emoji} {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
