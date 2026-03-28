import { useEffect, useMemo, useState } from "react";

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default function FrontendTest() {
  const [running, setRunning] = useState(true);
  const [rows, setRows] = useState([]);
  const [runVersion, setRunVersion] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function run() {
      const out = [];
      let createdActionId = null;

      const push = (name, pass, detail) => {
        out.push({ name, pass, detail });
      };

      try {
        // 1) /api/timeseries?metric=revenue&days=30
        {
          const res = await fetch("/api/timeseries?metric=revenue&days=30");
          const json = await asJson(res);
          const pass =
            res.ok &&
            json &&
            Array.isArray(json.data) &&
            json.data.length > 0;
          push(
            "timeseries revenue",
            pass,
            `status=${res.status}, points=${Array.isArray(json?.data) ? json.data.length : 0}`
          );
        }

        // 2) /api/timeseries?metric=all&days=7
        {
          const res = await fetch("/api/timeseries?metric=all&days=7");
          const json = await asJson(res);
          const keys = ["revenue", "traffic", "conversions", "conversion_rate", "new_customers"];
          const pass = res.ok && keys.every((k) => json && Object.prototype.hasOwnProperty.call(json, k));
          push(
            "timeseries all",
            pass,
            `status=${res.status}, hasAllKeys=${pass ? "yes" : "no"}`
          );
        }

        // 3) POST /api/actions
        {
          const payload = {
            title: "Frontend Test Action",
            description: "Auto-created by /test page",
            category: "operations",
            impact_pct: 1.23,
            status: "done",
            date: new Date().toISOString().slice(0, 10),
          };
          const res = await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await asJson(res);
          createdActionId = json?.id ?? null;
          const pass = res.ok && Number.isInteger(createdActionId);
          push(
            "POST /api/actions",
            pass,
            `status=${res.status}, id=${createdActionId ?? "n/a"}`
          );
        }

        // 4) GET /api/actions (filterbar)
        {
          const res = await fetch("/api/actions?category=operations&status=done&limit=50");
          const json = await asJson(res);
          const items = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
          const found = createdActionId ? items.some((x) => x?.id === createdActionId) : items.length >= 0;
          const pass = res.ok && Array.isArray(items) && found;
          push(
            "GET /api/actions filter",
            pass,
            `status=${res.status}, items=${items.length}`
          );
        }

        // Cleanup created action
        if (createdActionId) {
          try {
            await fetch(`/api/actions/${createdActionId}`, { method: "DELETE" });
          } catch {
            // Cleanup is optional.
          }
        }
      } catch (err) {
        push("Runner Error", false, String(err));
      }

      if (mounted) {
        setRows(out);
        setRunning(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [runVersion]);

  const passed = useMemo(() => rows.filter((r) => r.pass).length, [rows]);
  const total = rows.length;
  const allPass = total > 0 && passed === total;

  const restartTests = () => {
    setRows([]);
    setRunning(true);
    setRunVersion((v) => v + 1);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#e2e8f0",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        padding: "28px 32px",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 24 }}>Tag 9 Frontend Smoke Test</h1>
      <p style={{ color: "#94a3b8", marginTop: 8 }}>
        {running
          ? "Teste..."
          : allPass
            ? `Alles gut: ${passed}/${total} Checks erfolgreich`
            : `Fehler: ${passed}/${total} Checks erfolgreich`}
      </p>

      {!running && (
        <button
          onClick={restartTests}
          style={{
            background: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          Tests neu starten
        </button>
      )}

      <div
        style={{
          marginTop: 18,
          border: "1px solid #1e1e2e",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {rows.map((r, i) => (
          <div
            key={`${r.name}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "220px 90px 1fr",
              gap: 12,
              padding: "10px 12px",
              borderTop: i === 0 ? "none" : "1px solid #1e1e2e",
              background: r.pass ? "#10b98110" : "#ef444410",
            }}
          >
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: r.pass ? "#10b981" : "#ef4444", fontWeight: 700 }}>
              {r.pass ? "PASS" : "FAIL"}
            </div>
            <div style={{ color: "#cbd5e1" }}>{r.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
