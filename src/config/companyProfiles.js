export const COMPANY_PROFILE_STORAGE_KEY = "intlyst_company_profile";

export const COMPANY_PROFILES = {
  small_business: {
    id: "small_business",
    label: "Kleines Unternehmen",
    shortLabel: "Kleinunternehmen",
    description: "Klare Prioritäten für wenige Ressourcen und schnelle Entscheidungen.",
    accent: "#0F9F6E",
    dashboardRole: "assistant",
    preferredWidgets: ["kpis", "recommendation", "tasks", "alerts", "goals", "chart"],
    dashboard: {
      heroLabel: "Pragmatischer Tagesfokus",
      kpis: ["Umsatz", "Neue Kunden", "Traffic", "Conversion Rate", "Offene Aufgaben"],
      warningLabel: "Wichtigste Baustelle",
      opportunityLabel: "Schnellste Chance",
      action: {
        title: "Sichtbarkeit lokal stärken",
        detail: "Konzentriere dich heute auf einen Kanal mit direktem Ertrag und reduziere Streuverluste.",
        owner: "Inhaber:in",
        kpi: "Umsatz",
      },
    },
    analysis: {
      defaultTab: "analyse",
      forecastMetric: "revenue",
      focusAreas: ["Cashflow", "Conversion", "wiederkehrende Kunden"],
      explanation: "Wir heben Analysen hervor, die sofort Umsatz oder Auslastung verbessern können.",
      prioritizedInsightTypes: ["risk", "opportunity", "weakness", "strength"],
      actions: ["Top 1 Conversion-Hebel umsetzen", "Lokale Nachfrage testen", "Ruecklaeufer im Funnel beheben"],
    },
    tasks: {
      title: "Relevante Tagesaufgaben",
      description: "Nur Aufgaben mit direktem Einfluss auf Umsatz, Kunden oder Auslastung.",
      focusLabel: "Nur umsatznahe Aufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Top-Angebot prominent auf Startseite platzieren", priority: "high", assigned_to: "Inhaber:in" },
        { title: "Bestehende Kunden für Folgeauftrag kontaktieren", priority: "medium", assigned_to: "Vertrieb" },
      ],
    },
  },
  startup: {
    id: "startup",
    label: "Startup",
    shortLabel: "Startup",
    description: "Wachstum, Experimente und Momentum im Fokus.",
    accent: "#0071E3",
    dashboardRole: "strategist",
    preferredWidgets: ["kpis", "chart", "recommendation", "goals", "tasks", "alerts"],
    dashboard: {
      heroLabel: "Momentum und Wachstum",
      kpis: ["Wachstum (MoM)", "Neue Kunden", "Conversion Rate", "Traffic", "Burn Rate"],
      warningLabel: "Größtes Wachstumsrisiko",
      opportunityLabel: "Schnellster Growth-Hebel",
      action: {
        title: "Onboarding-Engpass auflösen",
        detail: "Teste eine kuerzere Aktivierungsstrecke und messe den Effekt auf Conversion und Retention.",
        owner: "Growth",
        kpi: "Wachstum",
      },
    },
    analysis: {
      defaultTab: "prognose",
      forecastMetric: "customers",
      focusAreas: ["Activation", "Retention", "Lead-Wachstum"],
      explanation: "Startups sehen zuerst Analysen zu Tempo, Traktion und Skalierungspotenzial.",
      prioritizedInsightTypes: ["opportunity", "risk", "strength", "weakness"],
      actions: ["Growth-Experiment für diese Woche definieren", "Aktivierungsdrop im Funnel messen", "Retention-Signal früh prüfen"],
    },
    tasks: {
      title: "Growth-Aufgaben",
      description: "Experimente, Learnings und schnelle Umsetzungen für dein Team.",
      focusLabel: "Nur Growth-Aufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Experiment für Landingpage-Headline anlegen", priority: "high", assigned_to: "Growth" },
        { title: "Retention-Warnsignal im Dashboard prüfen", priority: "medium", assigned_to: "Produkt" },
      ],
    },
  },
  agency: {
    id: "agency",
    label: "Agentur",
    shortLabel: "Agentur",
    description: "Auslastung, Pipeline und Kundenperformance auf einen Blick.",
    accent: "#E4572E",
    dashboardRole: "coo",
    preferredWidgets: ["kpis", "tasks", "alerts", "recommendation", "goals", "chart"],
    dashboard: {
      heroLabel: "Kundenleistung und Auslastung",
      kpis: ["Projektmarge", "Auslastung", "Neue Leads", "Kundenzufriedenheit", "Deadline-Risiken"],
      warningLabel: "Kritischster Kundenpunkt",
      opportunityLabel: "Beste Cross-Sell-Chance",
      action: {
        title: "Auslastung für nächsten Monat absichern",
        detail: "Priorisiere Accounts mit hohem Potential und schliesse Freigaben für Folgeprojekte schneller ab.",
        owner: "Account",
        kpi: "Auslastung",
      },
    },
    analysis: {
      defaultTab: "benchmark",
      forecastMetric: "revenue",
      focusAreas: ["Auslastung", "Projektprofitabilität", "Kundenbindung"],
      explanation: "Agenturen erhalten zuerst Hinweise zu Kapazität, Risiken und Account-Chancen.",
      prioritizedInsightTypes: ["risk", "opportunity", "weakness", "strength"],
      actions: ["Gefährdete Projekte früh eskalieren", "Upsell-Liste für Bestandskunden erstellen", "Marge je Kunde prüfen"],
    },
    tasks: {
      title: "Agentur-Prioritäten",
      description: "Tasks für Delivery, Accounts und planbare Auslastung.",
      focusLabel: "Nur Delivery-relevante Aufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Upsell-Gespräch für Top-Kunden vorbereiten", priority: "high", assigned_to: "Account" },
        { title: "Kapazitätslücke für nächsten Monat schliessen", priority: "medium", assigned_to: "Operations" },
      ],
    },
  },
  sales_team: {
    id: "sales_team",
    label: "Vertriebsteam",
    shortLabel: "Vertrieb",
    description: "Leads, Pipeline und Abschlüsse priorisiert nach Umsatzchance.",
    accent: "#7C3AED",
    dashboardRole: "assistant",
    preferredWidgets: ["kpis", "tasks", "recommendation", "chart", "alerts", "goals"],
    dashboard: {
      heroLabel: "Pipeline zuerst",
      kpis: ["Lead-Generierung", "Conversion Rate", "Neue Kunden", "Umsatz", "Offene Deals"],
      warningLabel: "Pipeline-Risiko",
      opportunityLabel: "Bester Deal heute",
      action: {
        title: "Deals mit hohem Abschlusswert aktivieren",
        detail: "Konzentriere den Tag auf die nächsten Schritte für warme Leads und stagnierende Opportunities.",
        owner: "Sales",
        kpi: "Neue Kunden",
      },
    },
    analysis: {
      defaultTab: "analyse",
      forecastMetric: "customers",
      focusAreas: ["Lead-Qualität", "Abschlussquote", "Sales-Zyklus"],
      explanation: "Vertrieb sieht zuerst, wo Leads verloren gehen und welche Chancen schnell closen können.",
      prioritizedInsightTypes: ["opportunity", "risk", "weakness", "strength"],
      actions: ["Warme Leads priorisieren", "Pipeline-Stagnation auflösen", "Follow-up-Takt für Top-Deals definieren"],
    },
    tasks: {
      title: "Lead- und Sales-Aufgaben",
      description: "Empfohlene Aufgaben für schnellere Abschlüsse und bessere Pipeline-Hygiene.",
      focusLabel: "Nur Sales-Prioritäten anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Top-10 Leads mit hohem Abschlusswert nachfassen", priority: "high", assigned_to: "Sales" },
        { title: "Deals ohne Aktivität der letzten 7 Tage reaktivieren", priority: "medium", assigned_to: "Sales Ops" },
      ],
    },
  },
  marketing_team: {
    id: "marketing_team",
    label: "Marketing-Team",
    shortLabel: "Marketing",
    description: "Strategische Marketingsteuerung für Kampagnen, Content und Performance mit klarer ROI-Priorisierung.",
    accent: "#0EA5E9",
    dashboardRole: "cmo",
    preferredWidgets: ["kpis", "chart", "recommendation", "alerts", "goals", "tasks"],
    dashboard: {
      heroLabel: "CMO-Steuerung für Kampagnen und Content",
      kpis: ["Marketing ROI", "Traffic", "Lead-Generierung", "Conversion Rate", "Engagement"],
      warningLabel: "Dringendstes Performance-Risiko",
      opportunityLabel: "Bester Skalierungshebel",
      action: {
        title: "Top-Kampagne mit sauberem ROI-Signal skalieren",
        detail: "Verschiebe Budget, Content und Teamzeit in den Kanal mit der besten Kombination aus Reichweite, Lead-Qualität und Conversion.",
        owner: "CMO",
        kpi: "Marketing ROI",
      },
    },
    analysis: {
      defaultTab: "markt",
      forecastMetric: "traffic",
      focusAreas: ["Kampagnenwirkung", "Content-Performance", "Lead-Kosten", "Budget-Effizienz"],
      explanation: "Die CMO-Sicht verdichtet Kanalwirkung, Content-Resonanz, Budget-Allokation und Marketing-KPIs für schnelle Entscheidungen mit klarem Geschäftsbezug.",
      prioritizedInsightTypes: ["opportunity", "strength", "risk", "weakness"],
      actions: [
        "Top-Kampagne nach ROI und Conversion skalieren",
        "Content-Plan auf Themen mit hohem Engagement und Lead-Impact ausrichten",
        "Budget und Timing anhand von CPL, Reichweite und Conversion neu verteilen",
      ],
    },
    tasks: {
      title: "CMO-Prioritäten",
      description: "Aufgaben für Strategie, Content, Kampagnenmanagement und Reporting.",
      focusLabel: "Nur Marketing-Prioritäten anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Budget aus Underperformern in den Kanal mit bestem Lead-zu-Customer-Verhaeltnis verschieben", priority: "high", assigned_to: "CMO" },
        { title: "Content- und Creative-A/B-Test für die schwächste Kampagne vorbereiten", priority: "medium", assigned_to: "Performance" },
      ],
    },
  },
  content_team: {
    id: "content_team",
    label: "Content-Team",
    shortLabel: "Content",
    description: "Engagement, Reichweite und Formate mit Wirkung.",
    accent: "#F59E0B",
    dashboardRole: "cmo",
    preferredWidgets: ["kpis", "recommendation", "chart", "tasks", "alerts", "goals"],
    dashboard: {
      heroLabel: "Reichweite und Resonanz",
      kpis: ["Engagement", "Reichweite", "Traffic", "Social Reach", "Conversion Rate"],
      warningLabel: "Schwächster Content-Impuls",
      opportunityLabel: "Bestes Content-Signal",
      action: {
        title: "Top-Format verdoppeln",
        detail: "Nutze das Thema mit dem besten Engagement für weitere Serien und Distribution.",
        owner: "Content",
        kpi: "Engagement",
      },
    },
    analysis: {
      defaultTab: "analyse",
      forecastMetric: "traffic",
      focusAreas: ["Engagement", "Reichweite", "Content-Performance"],
      explanation: "Content-Teams sehen zuerst, welche Themen und Formate Reichweite und Interaktion treiben.",
      prioritizedInsightTypes: ["opportunity", "strength", "weakness", "risk"],
      actions: ["Top-Content replizieren", "Schwache Hooks überarbeiten", "Distribution für starke Posts erhöhen"],
    },
    tasks: {
      title: "Content-Empfehlungen",
      description: "Relevante Aufgaben für Themenplanung, Verteilung und Performance.",
      focusLabel: "Nur Content-Aufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Bestperformenden Beitrag als Serie fortsetzen", priority: "high", assigned_to: "Content" },
        { title: "Titel und Hook für schwache Inhalte überarbeiten", priority: "medium", assigned_to: "Redaktion" },
      ],
    },
  },
  service_provider: {
    id: "service_provider",
    label: "Dienstleister",
    shortLabel: "Dienstleister",
    description: "Auslastung, Anfragequalität und Kundenservice ohne Ueberfrachtung.",
    accent: "#14B8A6",
    dashboardRole: "assistant",
    preferredWidgets: ["kpis", "tasks", "recommendation", "alerts", "goals", "chart"],
    dashboard: {
      heroLabel: "Auslastung und Service",
      kpis: ["Anfragen", "Auslastung", "Kundenzufriedenheit", "Neue Kunden", "Umsatz"],
      warningLabel: "Service-Risiko",
      opportunityLabel: "Beste Nachfragechance",
      action: {
        title: "Anfragen mit hoher Abschlusswahrscheinlichkeit zuerst bearbeiten",
        detail: "Kombiniere schnelle Antwortzeiten mit klaren Angeboten und folge systematisch nach.",
        owner: "Service",
        kpi: "Neue Kunden",
      },
    },
    analysis: {
      defaultTab: "analyse",
      forecastMetric: "customers",
      focusAreas: ["Anfragequalität", "Auslastung", "Kundenzufriedenheit"],
      explanation: "Dienstleister erhalten Analysen, die direkt auf bessere Auslastung und Servicequalität einzahlen.",
      prioritizedInsightTypes: ["risk", "opportunity", "weakness", "strength"],
      actions: ["Antwortzeit optimieren", "Top-Anfragequellen priorisieren", "Wiederkehrende Service-Lücken schliessen"],
    },
    tasks: {
      title: "Service-Aufgaben",
      description: "Aufgaben mit Fokus auf Auslastung, Kundenservice und Folgegeschaeft.",
      focusLabel: "Nur Service-Prioritäten anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Offene Anfragen mit hohem Potenzial heute beantworten", priority: "high", assigned_to: "Service" },
        { title: "Bestandskunden für Folgeauftrag ansprechen", priority: "medium", assigned_to: "Account" },
      ],
    },
  },
  midsize: {
    id: "midsize",
    label: "Mittelstand",
    shortLabel: "Mittelstand",
    description: "Stabilität, Effizienz und bereichsuebergreifende Transparenz.",
    accent: "#2563EB",
    dashboardRole: "coo",
    preferredWidgets: ["kpis", "chart", "alerts", "tasks", "recommendation", "goals"],
    dashboard: {
      heroLabel: "Transparenz für komplexere Strukturen",
      kpis: ["Umsatz", "Wachstum (MoM)", "Team-Effizienz", "Kundenzufriedenheit", "Conversion Rate"],
      warningLabel: "Bereich mit Handlungsdruck",
      opportunityLabel: "Skalierbare Verbesserung",
      action: {
        title: "Engpass zwischen Teams auflösen",
        detail: "Priorisiere Aufgaben, die Performance in mehreren Bereichen gleichzeitig verbessern.",
        owner: "Management",
        kpi: "Team-Effizienz",
      },
    },
    analysis: {
      defaultTab: "benchmark",
      forecastMetric: "revenue",
      focusAreas: ["Effizienz", "Cross-Team-Abhängigkeiten", "Profitabilität"],
      explanation: "Mittelstand-Versionen zeigen zuerst Analysen mit Wirkung ueber mehrere Teams hinweg.",
      prioritizedInsightTypes: ["risk", "weakness", "opportunity", "strength"],
      actions: ["Abhängigkeiten zwischen Teams sichtbar machen", "Benchmark zu Effizienz nutzen", "Engpass-Prozess standardisieren"],
    },
    tasks: {
      title: "Priorisierte Bereichsaufgaben",
      description: "Empfehlungen für operative Verbesserung ohne unnötige Komplexität.",
      focusLabel: "Nur strategische Kernaufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Kritischen Uebergabepunkt zwischen Teams verbessern", priority: "high", assigned_to: "Operations" },
        { title: "Bereichsreport für nächste Wochensteuerung erstellen", priority: "medium", assigned_to: "Management" },
      ],
    },
  },
  finance_cfo: {
    id: "finance_cfo",
    label: "Finanzen / CFO",
    shortLabel: "CFO",
    description: "Finanzielle Stabilität, Budgetsteuerung und Investitionsentscheidungen mit klarem Blick auf Liquidität, Marge und Risiko.",
    accent: "#0B3C5D",
    dashboardRole: "cfo",
    preferredWidgets: ["kpis", "recommendation", "chart", "alerts", "goals", "tasks"],
    dashboard: {
      heroLabel: "Finanzsteuerung und Stabilität",
      kpis: ["Cashflow", "Umsatz", "Kosten", "Marge", "ROI"],
      warningLabel: "Dringendstes Finanzrisiko",
      opportunityLabel: "Staerkster Finanzhebel",
      action: {
        title: "Budget und Liquidität aktiv steuern",
        detail: "Priorisiere Investitionen nach Wirkung, Risiko und strategischer Relevanz und sichere dabei Cashflow und Marge ab.",
        owner: "CFO",
        kpi: "Cashflow",
      },
    },
    analysis: {
      defaultTab: "prognose",
      forecastMetric: "cashflow",
      focusAreas: ["Cashflow", "Budgetabweichungen", "Marge", "ROI", "Liquidität"],
      explanation: "Die CFO-Version verbindet Finanzkennzahlen mit Budget-, Risiko- und Investitionsentscheidungen für schnelle und belastbare Steuerung.",
      prioritizedInsightTypes: ["risk", "opportunity", "weakness", "strength"],
      actions: ["Cashflow- und Budgetabweichungen priorisieren", "Investitionen nach ROI und Risiko staffeln", "Liquiditätsrisiken früh mit Szenarien absichern"],
    },
    tasks: {
      title: "Finanz-Prioritäten",
      description: "Aufgaben für Finanzsteuerung, Budgetdisziplin und wirtschaftliche Stabilität.",
      focusLabel: "Nur finanzrelevante Aufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Budgetabweichungen der wichtigsten Bereiche prüfen", priority: "high", assigned_to: "CFO" },
        { title: "Investitionsliste nach ROI, Risiko und Liquiditätseffekt priorisieren", priority: "medium", assigned_to: "Finance" },
      ],
    },
  },
  management_ceo: {
    id: "management_ceo",
    label: "Management / CEO",
    shortLabel: "CEO",
    description: "Strategische Signale, Risiken und Chancen für Entscheidungen auf hoher Ebene.",
    accent: "#111827",
    dashboardRole: "ceo",
    preferredWidgets: ["kpis", "recommendation", "alerts", "chart", "tasks", "goals"],
    dashboard: {
      heroLabel: "Strategischer Gesamtblick",
      kpis: ["Umsatz", "Wachstum (MoM)", "Neue Kunden", "Conversion Rate", "Team-Effizienz"],
      warningLabel: "Kritischstes Signal",
      opportunityLabel: "Größte Chance",
      action: {
        title: "Strategische Initiative für diese Woche festlegen",
        detail: "Fokussiere dich auf den Hebel mit der größten Wirkung auf Umsatz, Wachstum und Effizienz.",
        owner: "CEO",
        kpi: "Wachstum",
      },
    },
    analysis: {
      defaultTab: "analyse",
      forecastMetric: "revenue",
      focusAreas: ["Gesamtperformance", "Risiken", "strategische Chancen"],
      explanation: "Die CEO-Version verdichtet Analyse, Risiken und Empfehlungen für schnelle Entscheidungen.",
      prioritizedInsightTypes: ["risk", "opportunity", "strength", "weakness"],
      actions: ["Eine strategische Priorität setzen", "Größten Engpass beseitigen", "Verantwortung klar zuweisen"],
    },
    tasks: {
      title: "Strategische Aufgaben",
      description: "Nur die Aufgaben, die wirklich Management-Aufmerksamkeit benoetigen.",
      focusLabel: "Nur strategische Aufgaben anzeigen",
      resetLabel: "Alle Aufgaben anzeigen",
      suggestions: [
        { title: "Quartalshebel mit größtem Umsatzimpact freigeben", priority: "high", assigned_to: "CEO" },
        { title: "Owner für kritischsten Wachstumsengpass bestimmen", priority: "medium", assigned_to: "Management" },
      ],
    },
  },
};

export const COMPANY_PROFILE_OPTIONS = Object.values(COMPANY_PROFILES);

export function getCompanyProfile(profileId) {
  return COMPANY_PROFILES[profileId] || COMPANY_PROFILES.management_ceo;
}

export function inferCompanyProfile({ team, goals = [], industry = "", mode = "" }) {
  const teamValue = String(team || "").toLowerCase();
  const industryValue = String(industry || "").toLowerCase();
  const modeValue = String(mode || "").toLowerCase();
  const goalSet = new Set(goals);

  if (industryValue.includes("finanz")) return "finance_cfo";
  if (goalSet.has("social") && goalSet.has("traffic")) return "content_team";
  if (goalSet.has("social")) return "marketing_team";
  if (goalSet.has("kunden") && goalSet.has("umsatz")) return "sales_team";
  if (industryValue.includes("beratung")) return "agency";
  if (industryValue.includes("dienst")) return "service_provider";
  if (industryValue.includes("saas") || industryValue.includes("software")) {
    return teamValue === "10+" ? "management_ceo" : "startup";
  }
  if (teamValue === "10+") {
    return goalSet.has("effizienz") || goalSet.has("automation") ? "management_ceo" : "midsize";
  }
  if (modeValue === "lokal") return "small_business";
  return "small_business";
}
