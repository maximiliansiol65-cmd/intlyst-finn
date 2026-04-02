/* eslint-disable */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import StrategyBanner from "../components/StrategyBanner";
import { SkeletonCard } from "../components/ui";

const TABS = ["Übersicht", "Instagram", "TikTok", "YouTube", "Content Ideen", "Strategie"];

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="card" style={{ padding: "var(--s-5)", textAlign: "center" }}>
      <div style={{ fontSize: 24, marginBottom: "var(--s-2)" }}>{icon}</div>
      <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--c-text)" }}>{value ?? "—"}</div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      {sub && <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PlatformBar({ label, icon, color, value, maxValue }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: "var(--s-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <span>{icon}</span><span>{label}</span>
        </span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text-2)" }}>
          {value?.toLocaleString("de-DE") || "—"}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function EmptyConnect({ platform, tab }) {
  const navigate = useNavigate();
  return (
    <div className="empty-state" style={{ padding: "var(--s-12)" }}>
      <div className="empty-icon">{tab === "Instagram" ? "📸" : tab === "TikTok" ? "🎵" : "▶️"}</div>
      <div className="empty-title">{platform} nicht verbunden</div>
      <div className="empty-text">Verbinde {platform} in den Einstellungen um echte Daten zu sehen.</div>
      <button className="btn btn-primary btn-md" onClick={() => navigate(`/settings?tab=${tab.toLowerCase()}`)}>
        {platform} verbinden →
      </button>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function TabOverview({ data, loading }) {
  if (loading) return <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--s-3)" }}>{[0,1,2,3].map(i => <SkeletonCard key={i} lines={3} />)}</div>;

  const totalFollowers = (data?.instagram?.followers || 0) + (data?.tiktok?.followers || 0) + (data?.youtube?.subscribers || 0);
  const avgEngagement = data?.avg_engagement_rate ? `${data.avg_engagement_rate.toFixed(1)}%` : "—";
  const socialRevenue = data?.social_revenue_this_week;
  const maxFollowers = Math.max(data?.instagram?.followers || 0, data?.tiktok?.followers || 0, data?.youtube?.subscribers || 0, 1);

  return (
    <div>
      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--s-3)", marginBottom: "var(--s-6)" }}>
        <StatCard icon="👥" label="Follower gesamt" value={totalFollowers.toLocaleString("de-DE")} />
        <StatCard icon="📊" label="Ø Engagement" value={avgEngagement} />
        <StatCard icon="🏆" label="Bester Post heute" value={data?.best_post_reach?.toLocaleString("de-DE") || "—"} sub="Reichweite" />
        <StatCard icon="💰" label="Social → Revenue" value={socialRevenue ? `€${socialRevenue.toLocaleString("de-DE")}` : "—"} sub="diese Woche" />
      </div>

      {/* Platform Bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)", marginBottom: "var(--s-6)" }}>
        <div className="card" style={{ padding: "var(--s-5)" }}>
          <div style={{ fontWeight: 600, fontSize: "var(--text-md)", marginBottom: "var(--s-4)" }}>Follower nach Platform</div>
          <PlatformBar label="Instagram" icon="📸" color="#E1306C" value={data?.instagram?.followers} maxValue={maxFollowers} />
          <PlatformBar label="TikTok" icon="🎵" color="#010101" value={data?.tiktok?.followers} maxValue={maxFollowers} />
          <PlatformBar label="YouTube" icon="▶️" color="#FF0000" value={data?.youtube?.subscribers} maxValue={maxFollowers} />
        </div>

        {/* Revenue Correlation */}
        <div className="card" style={{ padding: "var(--s-5)" }}>
          <div style={{ fontWeight: 600, fontSize: "var(--text-md)", marginBottom: "var(--s-3)" }}>📈 Social → Revenue Korrelation</div>
          {data?.social_revenue_delay ? (
            <div style={{ lineHeight: "var(--lh-loose)" }}>
              <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--c-primary)", marginBottom: "var(--s-2)" }}>
                +€{data.avg_revenue_per_post?.toLocaleString("de-DE") || "340"}
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                durchschnittlicher Umsatz pro Post
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)", marginTop: "var(--s-2)" }}>
                📅 Erscheint {data.social_revenue_delay || "2–3"} Tage nach dem Post
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: "var(--s-4)" }}>
              Verbinde Social-Accounts und Stripe/Shopify für Korrelationsanalyse.
            </div>
          )}
        </div>
      </div>

      {/* Top Posts */}
      {data?.top_posts?.length > 0 && (
        <div className="card" style={{ padding: "var(--s-5)" }}>
          <div style={{ fontWeight: 600, fontSize: "var(--text-md)", marginBottom: "var(--s-4)" }}>🏆 Top Posts diese Woche</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {data.top_posts.slice(0, 3).map((post, i) => (
              <div key={i} className="card" style={{ padding: "var(--s-3) var(--s-4)", display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{post.platform === "instagram" ? "📸" : post.platform === "tiktok" ? "🎵" : "▶️"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }} className="truncate">{post.caption || "Post"}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Reichweite: {post.reach?.toLocaleString("de-DE")} · Engagement: {post.engagement_rate?.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data && (
        <div className="empty-state">
          <div className="empty-icon">📱</div>
          <div className="empty-title">Noch keine Social-Daten</div>
          <div className="empty-text">Verbinde Instagram, TikTok oder YouTube in den Einstellungen.</div>
        </div>
      )}
    </div>
  );
}

// ── Instagram Tab ─────────────────────────────────────────────────────────────
function TabInstagram({ data }) {
  if (!data?.instagram) return <EmptyConnect platform="Instagram" tab="Instagram" />;
  const ig = data.instagram;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--s-3)", marginBottom: "var(--s-6)" }}>
        <StatCard icon="👥" label="Follower" value={ig.followers?.toLocaleString("de-DE")} />
        <StatCard icon="📊" label="Ø Engagement" value={ig.avg_engagement ? `${ig.avg_engagement.toFixed(1)}%` : "—"} />
        <StatCard icon="📸" label="Posts" value={ig.post_count} />
      </div>

      <div className="card" style={{ padding: "var(--s-5)", marginBottom: "var(--s-4)" }}>
        <div style={{ fontWeight: 600, marginBottom: "var(--s-4)" }}>🕐 Bestes Posting-Fenster</div>
        {ig.best_posting_times ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
            {ig.best_posting_times.map((t, i) => (
              <span key={i} className="badge badge-info">{t}</span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Noch nicht genug Daten. Poste mindestens 10 Mal.</div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--s-5)" }}>
        <div style={{ fontWeight: 600, marginBottom: "var(--s-4)" }}>📊 Content-Typ Performance</div>
        {ig.content_types ? (
          Object.entries(ig.content_types).map(([type, reach]) => (
            <PlatformBar key={type} label={type} icon={type === "Reels" ? "🎬" : type === "Foto" ? "🖼️" : "📱"} color="var(--c-primary)" value={reach} maxValue={Math.max(...Object.values(ig.content_types), 1)} />
          ))
        ) : (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Verbinde Instagram für Content-Typ-Analyse.</div>
        )}
      </div>
    </div>
  );
}

// ── TikTok Tab ────────────────────────────────────────────────────────────────
function TabTikTok({ data }) {
  if (!data?.tiktok) return <EmptyConnect platform="TikTok" tab="TikTok" />;
  const tt = data.tiktok;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--s-3)", marginBottom: "var(--s-6)" }}>
        <StatCard icon="👥" label="Follower" value={tt.followers?.toLocaleString("de-DE")} />
        <StatCard icon="👁️" label="Ø Completion Rate" value={tt.avg_completion ? `${tt.avg_completion.toFixed(0)}%` : "—"} sub="wichtigste Metrik" />
        <StatCard icon="🔥" label="Ø Virality Score" value={tt.virality_score?.toFixed(1) || "—"} />
      </div>

      {tt.videos?.length > 0 && (
        <div className="card" style={{ padding: "var(--s-5)" }}>
          <div style={{ fontWeight: 600, marginBottom: "var(--s-4)" }}>🎵 Top Videos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {tt.videos.slice(0, 5).map((v, i) => (
              <div key={i} className="card" style={{ padding: "var(--s-3) var(--s-4)", display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                <div style={{ width: 32, height: 32, background: "var(--c-surface-3)", borderRadius: "var(--r-xs)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎵</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }} className="truncate">{v.description || `Video ${i+1}`}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>
                    {v.views?.toLocaleString("de-DE")} Views · {v.completion_rate?.toFixed(0)}% Completion
                  </div>
                </div>
                <span className="badge badge-info">{v.virality_score?.toFixed(1) || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── YouTube Tab ───────────────────────────────────────────────────────────────
function TabYouTube({ data }) {
  if (!data?.youtube) return <EmptyConnect platform="YouTube" tab="YouTube" />;
  const yt = data.youtube;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--s-3)", marginBottom: "var(--s-6)" }}>
        <StatCard icon="📺" label="Subscribers" value={yt.subscribers?.toLocaleString("de-DE")} />
        <StatCard icon="👁️" label="Views (30T)" value={yt.views_30d?.toLocaleString("de-DE")} />
        <StatCard icon="⏱️" label="Watch Time (h)" value={yt.watch_time_hours?.toLocaleString("de-DE")} />
      </div>

      {yt.videos?.length > 0 && (
        <div className="card" style={{ padding: "var(--s-5)" }}>
          <div style={{ fontWeight: 600, marginBottom: "var(--s-4)" }}>▶️ Top Videos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
            {yt.videos.slice(0, 5).map((v, i) => (
              <div key={i} className="card" style={{ padding: "var(--s-3) var(--s-4)", display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                <div style={{ width: 48, height: 32, background: "var(--c-surface-3)", borderRadius: "var(--r-xs)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>▶️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }} className="truncate">{v.title}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{v.views?.toLocaleString("de-DE")} Views · {v.watch_time_hours?.toFixed(0)}h Watch Time</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Content Ideas Tab ──────────────────────────────────────────────────────────
function TabContentIdeen({ authHeader }) {
  const toast = useToast();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(false);

  async function generateIdeas() {
    setLoading(true);
    try {
      const res = await fetch("/api/growth/social-content-ideas", { headers: authHeader() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIdeas(Array.isArray(data) ? data : data.ideas ?? []);
    } catch {
      toast.error("Ideen konnten nicht generiert werden.");
      setIdeas(DEMO_IDEAS);
    } finally { setLoading(false); }
  }

  const DEMO_IDEAS = [
    { platform: "Instagram", format: "Reel", hook: "3 Dinge die ich gerne früher gewusst hätte über…", cta: "Speichern für später", timing: "Mo–Fr 18–20 Uhr", icon: "📸" },
    { platform: "TikTok", format: "Video", hook: "POV: Du entdeckst diesen Trick für dein Business", cta: "Folge für mehr", timing: "Di & Do 12–14 Uhr", icon: "🎵" },
    { platform: "Instagram", format: "Carousel", hook: "5 Fehler die 90% der Unternehmer machen", cta: "Kommentiere Nummer 1", timing: "Mi 08–10 Uhr", icon: "📸" },
    { platform: "YouTube", format: "Video (10-15min)", hook: "Mein komplettes System für [Ziel] erklärt", cta: "Abonnieren", timing: "Sa 10 Uhr", icon: "▶️" },
    { platform: "TikTok", format: "Duett/Stitch", hook: "Reagiere auf Kundenfeedback live", cta: "Folge für Antworten", timing: "Täglich 17–19 Uhr", icon: "🎵" },
    { platform: "Instagram", format: "Story", hook: "Poll: Was nervt euch mehr? A oder B?", cta: "Abstimmen", timing: "Täglich 20–22 Uhr", icon: "📸" },
  ];

  const displayIdeas = ideas.length > 0 ? ideas : DEMO_IDEAS;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--s-5)" }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)" }}>Basiert auf deinem Wachstumsziel aus Settings → Strategie</div>
        <button className="btn btn-primary btn-md" onClick={generateIdeas} disabled={loading} style={{ minWidth: 180 }}>
          {loading ? "Generiere…" : "✦ Neue Ideen generieren"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "var(--s-4)" }}>
        {displayIdeas.map((idea, i) => (
          <div key={i} className="card" style={{ padding: "var(--s-5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-3)" }}>
              <span style={{ fontSize: 20 }}>{idea.icon || (idea.platform === "Instagram" ? "📸" : idea.platform === "TikTok" ? "🎵" : "▶️")}</span>
              <span className="badge badge-info">{idea.platform}</span>
              <span className="badge badge-neutral">{idea.format}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-md)", color: "var(--c-text)", marginBottom: "var(--s-2)", lineHeight: "var(--lh-tight)" }}>
              "{idea.hook}"
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)", marginTop: "var(--s-3)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>📣 CTA: {idea.cta}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>⏰ Timing: {idea.timing}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Strategie Tab ──────────────────────────────────────────────────────────────
function TabStrategie({ authHeader }) {
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/growth/social-strategy", { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStrategy(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []); // eslint-disable-line

  const DEMO = {
    platforms: [
      { name: "Instagram", icon: "📸", frequency: "5–7x / Woche", focus: "Reels + Carousels", best_hooks: ["Hinter den Kulissen", "Vorher/Nachher", "Checkliste"] },
      { name: "TikTok", icon: "🎵", frequency: "3–5x / Woche", focus: "Educational + Trending Audio", best_hooks: ["POV:", "Niemand redet darüber", "So machst du X in Y Minuten"] },
    ],
    key_message: "Positioniere dich als Experte in deiner Nische. Zeige konkrete Ergebnisse.",
  };

  const data = strategy || DEMO;

  return (
    <div>
      {data.key_message && (
        <div className="card" style={{ padding: "var(--s-5)", marginBottom: "var(--s-6)", borderLeft: "3px solid var(--c-primary)", background: "var(--c-primary-light)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--c-primary)", fontWeight: 600, marginBottom: "var(--s-2)" }}>🎯 KERNBOTSCHAFT</div>
          <div style={{ fontSize: "var(--text-md)", color: "var(--c-text)", fontWeight: 600 }}>{data.key_message}</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "var(--s-4)" }}>
        {data.platforms?.map((p, i) => (
          <div key={i} className="card" style={{ padding: "var(--s-5)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", marginBottom: "var(--s-4)" }}>
              <span style={{ fontSize: 24 }}>{p.icon}</span>
              <span style={{ fontWeight: 700, fontSize: "var(--text-md)" }}>{p.name}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", fontSize: "var(--text-sm)" }}>
              <div><span style={{ color: "var(--c-text-3)" }}>Frequenz: </span><span style={{ fontWeight: 600 }}>{p.frequency}</span></div>
              <div><span style={{ color: "var(--c-text-3)" }}>Fokus: </span><span style={{ fontWeight: 600 }}>{p.focus}</span></div>
              {p.best_hooks?.length > 0 && (
                <div>
                  <div style={{ color: "var(--c-text-3)", marginBottom: "var(--s-2)" }}>Hook-Formeln:</div>
                  {p.best_hooks.map((h, j) => (
                    <div key={j} className="card" style={{ padding: "var(--s-2) var(--s-3)", marginBottom: "var(--s-1)", fontSize: "var(--text-xs)", fontWeight: 500 }}>"{h}"</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Social Page ───────────────────────────────────────────────────────────
export default function Social() {
  const { authHeader } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/growth/social-metrics", { headers: authHeader() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []); // eslint-disable-line

  const tabs = ["Übersicht", "Instagram", "TikTok", "YouTube", "Content Ideen", "Strategie"];

  function renderTab() {
    switch (activeTab) {
      case 0: return <TabOverview data={data} loading={loading} />;
      case 1: return <TabInstagram data={data} />;
      case 2: return <TabTikTok data={data} />;
      case 3: return <TabYouTube data={data} />;
      case 4: return <TabContentIdeen authHeader={authHeader} />;
      case 5: return <TabStrategie authHeader={authHeader} />;
      default: return null;
    }
  }

  return (
    <div className="page-enter" style={{ background: "var(--c-bg)", minHeight: "calc(100dvh - var(--nav-height))", padding: "var(--s-8)" }}>
      <StrategyBanner />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--s-6)", flexWrap: "wrap", gap: "var(--s-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--text-title)", fontWeight: 700, color: "var(--c-text)" }}>Social Media</h1>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", marginTop: "var(--s-1)" }}>
            Performance · Content · Strategie
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="tabs-pill" style={{ marginBottom: "var(--s-6)", flexWrap: "wrap" }}>
        {tabs.map((tab, i) => (
          <button key={tab} className={`tab-pill${activeTab === i ? " active" : ""}`} onClick={() => setActiveTab(i)}>
            {tab}
          </button>
        ))}
      </div>

      {renderTab()}
    </div>
  );
}
