import { useState, useEffect } from "react";

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/billing/invoices")
      .then(r => r.json())
      .then(d => { setInvoices(d.invoices || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!invoices.length) return (
    <div style={{ fontSize: 12, color: "#334155", marginTop: 8 }}>
      Noch keine Rechnungen vorhanden.
    </div>
  );

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Rechnungshistorie
      </div>
      {invoices.map(inv => (
        <div
          key={inv.id}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "9px 0", borderBottom: "1px solid #1e1e2e",
            fontSize: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
              {inv.number || inv.id}
            </span>
            <span style={{ color: "#475569", marginLeft: 8 }}>{inv.created}</span>
          </div>
          <span style={{ color: "#10b981", fontWeight: 600 }}>
            {inv.currency} {inv.amount_paid.toFixed(2)}
          </span>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 4,
            background: inv.status === "paid" ? "#10b98118" : "#f59e0b18",
            color: inv.status === "paid" ? "#10b981" : "#f59e0b",
          }}>
            {inv.status === "paid" ? "Bezahlt" : inv.status}
          </span>
          {inv.pdf_url && (
            <a
              href={inv.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: "#6366f1", textDecoration: "none" }}
            >
              PDF ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
