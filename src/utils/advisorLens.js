const PRIORITY_META = {
  critical: {
    label: "Kritisch",
    actionLabel: "sofort handeln",
    tone: "#b91c1c",
    bg: "#fef2f2",
  },
  high: {
    label: "Hoch",
    actionLabel: "zeitnah optimieren",
    tone: "#c2410c",
    bg: "#fff7ed",
  },
  medium: {
    label: "Mittel",
    actionLabel: "beobachten",
    tone: "#a16207",
    bg: "#fefce8",
  },
  low: {
    label: "Niedrig",
    actionLabel: "aktuell ignorieren",
    tone: "#1d4ed8",
    bg: "#eff6ff",
  },
};

const TIMEFRAME_LABELS = {
  immediate: "sofort",
  this_week: "diese Woche",
  this_month: "diesen Monat",
  this_quarter: "dieses Quartal",
};

const CATEGORY_LABELS = {
  marketing: "Marketing",
  product: "Produkt",
  sales: "Sales",
  operations: "Operations",
  finance: "Finanzen",
};

const ROLE_LABELS = {
  CEO: "AI CEO",
  COO: "AI COO",
  CMO: "AI CMO",
  CFO: "AI CFO",
  Strategist: "AI Strategist",
};

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toSentence(value, fallback = "") {
  const text = cleanText(value, fallback);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function formatPercent(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return `${numeric > 0 ? "+" : ""}${numeric}%`;
}

function getPriorityMeta(priority, fallback = "medium") {
  return PRIORITY_META[priority] || PRIORITY_META[fallback] || PRIORITY_META.medium;
}

function buildInsightPriority(insight, index = 0) {
  if (insight?.priority) return insight.priority;
  if (insight?.impact === "high" || insight?.impact_level === "high") return index === 0 ? "critical" : "high";
  if (insight?.impact === "low" || insight?.impact_level === "low") return "low";
  return "medium";
}

function inferRole(text) {
  const haystack = String(text || "").toLowerCase();
  if (["cash", "marge", "profit", "roi", "budget", "kosten", "umsatz"].some((token) => haystack.includes(token))) return "CFO";
  if (["traffic", "lead", "kampagne", "marketing", "content", "reach"].some((token) => haystack.includes(token))) return "CMO";
  if (["conversion", "funnel", "checkout", "prozess", "effizienz", "operations"].some((token) => haystack.includes(token))) return "COO";
  if (["forecast", "chance", "benchmark", "segment", "markt", "szenario"].some((token) => haystack.includes(token))) return "Strategist";
  return "CEO";
}

function buildWeightedCauses(names = [], scores = []) {
  return names
    .map((name, index) => ({
      label: cleanText(name),
      score: Number.isFinite(Number(scores[index])) ? Number(scores[index]) : null,
    }))
    .filter((entry) => entry.label);
}

function buildRecommendationPriority(rec, index = 0) {
  if (rec?.priority === "high") return index === 0 ? "critical" : "high";
  if (rec?.priority === "low") return "low";
  return "medium";
}

export function buildAdvisoryBriefFromInsight(insight, index = 0) {
  const priorityKey = buildInsightPriority(insight, index);
  const priority = getPriorityMeta(priorityKey);
  const delta = formatPercent(insight?.impact_pct);
  const confidence = Number.isFinite(Number(insight?.confidence)) ? `${Number(insight.confidence)}% Konfidenz` : null;
  const analysis = toSentence(
    insight?.description,
    `${cleanText(insight?.title, "Ein relevantes Signal")} beeinflusst aktuell die Leistung.`,
  );
  const assessment = toSentence(
    insight?.problem || insight?.evidence || insight?.kpi_link,
    "Das Signal ist operativ relevant und sollte im KPI-Kontext bewertet werden.",
  );
  const immediateAction = cleanText(insight?.action, "Sofortmassnahme definieren und umsetzen");
  const midTermAction = cleanText(
    insight?.expected_result,
    "In den naechsten 2 bis 4 Wochen einen messbaren Zielkorridor absichern",
  );
  const strategicAction = cleanText(
    insight?.strategic_context,
    "Das Muster in einen wiederholbaren Management-Hebel ueberfuehren",
  );
  const causes = [
    cleanText(insight?.cause_primary),
    ...(Array.isArray(insight?.cause_secondary) ? insight.cause_secondary : []),
    ...(Array.isArray(insight?.cause_amplifiers) ? insight.cause_amplifiers : []),
  ].filter(Boolean);
  const ownerRole = cleanText(
    insight?.owner_role,
    inferRole(insight?.kpi_link || insight?.primary_metric || insight?.title),
  );

  return {
    title: cleanText(insight?.title, "Beratungs-Impuls"),
    type: cleanText(insight?.type, "opportunity"),
    priorityKey,
    priority,
    analysis,
    assessment,
    recommendation: {
      immediate: toSentence(immediateAction),
      midTerm: toSentence(midTermAction),
      strategic: toSentence(strategicAction),
    },
    prioritization: `${priority.label} - ${priority.actionLabel}${delta ? ` (${delta} moeglicher KPI-Effekt)` : ""}${confidence ? `, ${confidence}` : ""}.`,
    strategicPerspective: toSentence(
      strategicAction,
      "Wenn dieses Muster anhaelt, beeinflusst es die mittelfristige Zielerreichung direkt.",
    ),
    evidence: toSentence(
      insight?.evidence,
      "Die Datenlage ist noch begrenzt, das Signal sollte weiter validiert werden.",
    ),
    causes,
    weightedCauses: {
      primary: {
        label: cleanText(insight?.cause_primary, "Hauptursache noch nicht sauber isoliert"),
        score: Number.isFinite(Number(insight?.cause_primary_score)) ? Number(insight.cause_primary_score) : null,
      },
      secondary: buildWeightedCauses(insight?.cause_secondary, insight?.cause_secondary_scores),
      amplifiers: buildWeightedCauses(insight?.cause_amplifiers, insight?.cause_amplifier_scores),
    },
    kpiLink: cleanText(insight?.kpi_link, "Kern-KPI des Unternehmens"),
    primaryMetric: cleanText(insight?.primary_metric, cleanText(insight?.kpi_link, "Kern-KPI")),
    ownerRole,
    ownerLabel: ROLE_LABELS[ownerRole] || `AI ${ownerRole}`,
    dashboardSummary: toSentence(insight?.dashboard_summary, analysis),
    benchmarkNote: toSentence(
      insight?.benchmark_note,
      "Benchmark-Vergleich sollte gegen internes Ziel und historische Leistung geprueft werden.",
    ),
    forecastNote: toSentence(
      insight?.forecast_note,
      "Der aktuelle Trend sollte fuer die naechsten 30 Tage weiter beobachtet werden.",
    ),
    periods: {
      sevenDays: toSentence(insight?.period_7d, "7 Tage: Kurzfristiges Signal beobachten."),
      thirtyDays: toSentence(insight?.period_30d, "30 Tage: Monatstrend gegen Vorperiode pruefen."),
      twelveMonths: toSentence(insight?.period_12m, "12 Monate: Langfristige Entwicklung gegen Saisonalitaet einordnen."),
    },
  };
}

export function buildAdvisoryAgendaFromAnalysis(data) {
  const insights = Array.isArray(data?.insights) ? data.insights : [];
  const items = insights
    .slice(0, 5)
    .map((insight, index) => buildAdvisoryBriefFromInsight(insight, index));

  const headline = cleanText(data?.ceo_summary || data?.summary, "Die aktuelle Lage verlangt eine aktive Management-Entscheidung.");
  const topItem = items[0];

  return {
    headline,
    analysis: toSentence(
      data?.summary,
      topItem?.analysis || "Mehrere KPIs zeigen eine relevante Veraenderung.",
    ),
    assessment: toSentence(
      topItem?.assessment,
      "Das Signal ist geschaeftlich relevant und nicht nur ein statistischer Ausschlag.",
    ),
    recommendation: {
      immediate: toSentence(data?.top_action, topItem?.recommendation.immediate || "Sofortmassnahme festlegen"),
      midTerm: topItem?.recommendation.midTerm || "Mittelfristigen Umsetzungsplan aufsetzen.",
      strategic: topItem?.recommendation.strategic || "Strategischen Hebel in den Management-Rhythmus uebernehmen.",
    },
    prioritization: topItem?.prioritization || "Maximal die wichtigsten 3 bis 5 Themen gleichzeitig bearbeiten.",
    strategicPerspective: topItem?.strategicPerspective || "Die Entwicklung wirkt auf Wachstum, Profitabilitaet oder Risiko der naechsten Wochen.",
    items,
  };
}

export function buildRecommendationDecision(rec, index = 0) {
  const priorityKey = buildRecommendationPriority(rec, index);
  const priority = getPriorityMeta(priorityKey);
  const category = CATEGORY_LABELS[rec?.category] || cleanText(rec?.category, "Business");
  const timeframe = TIMEFRAME_LABELS[rec?.timeframe] || cleanText(rec?.timeframe, "zeitnah");
  const impact = formatPercent(rec?.impact_pct, "ohne klare Wirkungsschaetzung");

  return {
    id: rec?.id || `${index}`,
    title: cleanText(rec?.title, "Empfehlung"),
    category,
    owner: cleanText(rec?.owner_role, "Management"),
    ownerLabel: ROLE_LABELS[cleanText(rec?.owner_role, inferRole(rec?.kpi_link || rec?.title))] || `AI ${cleanText(rec?.owner_role, inferRole(rec?.kpi_link || rec?.title))}`,
    priorityKey,
    priority,
    analysis: toSentence(
      rec?.rationale,
      "Mehrere Signale deuten auf einen konkreten Handlungshebel hin.",
    ),
    assessment: toSentence(
      rec?.priority_reason,
      `Der Hebel ist fuer ${category} relevant und sollte ${timeframe} entschieden werden.`,
    ),
    recommendation: {
      immediate: toSentence(rec?.action_label, "Sofortmassnahme festlegen"),
      midTerm: toSentence(rec?.description, "Umsetzungsplan fuer die naechsten Wochen konkretisieren"),
      strategic: toSentence(
        rec?.strategic_context,
        "Die Massnahme als wiederholbares Steuerungsprinzip im Unternehmen verankern",
      ),
    },
    prioritization: `${priority.label} - ${priority.actionLabel}. Erwarteter Effekt: ${impact}.`,
    strategicPerspective: toSentence(
      rec?.strategic_context,
      "Die Empfehlung beeinflusst die mittelfristige Skalierbarkeit des Unternehmens.",
    ),
    expectedResult: toSentence(
      rec?.expected_result,
      "Nach Umsetzung sollte ein messbarer KPI-Effekt sichtbar werden.",
    ),
    kpiLink: cleanText(rec?.kpi_link, "Kern-KPI des Unternehmens"),
    effort: cleanText(rec?.effort, "medium"),
    timeframe,
    riskLevel: cleanText(rec?.risk_level, "medium"),
  };
}

export function buildRecommendationAgenda(data) {
  const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];
  const items = recommendations
    .slice(0, 5)
    .map((rec, index) => buildRecommendationDecision(rec, index));

  const topItem = items[0];

  return {
    analysis: topItem?.analysis || "Die aktuellen Daten zeigen mehrere priorisierbare Handlungshebel.",
    assessment: topItem?.assessment || "Nicht alle Themen sind gleich wichtig; Fokus ist entscheidend.",
    recommendation: {
      immediate: topItem?.recommendation.immediate || "Sofort die erste priorisierte Massnahme starten.",
      midTerm: topItem?.recommendation.midTerm || "Mittelfristige Umsetzungslogik definieren.",
      strategic: topItem?.recommendation.strategic || "Langfristige Management-Routine fuer diesen Hebel etablieren.",
    },
    prioritization: topItem?.prioritization || "Maximal 3 bis 5 zentrale Themen gleichzeitig steuern.",
    strategicPerspective: topItem?.strategicPerspective || "Die Auswahl heutiger Massnahmen bestimmt die Performance der naechsten Wochen.",
    items,
  };
}

export function getPriorityPalette(priorityKey) {
  return getPriorityMeta(priorityKey);
}
