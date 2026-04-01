import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";

export default function TeamCenter() {
  const { authHeader, refreshSession, token, loading: authLoading, logout } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const [authExpired, setAuthExpired] = useState(false);
  const [permUserId, setPermUserId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [companySaving, setCompanySaving] = useState(false);
  const [schedule, setSchedule] = useState({ timezone: "Europe/Berlin", weekly_hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6, sat: 0, sun: 0 } });
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [membershipErrorShown, setMembershipErrorShown] = useState(false);

  function buildAuthHeaders({ includeWorkspace = true } = {}) {
    const headers = { ...authHeader() };
    if (!includeWorkspace) {
      delete headers["X-Workspace-ID"];
    }
    return headers;
  }

  async function fetchWithWorkspaceFallback(url, options = {}) {
    const firstHeaders = { ...buildAuthHeaders(), ...(options.headers || {}) };
    let response = await fetch(url, { ...options, headers: firstHeaders });

    if (response.status === 401 && refreshSession) {
      const refreshed = await refreshSession();
      if (refreshed) {
        const retryHeaders = { ...buildAuthHeaders(), ...(options.headers || {}) };
        response = await fetch(url, { ...options, headers: retryHeaders });
      }
    }

    if (response.status === 401) {
      setAuthExpired(true);
      if (logout) logout();
      return response;
    }

    if (!response.ok && firstHeaders["X-Workspace-ID"]) {
      const fallbackHeaders = { ...buildAuthHeaders({ includeWorkspace: false }), ...(options.headers || {}) };
      response = await fetch(url, { ...options, headers: fallbackHeaders });
    }

    return response;
  }

  useEffect(() => {
    if (!token && !authLoading) {
      setLoading(false);
      setTeamsLoading(false);
      setMembershipsLoading(false);
      setCompaniesLoading(false);
      setScheduleLoading(false);
    }
  }, [token, authLoading]);

  const fetchMembers = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/team/members");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : data.members ?? []);
    } catch {
      toast.error("Team konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [authHeader, toast]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const fetchCompanies = useCallback(async () => {
    if (!token) {
      setCompaniesLoading(false);
      return;
    }
    setCompaniesLoading(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/companies");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items ?? [];
      setCompanies(items);
      const first = items[0];
      if (first) {
        setCompanyName(first.name ?? "");
        setCompanySlug(first.slug ?? "");
      }
    } catch {
      toast.error("Firma konnte nicht geladen werden.");
    } finally {
      setCompaniesLoading(false);
    }
  }, [authHeader, toast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const fetchSchedule = useCallback(async () => {
    if (!token) {
      setScheduleLoading(false);
      return;
    }
    setScheduleLoading(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/work-schedules");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const items = Array.isArray(data) ? data : data.items ?? [];
      const first = items[0];
      if (first) {
        const weekly = first.weekly_hours_json ? JSON.parse(first.weekly_hours_json) : {};
        setSchedule({
          id: first.id,
          timezone: first.timezone || "Europe/Berlin",
          weekly_hours: {
            mon: weekly.mon ?? 8,
            tue: weekly.tue ?? 8,
            wed: weekly.wed ?? 8,
            thu: weekly.thu ?? 8,
            fri: weekly.fri ?? 6,
            sat: weekly.sat ?? 0,
            sun: weekly.sun ?? 0,
          },
        });
      }
    } catch {
      toast.error("Arbeitszeiten konnten nicht geladen werden.");
    } finally {
      setScheduleLoading(false);
    }
  }, [authHeader, toast]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const fetchTeams = useCallback(async () => {
    if (!token) {
      setTeamsLoading(false);
      return;
    }
    setTeamsLoading(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/teams");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : data.items ?? []);
    } catch {
      toast.error("Teams konnten nicht geladen werden.");
    } finally {
      setTeamsLoading(false);
    }
  }, [authHeader, toast]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  useEffect(() => {
    let active = true;
    async function run() {
      if (!token) {
        if (active) setMembershipsLoading(false);
        return;
      }
      if (active) setMembershipsLoading(true);
      try {
        const res = await fetchWithWorkspaceFallback("/api/teams/memberships");
        if (!res.ok) {
          if (res.status === 404 || res.status === 422) {
            if (active) setMemberships([]);
            return;
          }
          throw new Error();
        }
        const data = await res.json();
        if (active) setMemberships(Array.isArray(data) ? data : data.items ?? []);
      } catch {
        if (!membershipErrorShown) {
          toast.error("Team-Zuordnungen konnten nicht geladen werden.");
          if (active) setMembershipErrorShown(true);
        }
      } finally {
        if (active) setMembershipsLoading(false);
      }
    }
    run();
    return () => { active = false; };
  }, [token]);

  async function inviteMember() {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Einladung an ${inviteEmail} gesendet.`);
      setInviteEmail("");
      fetchMembers();
    } catch {
      toast.error("Einladung fehlgeschlagen.");
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(id) {
    setRemovingId(id);
    try {
      const res = await fetchWithWorkspaceFallback(`/api/team/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Mitglied entfernt.");
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch {
      toast.error("Entfernen fehlgeschlagen.");
    } finally {
      setRemovingId(null);
    }
  }

  const ROLE_LABELS = { admin: "Admin", manager: "Manager", member: "Mitglied", owner: "Inhaber" };
  const ROLE_MATRIX = [
    { role: "Admin", desc: "Voller Zugriff: Team, Inhalte, Einstellungen" },
    { role: "Manager", desc: "Kann Tasks, Ziele, Alerts bearbeiten" },
    { role: "Mitglied", desc: "Kann Tasks sehen und bearbeiten" },
  ];
  const PERMISSION_LABELS = {
    dashboard: "Dashboard",
    insights: "Insights",
    tasks: "Tasks",
    alerts: "Alerts",
    data: "Daten",
    market: "Markt",
    customers: "Kunden",
    settings: "Einstellungen",
  };
  const PRESETS = {
    admin: {
      dashboard:  { can_view: true,  can_edit: true,  can_delete: true },
      insights:   { can_view: true,  can_edit: true,  can_delete: true },
      tasks:      { can_view: true,  can_edit: true,  can_delete: true },
      alerts:     { can_view: true,  can_edit: true,  can_delete: true },
      data:       { can_view: true,  can_edit: true,  can_delete: true },
      market:     { can_view: true,  can_edit: true,  can_delete: false },
      customers:  { can_view: true,  can_edit: true,  can_delete: false },
      settings:   { can_view: true,  can_edit: true,  can_delete: false },
    },
    manager: {
      dashboard:  { can_view: true,  can_edit: true,  can_delete: false },
      insights:   { can_view: true,  can_edit: true,  can_delete: false },
      tasks:      { can_view: true,  can_edit: true,  can_delete: true },
      alerts:     { can_view: true,  can_edit: true,  can_delete: false },
      data:       { can_view: true,  can_edit: false, can_delete: false },
      market:     { can_view: true,  can_edit: false, can_delete: false },
      customers:  { can_view: true,  can_edit: true,  can_delete: false },
      settings:   { can_view: false, can_edit: false, can_delete: false },
    },
    member: {
      dashboard:  { can_view: true,  can_edit: false, can_delete: false },
      insights:   { can_view: true,  can_edit: false, can_delete: false },
      tasks:      { can_view: true,  can_edit: true,  can_delete: false },
      alerts:     { can_view: true,  can_edit: false, can_delete: false },
      data:       { can_view: true,  can_edit: false, can_delete: false },
      market:     { can_view: true,  can_edit: false, can_delete: false },
      customers:  { can_view: true,  can_edit: false, can_delete: false },
      settings:   { can_view: false, can_edit: false, can_delete: false },
    },
  };

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      const res = await fetchWithWorkspaceFallback("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      if (!res.ok) throw new Error();
      setNewTeamName("");
      await fetchTeams();
      toast.success("Team erstellt.");
    } catch {
      toast.error("Team konnte nicht erstellt werden.");
    } finally {
      setCreatingTeam(false);
    }
  }

  async function deleteTeam(id) {
    setDeletingTeamId(id);
    try {
      const res = await fetchWithWorkspaceFallback(`/api/teams/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTeams((prev) => prev.filter((t) => t.id !== id));
      toast.success("Team entfernt.");
    } catch {
      toast.error("Team konnte nicht entfernt werden.");
    } finally {
      setDeletingTeamId(null);
    }
  }

  async function saveCompany() {
    if (!companyName.trim()) return;
    setCompanySaving(true);
    try {
      if (companies.length === 0) {
        const res = await fetchWithWorkspaceFallback("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: companyName.trim(), slug: companySlug.trim() || null }),
        });
        if (!res.ok) throw new Error();
      } else {
        const target = companies[0];
        const res = await fetchWithWorkspaceFallback(`/api/companies/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: companyName.trim(), slug: companySlug.trim() || null }),
        });
        if (!res.ok) throw new Error();
      }
      await fetchCompanies();
      toast.success("Firmendaten gespeichert.");
    } catch {
      toast.error("Firmendaten konnten nicht gespeichert werden.");
    } finally {
      setCompanySaving(false);
    }
  }

  async function updateMemberRole(userId, role) {
    try {
      const res = await fetchWithWorkspaceFallback(`/api/team/members/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
      toast.success("Rolle aktualisiert.");
    } catch {
      toast.error("Rolle konnte nicht geändert werden (Admin erforderlich).");
    }
  }

  function getMemberTeamId(userId) {
    const match = memberships.find((m) => m.user_id === userId);
    return match ? String(match.team_id) : "";
  }

  function getMemberSpecialty(userId) {
    const match = memberships.find((m) => m.user_id === userId);
    return match?.specialty ?? "";
  }

  async function assignMemberToTeam(userId, nextTeamId) {
    const current = memberships.find((m) => m.user_id === userId);
    try {
      if (!nextTeamId) {
        if (current) {
          const res = await fetchWithWorkspaceFallback(`/api/teams/${current.team_id}/members/${userId}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
        }
      } else {
        const teamIdNum = Number(nextTeamId);
        if (current && current.team_id === teamIdNum) return;
        if (current) {
          const resDel = await fetchWithWorkspaceFallback(`/api/teams/${current.team_id}/members/${userId}`, { method: "DELETE" });
          if (!resDel.ok) throw new Error();
        }
        const resAdd = await fetchWithWorkspaceFallback(`/api/teams/${teamIdNum}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        if (!resAdd.ok) throw new Error();
      }
      await fetchMemberships();
      toast.success("Team-Zuordnung gespeichert.");
    } catch {
      toast.error("Team-Zuordnung konnte nicht gespeichert werden.");
    }
  }

  async function updateMemberSpecialty(userId, specialty) {
    const current = memberships.find((m) => m.user_id === userId);
    if (!current) {
      toast.error("Bitte zuerst ein Team zuordnen.");
      return;
    }
    try {
      const res = await fetchWithWorkspaceFallback(`/api/teams/${current.team_id}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty }),
      });
      if (!res.ok) throw new Error();
      await fetchMemberships();
      toast.success("Fachgebiet gespeichert.");
    } catch {
      toast.error("Fachgebiet konnte nicht gespeichert werden.");
    }
  }

  async function fetchPermissions(userId) {
    if (!userId || !token) return;
    setPermissionsLoading(true);
    try {
      const res = await fetchWithWorkspaceFallback(`/api/team/permissions/${userId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPermissions(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Berechtigungen konnten nicht geladen werden.");
    } finally {
      setPermissionsLoading(false);
    }
  }

  async function updatePermission(userId, resource, next) {
    try {
      const res = await fetchWithWorkspaceFallback(`/api/team/permissions/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, ...next }),
      });
      if (!res.ok) throw new Error();
      setPermissions((prev) =>
        prev.map((p) => (p.resource === resource ? { ...p, ...next } : p))
      );
    } catch {
      toast.error("Berechtigung konnte nicht gespeichert werden.");
    }
  }

  async function applyPreset(userId, presetKey) {
    if (!userId) return;
    const preset = PRESETS[presetKey];
    if (!preset) return;
    setPermissionsLoading(true);
    try {
      await Promise.all(
        Object.entries(preset).map(([resource, cfg]) =>
          fetchWithWorkspaceFallback(`/api/team/permissions/${userId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resource, ...cfg }),
          })
        )
      );
      const res = await fetchWithWorkspaceFallback(`/api/team/permissions/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setPermissions(Array.isArray(data) ? data : []);
      }
      toast.success("Preset angewendet.");
    } catch {
      toast.error("Preset konnte nicht angewendet werden.");
    } finally {
      setPermissionsLoading(false);
    }
  }

  function updateDay(day, value) {
    const next = Number(value);
    setSchedule((prev) => ({
      ...prev,
      weekly_hours: { ...prev.weekly_hours, [day]: Number.isFinite(next) ? Math.max(0, Math.min(12, next)) : 0 },
    }));
  }

  async function saveSchedule() {
    setScheduleSaving(true);
    try {
      const payload = {
        timezone: schedule.timezone,
        weekly_hours_json: JSON.stringify(schedule.weekly_hours),
      };
      const url = schedule.id ? `/api/work-schedules/${schedule.id}` : "/api/work-schedules";
      const method = schedule.id ? "PATCH" : "POST";
      const res = await fetchWithWorkspaceFallback(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      await fetchSchedule();
      toast.success("Arbeitszeiten gespeichert.");
    } catch {
      toast.error("Arbeitszeiten konnten nicht gespeichert werden.");
    } finally {
      setScheduleSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
      {authExpired && (
        <div className="card" style={{ padding: "var(--s-6)", borderLeft: "3px solid var(--c-danger)" }}>
          <div className="section-title" style={{ marginBottom: "var(--s-2)", color: "var(--c-danger)" }}>
            Sitzung abgelaufen
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", marginBottom: "var(--s-4)" }}>
            Bitte erneut anmelden, damit Team-Daten geladen werden können.
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => (window.location.href = "/login")}>
            Jetzt neu anmelden
          </button>
        </div>
      )}
      {!token && !authLoading && !authExpired && (
        <div className="card" style={{ padding: "var(--s-6)", borderLeft: "3px solid var(--c-warning)" }}>
          <div className="section-title" style={{ marginBottom: "var(--s-2)", color: "var(--c-warning)" }}>
            Bitte anmelden
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)", marginBottom: "var(--s-4)" }}>
            Team-Daten sind nur nach dem Login verfügbar.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => (window.location.href = "/login")}>
            Zum Login
          </button>
        </div>
      )}
      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Firma</div>
        {companiesLoading ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Firmendaten werden geladen...</div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            <div className="form-group">
              <label className="form-label">Firmenname</label>
              <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="z.B. Intlyst GmbH" />
            </div>
            <div className="form-group">
              <label className="form-label">Slug (optional)</label>
              <input className="input" value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="intlyst" />
            </div>
            <button className="btn btn-primary btn-md" onClick={saveCompany} disabled={companySaving || !companyName.trim()}>
              {companySaving ? "Speichern..." : "Firmendaten speichern"}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Rollen & Berechtigungen</div>
        <div style={{ display: "grid", gap: "var(--s-3)" }}>
          {ROLE_MATRIX.map((row) => (
            <div key={row.role} style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
              <span className="badge badge-sm badge-neutral" style={{ minWidth: 80, textAlign: "center" }}>{row.role}</span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>{row.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "var(--s-4)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s-2)" }}>
            Rollen-Matrix (Kurzüberblick)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "140px repeat(3, 1fr)", gap: "var(--s-2)", fontSize: "var(--text-xs)" }}>
            <div />
            <div style={{ fontWeight: 600 }}>Sehen</div>
            <div style={{ fontWeight: 600 }}>Bearbeiten</div>
            <div style={{ fontWeight: 600 }}>LÃ¶schen</div>
            {["Admin", "Manager", "Mitglied"].map((role) => (
              <div key={role} style={{ display: "contents" }}>
                <div style={{ fontWeight: 600 }}>{role}</div>
                <div>✓</div>
                <div>{role === "Mitglied" ? "Teilweise" : "✓"}</div>
                <div>{role === "Admin" ? "✓" : "Teilweise"}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Mitglied einladen</div>
        <div className="flex gap-3">
          <input
            className="input" type="email" value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && inviteMember()}
            placeholder="name@beispiel.de" style={{ flex: 1 }}
          />
          <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ maxWidth: 140 }}>
            <option value="member">Mitglied</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btn-primary btn-md" onClick={inviteMember} disabled={!inviteEmail || inviting}>
            {inviting ? "Sende..." : "Einladen"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Teams & Fachgebiete</div>
        <div className="flex gap-3" style={{ marginBottom: "var(--s-4)" }}>
          <input
            className="input"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTeam()}
            placeholder="Neues Team (z.B. Marketing)"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-md" onClick={createTeam} disabled={!newTeamName.trim() || creatingTeam}>
            {creatingTeam ? "Speichern..." : "Team anlegen"}
          </button>
        </div>
        {teamsLoading ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Teams werden geladen...</div>
        ) : teams.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--s-6) 0" }}>
            <div className="empty-title">Noch keine Teams</div>
            <div className="empty-text">Lege Teams an, um Fachgebiete zu strukturieren.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {teams.map((team, idx) => (
              <div key={team.id ?? idx}>
                {idx > 0 && <div className="divider" />}
                <div className="flex items-center gap-3" style={{ padding: "var(--s-3) 0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)" }}>{team.name}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>Team-ID: {team.id}</div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--c-danger)", padding: "4px 8px" }}
                    disabled={deletingTeamId === team.id}
                    onClick={() => deleteTeam(team.id)}
                  >
                    {deletingTeamId === team.id ? "..." : "Entfernen"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Arbeitszeiten (persönlich)</div>
        {scheduleLoading ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Arbeitszeiten werden geladen...</div>
        ) : (
          <div style={{ display: "grid", gap: "var(--s-3)" }}>
            <div className="form-group">
              <label className="form-label">Zeitzone</label>
              <input className="input" value={schedule.timezone} onChange={(e) => setSchedule((p) => ({ ...p, timezone: e.target.value }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--s-3)" }}>
              {[
                ["mon", "Mo"], ["tue", "Di"], ["wed", "Mi"], ["thu", "Do"], ["fri", "Fr"], ["sat", "Sa"], ["sun", "So"],
              ].map(([key, label]) => (
                <div key={key} className="form-group">
                  <label className="form-label">{label}</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="12"
                    value={schedule.weekly_hours[key] ?? 0}
                    onChange={(e) => updateDay(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-md" onClick={saveSchedule} disabled={scheduleSaving}>
              {scheduleSaving ? "Speichern..." : "Arbeitszeiten speichern"}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Teammitglieder</div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                  <div className="skeleton skeleton-text" style={{ width: "40%" }} />
                  <div className="skeleton skeleton-text" style={{ width: "60%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--s-8) 0" }}>
            <div className="empty-icon">👥</div>
            <div className="empty-title">Noch keine Mitglieder</div>
            <div className="empty-text">Lade dein Team ein um zusammenzuarbeiten.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {members.map((m, idx) => (
              <div key={m.id ?? idx}>
                {idx > 0 && <div className="divider" />}
                <div className="flex items-center gap-3" style={{ padding: "var(--s-3) 0" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "var(--c-primary-light)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "var(--text-md)", fontWeight: 600, color: "var(--c-primary)", flexShrink: 0,
                  }}>
                    {(m.name ?? m.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.name ?? m.email}
                    </div>
                    {m.name && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--c-text-3)" }}>{m.email}</div>
                    )}
                  </div>
                  <span className="badge badge-sm badge-neutral">{ROLE_LABELS[m.role] ?? m.role ?? "Mitglied"}</span>
                  <select
                    className="input"
                    value={m.role ?? "member"}
                    onChange={(e) => updateMemberRole(m.id, e.target.value)}
                    style={{ maxWidth: 140 }}
                  >
                    <option value="member">Mitglied</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select
                    className="input"
                    value={getMemberTeamId(m.id)}
                    onChange={(e) => assignMemberToTeam(m.id, e.target.value)}
                    style={{ maxWidth: 160 }}
                    disabled={teamsLoading || membershipsLoading}
                  >
                    <option value="">Kein Team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Fachgebiet"
                    defaultValue={getMemberSpecialty(m.id)}
                    onBlur={(e) => updateMemberSpecialty(m.id, e.target.value.trim())}
                    style={{ maxWidth: 160 }}
                    disabled={membershipsLoading}
                  />
                  {m.role !== "owner" && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--c-danger)", padding: "4px 8px" }}
                      disabled={removingId === m.id}
                      onClick={() => removeMember(m.id)}
                    >
                      {removingId === m.id ? "..." : "Entfernen"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "var(--s-6)" }}>
        <div className="section-title" style={{ marginBottom: "var(--s-4)" }}>Berechtigungen</div>
        <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
          <label className="form-label">Mitarbeiter auswählen</label>
          <select
            className="input"
            value={permUserId}
            onChange={(e) => {
              const id = e.target.value;
              setPermUserId(id);
              fetchPermissions(id);
            }}
            disabled={loading}
          >
            <option value="">Bitte wählen</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
            ))}
          </select>
        </div>
        {permUserId && (
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginBottom: "var(--s-3)" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => applyPreset(permUserId, "admin")} disabled={permissionsLoading}>
              Admin-Preset
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => applyPreset(permUserId, "manager")} disabled={permissionsLoading}>
              Manager-Preset
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => applyPreset(permUserId, "member")} disabled={permissionsLoading}>
              Member-Preset
            </button>
          </div>
        )}

        {permissionsLoading ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Berechtigungen werden geladen...</div>
        ) : permUserId && permissions.length > 0 ? (
          <div style={{ display: "grid", gap: "var(--s-2)" }}>
            {permissions.map((p) => (
              <div key={p.resource} className="flex items-center gap-3" style={{ padding: "6px 0" }}>
                <div style={{ width: 140, fontSize: "var(--text-sm)", color: "var(--c-text)" }}>
                  {PERMISSION_LABELS[p.resource] ?? p.resource}
                </div>
                {["can_view", "can_edit", "can_delete"].map((k) => (
                  <label key={k} className="toggle" title={k.replace("can_", "").toUpperCase()}>
                    <input
                      type="checkbox"
                      checked={!!p[k]}
                      onChange={(e) =>
                        updatePermission(Number(permUserId), p.resource, { ...p, [k]: e.target.checked })
                      }
                    />
                    <span className="toggle-track"><span className="toggle-thumb" /></span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        ) : permUserId ? (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Keine Berechtigungen gefunden.</div>
        ) : (
          <div style={{ color: "var(--c-text-3)", fontSize: "var(--text-sm)" }}>Wähle einen Mitarbeiter, um Rechte zu bearbeiten.</div>
        )}
      </div>
    </div>
  );
}

