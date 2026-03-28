import { useState, useEffect, useRef } from "react";

const COMPETITION_CONFIG = {
  low: { color: "#10b981", label: "Niedrig", bg: "#10b98115" },
  medium: { color: "#f59e0b", label: "Mittel", bg: "#f59e0b15" },
  high: { color: "#ef4444", label: "Hoch", bg: "#ef444415" },
  very_high: { color: "#ef4444", label: "Sehr hoch", bg: "#ef444415" },
};

function CompetitorCard({ c, index }) {
  const stars = c.rating ? "*".repeat(Math.round(c.rating)) + "o".repeat(5 - Math.round(c.rating)) : null;

  return (
    <div
      style={{
        background: "#13131f",
        border: "1px solid #1e1e2e",
        borderRadius: 8,
        padding: "10px 13px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#6366f118",
          border: "1px solid #6366f130",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: "#818cf8",
          flexShrink: 0,
        }}
      >
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#e2e8f0",
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {c.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#475569",
            marginBottom: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {c.address}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stars && (
            <span style={{ fontSize: 10, color: "#f59e0b" }}>
              {stars} <span style={{ color: "#475569" }}>({c.user_ratings_total})</span>
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: c.distance_km < 0.5 ? "#ef4444" : c.distance_km < 1 ? "#f59e0b" : "#10b981",
            }}
          >
            {c.distance_km < 1 ? `${Math.round(c.distance_km * 1000)}m` : `${c.distance_km}km`}
          </span>
          {c.open_now !== null && c.open_now !== undefined && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: "1px 5px",
                borderRadius: 3,
                background: c.open_now ? "#10b98115" : "#ef444415",
                color: c.open_now ? "#10b981" : "#ef4444",
              }}
            >
              {c.open_now ? "Geoeffnet" : "Geschlossen"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LocationMap({ apiKey }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [address, setAddress] = useState("");
  const [industry, setIndustry] = useState("ecommerce");
  const [radius, setRadius] = useState(2);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const INDUSTRIES = [
    { value: "ecommerce", label: "E-Commerce" },
    { value: "retail", label: "Einzelhandel" },
    { value: "gastro", label: "Gastronomie" },
    { value: "saas", label: "SaaS" },
  ];

  useEffect(() => {
    if (!apiKey || window.google) {
      setMapsLoaded(!!window.google);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=de`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, [apiKey]);

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || mapInstance.current) return;
    mapInstance.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 48.1351, lng: 11.582 },
      zoom: 13,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1e1e2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#334155" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a14" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
      ],
    });
  }, [mapsLoaded]);

  useEffect(() => {
    if (!mapInstance.current || !data) return;

    const map = mapInstance.current;
    if (window._mapMarkers) window._mapMarkers.forEach((m) => m.setMap(null));
    if (window._mapCircle) window._mapCircle.setMap(null);
    window._mapMarkers = [];

    const center = {
      lat: data.coordinates.lat,
      lng: data.coordinates.lng,
    };

    map.setCenter(center);
    map.setZoom(data.catchment_radius_km <= 1 ? 15 : data.catchment_radius_km <= 3 ? 14 : 13);

    const ownMarker = new window.google.maps.Marker({
      position: center,
      map,
      title: "Dein Standort",
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#6366f1",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
      zIndex: 100,
    });
    window._mapMarkers.push(ownMarker);

    window._mapCircle = new window.google.maps.Circle({
      map,
      center,
      radius: data.catchment_radius_km * 1000,
      fillColor: "#6366f1",
      fillOpacity: 0.06,
      strokeColor: "#6366f1",
      strokeOpacity: 0.4,
      strokeWeight: 1.5,
    });

    data.competitors.forEach((c, i) => {
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-family:sans-serif;font-size:12px;color:#1e293b;max-width:200px;">
            <strong>${c.name}</strong><br/>
            ${c.address}<br/>
            ${c.rating ? `Rating ${c.rating} (${c.user_ratings_total} Reviews)<br/>` : ""}
            Distanz ${c.distance_km < 1 ? Math.round(c.distance_km * 1000) + "m" : c.distance_km + "km"}
          </div>
        `,
      });

      const marker = new window.google.maps.Marker({
        position: { lat: 0, lng: 0 },
        map,
        title: c.name,
        label: {
          text: String(i + 1),
          color: "#fff",
          fontSize: "10px",
          fontWeight: "bold",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#ef4444",
          fillOpacity: 0.9,
          strokeColor: "#fff",
          strokeWeight: 1.5,
        },
      });

      const service = new window.google.maps.places.PlacesService(map);
      service.getDetails({ placeId: c.place_id, fields: ["geometry"] }, (place, status) => {
        if (status === "OK" && place?.geometry?.location) {
          marker.setPosition(place.geometry.location);
          marker.addListener("click", () => {
            infoWindow.open(map, marker);
          });
        }
      });

      window._mapMarkers.push(marker);
    });
  }, [data]);

  async function analyze() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/location/analyze?address=${encodeURIComponent(address)}&industry=${industry}&radius_km=${radius}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Status ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const comp = data ? COMPETITION_CONFIG[data.competition_level] || COMPETITION_CONFIG.medium : null;

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 160px 120px 100px",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="Adresse eingeben, z.B. Marienplatz 1, Muenchen"
          style={{
            background: "#13131f",
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#e2e8f0",
            fontSize: 12,
          }}
        />
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          style={{
            background: "#13131f",
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            padding: "8px 10px",
            color: "#e2e8f0",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          style={{
            background: "#13131f",
            border: "1px solid #1e1e2e",
            borderRadius: 8,
            padding: "8px 10px",
            color: "#e2e8f0",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {[1, 2, 3, 5, 10, 20].map((r) => (
            <option key={r} value={r}>
              {r} km Radius
            </option>
          ))}
        </select>
        <button
          onClick={analyze}
          disabled={loading || !address.trim()}
          style={{
            background: loading || !address.trim() ? "#1e1e2e" : "#6366f1",
            color: loading || !address.trim() ? "#475569" : "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: loading || !address.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Suche..." : "Analysieren"}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "#ef444415",
            border: "1px solid #ef444430",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "#ef4444",
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Adresse", value: data.coordinates.city },
            { label: "Wettbewerber", value: `${data.competitor_count} gefunden` },
            {
              label: "Durchschnittsbewertung",
              value: data.avg_competitor_rating > 0 ? `${data.avg_competitor_rating}` : "k.A.",
            },
            {
              label: "Wettbewerbslevel",
              value: comp?.label,
              color: comp?.color,
              bg: comp?.bg,
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: s.bg || "#13131f",
                border: `1px solid ${s.color ? s.color + "30" : "#1e1e2e"}`,
                borderRadius: 8,
                padding: "10px 13px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#475569",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 3,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color || "#f1f5f9" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #1e1e2e",
          marginBottom: 14,
          height: 360,
          background: "#13131f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!mapsLoaded ? (
          <div style={{ fontSize: 13, color: "#475569" }}>{apiKey ? "Google Maps laedt..." : "GOOGLE_MAPS_API_KEY fehlt"}</div>
        ) : (
          <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        )}
      </div>

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              KI-Standortanalyse
            </div>
            <div
              style={{
                background: "#13131f",
                border: "1px solid #1e1e2e",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{data.ai_analysis}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.ai_recommendations.map((rec, i) => (
                <div
                  key={i}
                  style={{
                    background: "#13131f",
                    border: "1px solid #6366f120",
                    borderLeft: "3px solid #6366f1",
                    borderRadius: "0 8px 8px 0",
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "#e2e8f0",
                  }}
                >
                  - {rec}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Wettbewerber ({data.competitor_count})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {data.competitors.map((c, i) => (
                <CompetitorCard key={c.place_id} c={c} index={i} />
              ))}
              {data.competitors.length === 0 && (
                <div style={{ fontSize: 12, color: "#475569", padding: "16px 0" }}>
                  Keine direkten Wettbewerber im Radius gefunden.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
