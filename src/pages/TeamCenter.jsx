/* eslint-disable */
import TeamCenter from "../components/team/TeamCenter";

export default function TeamCenterPage() {
  return (
    <div
      className="page-enter"
      style={{
        background: "var(--c-bg)",
        minHeight: "calc(100dvh - var(--nav-height))",
        padding: "var(--s-8)",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "var(--s-6)" }}>
        <div className="page-title">Team</div>
        <div className="page-subtitle">Mitglieder, Rollen, Teams und Arbeitszeiten verwalten</div>
      </div>

      <TeamCenter />
    </div>
  );
}

