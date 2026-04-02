"""
SVG-Chart-Bibliothek — reines Python, keine externen Abhängigkeiten.
Erzeugt inline-fähige SVG-Strings für Berichte.
"""
import math
from typing import Optional

# ── Farbpalette ──────────────────────────────────────────────────────────────
C_PRIMARY   = "#6366f1"   # Indigo
C_SECONDARY = "#8b5cf6"   # Violett
C_CYAN      = "#06b6d4"
C_SUCCESS   = "#10b981"   # Grün
C_DANGER    = "#ef4444"   # Rot
C_WARNING   = "#f59e0b"   # Gelb
C_MUTED     = "#94a3b8"   # Grau
C_BORDER    = "#e2e8f0"
C_TEXT      = "#1e293b"
C_BG        = "#f8fafc"

CHART_COLORS = [C_PRIMARY, C_SECONDARY, C_CYAN, C_SUCCESS, C_WARNING, C_DANGER]


# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def fmt_value(v: float, unit: str = "") -> str:
    """Zahlen kompakt formatieren für Achsenbeschriftungen."""
    if unit == "€":
        if abs(v) >= 1_000_000:
            return f"{v / 1_000_000:.1f}M€"
        if abs(v) >= 1_000:
            return f"{v / 1_000:.1f}k€"
        return f"{v:.0f}€"
    if unit == "%":
        return f"{v:.1f}%"
    if abs(v) >= 1_000_000:
        return f"{v / 1_000_000:.1f}M"
    if abs(v) >= 1_000:
        return f"{v / 1_000:.1f}k"
    return f"{v:.0f}"


def _nice_ticks(vmin: float, vmax: float, n: int = 5) -> list[float]:
    """Runde Achsenwerte (nice numbers) für die Y-Achse berechnen."""
    if vmax == vmin:
        return [vmin]
    r = vmax - vmin
    raw_step = r / max(n - 1, 1)
    mag = 10 ** math.floor(math.log10(raw_step)) if raw_step > 0 else 1
    step = round(raw_step / mag) * mag or mag
    start = math.floor(vmin / step) * step
    ticks: list[float] = []
    v = start
    while v <= vmax + step * 0.01:
        ticks.append(round(v, 10))
        v += step
    return ticks


def _bezier_path(points: list[tuple[float, float]]) -> str:
    """Smooth Bezier-Kurve durch Punkte (Midpoint-Control-Points)."""
    if not points:
        return ""
    if len(points) == 1:
        return f"M {points[0][0]:.2f} {points[0][1]:.2f}"
    d = f"M {points[0][0]:.2f} {points[0][1]:.2f}"
    for i in range(1, len(points)):
        x0, y0 = points[i - 1]
        x1, y1 = points[i]
        cx = (x0 + x1) / 2
        d += f" C {cx:.2f},{y0:.2f} {cx:.2f},{y1:.2f} {x1:.2f},{y1:.2f}"
    return d


def _uid(seed: str) -> str:
    return f"c{abs(hash(seed)) % 99999}"


# ── Line Chart ───────────────────────────────────────────────────────────────

def line_chart(
    dates: list[str],
    values: list[float],
    title: str,
    color: str = C_PRIMARY,
    unit: str = "",
    width: int = 560,
    height: int = 210,
) -> str:
    """Vollständiges Liniendiagramm als SVG-String."""
    if not values:
        return _empty_chart(title, width, height)

    PAD_L, PAD_R, PAD_T, PAD_B = 58, 18, 32, 44
    iw = width - PAD_L - PAD_R
    ih = height - PAD_T - PAD_B

    vmin_raw, vmax_raw = min(values), max(values)
    if vmax_raw == vmin_raw:
        spread = max(abs(vmin_raw) * 0.1, 1)
        vmin_raw, vmax_raw = vmin_raw - spread, vmax_raw + spread
    else:
        spread = vmax_raw - vmin_raw
        vmin_raw = max(0, vmin_raw - spread * 0.08) if min(values) >= 0 else vmin_raw - spread * 0.08
        vmax_raw += spread * 0.08

    ticks = _nice_ticks(vmin_raw, vmax_raw, 5)
    vmin, vmax = min(ticks[0], vmin_raw), max(ticks[-1], vmax_raw)
    vr = vmax - vmin or 1

    n = len(values)

    def sx(i: int) -> float:
        return PAD_L + (i / (n - 1)) * iw if n > 1 else PAD_L + iw / 2

    def sy(v: float) -> float:
        return PAD_T + ih - (v - vmin) / vr * ih

    pts = [(sx(i), sy(v)) for i, v in enumerate(values)]
    line_d = _bezier_path(pts)
    bottom = PAD_T + ih
    area_d = f"{line_d} L {pts[-1][0]:.2f},{bottom:.2f} L {pts[0][0]:.2f},{bottom:.2f} Z"

    uid = _uid(title + color)

    # Grid + Y-Labels
    grid = ""
    ylabels = ""
    for t in ticks:
        y = sy(t)
        if PAD_T - 2 <= y <= PAD_T + ih + 2:
            grid += (
                f'<line x1="{PAD_L}" y1="{y:.1f}" x2="{width - PAD_R}" y2="{y:.1f}" '
                f'stroke="{C_BORDER}" stroke-width="1" stroke-dasharray="3,3"/>\n'
            )
            ylabels += (
                f'<text x="{PAD_L - 6}" y="{y + 3.5:.1f}" text-anchor="end" '
                f'font-size="9" fill="{C_MUTED}">{fmt_value(t, unit)}</text>\n'
            )

    # X-Labels: max. 7 gleichmäßig verteilt
    xlabels = ""
    step = max(1, n // 7)
    shown: set[int] = set()
    for i in range(0, n, step):
        shown.add(i)
    shown.add(n - 1)
    for i in sorted(shown):
        if i < len(dates):
            xlabels += (
                f'<text x="{sx(i):.1f}" y="{PAD_T + ih + 16}" '
                f'text-anchor="middle" font-size="9" fill="{C_MUTED}">{dates[i]}</text>\n'
            )

    # Datenpunkte nur bei ≤ 14 Werten
    circles = ""
    if n <= 14:
        for px, py in pts:
            circles += (
                f'<circle cx="{px:.1f}" cy="{py:.1f}" r="3" '
                f'fill="white" stroke="{color}" stroke-width="1.5"/>\n'
            )

    return f'''\
<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block;width:100%;height:auto">
  <defs>
    <linearGradient id="{uid}-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{color}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="{color}" stop-opacity="0.01"/>
    </linearGradient>
    <clipPath id="{uid}-cp">
      <rect x="{PAD_L}" y="{PAD_T}" width="{iw}" height="{ih}"/>
    </clipPath>
  </defs>
  <text x="{PAD_L}" y="18" font-size="11" font-weight="600" fill="{C_TEXT}">{title}</text>
  {grid}
  <line x1="{PAD_L}" y1="{PAD_T + ih}" x2="{width - PAD_R}" y2="{PAD_T + ih}" stroke="{C_BORDER}" stroke-width="1"/>
  <g clip-path="url(#{uid}-cp)">
    <path d="{area_d}" fill="url(#{uid}-g)"/>
    <path d="{line_d}" fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    {circles}
  </g>
  {ylabels}
  {xlabels}
</svg>'''


# ── Bar Chart ────────────────────────────────────────────────────────────────

def bar_chart(
    categories: list[str],
    series: list[dict],   # [{"label": str, "values": list[float], "color": str}]
    title: str,
    unit: str = "",
    width: int = 560,
    height: int = 210,
) -> str:
    """Gruppiertes Balkendiagramm als SVG-String."""
    if not categories or not series:
        return _empty_chart(title, width, height)

    all_vals = [v for s in series for v in s.get("values", []) if v is not None]
    if not all_vals:
        return _empty_chart(title, width, height)

    PAD_L, PAD_R, PAD_T, PAD_B = 58, 18, 32, 44
    iw = width - PAD_L - PAD_R
    ih = height - PAD_T - PAD_B

    vmax = max(all_vals) * 1.15 or 1
    ticks = _nice_ticks(0, vmax, 5)
    vmax = max(vmax, ticks[-1])
    vr = vmax or 1

    nc = len(categories)
    ns = len(series)
    group_w = iw / nc
    bar_pad = group_w * 0.12
    bar_w = (group_w - bar_pad * 2) / ns

    def sy(v: float) -> float:
        return PAD_T + ih - (v / vr) * ih

    grid = ""
    ylabels = ""
    for t in ticks:
        y = sy(t)
        grid += (
            f'<line x1="{PAD_L}" y1="{y:.1f}" x2="{width - PAD_R}" y2="{y:.1f}" '
            f'stroke="{C_BORDER}" stroke-width="1" stroke-dasharray="3,3"/>\n'
        )
        ylabels += (
            f'<text x="{PAD_L - 6}" y="{y + 3.5:.1f}" text-anchor="end" '
            f'font-size="9" fill="{C_MUTED}">{fmt_value(t, unit)}</text>\n'
        )

    bars = ""
    val_labels = ""
    xlabels = ""
    for ci, cat in enumerate(categories):
        gx = PAD_L + ci * group_w
        xlabels += (
            f'<text x="{gx + group_w / 2:.1f}" y="{PAD_T + ih + 16}" '
            f'text-anchor="middle" font-size="9" fill="{C_MUTED}">{cat}</text>\n'
        )
        for si, s in enumerate(series):
            v = s["values"][ci] if ci < len(s["values"]) else 0.0
            bx = gx + bar_pad + si * bar_w
            by = sy(v)
            bh = PAD_T + ih - by
            c = s.get("color", C_PRIMARY)
            bars += (
                f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bar_w:.1f}" '
                f'height="{bh:.1f}" rx="2" fill="{c}" opacity="0.88"/>\n'
            )
            if nc <= 8:
                val_labels += (
                    f'<text x="{bx + bar_w / 2:.1f}" y="{by - 3:.1f}" '
                    f'text-anchor="middle" font-size="8" fill="{c}">{fmt_value(v, unit)}</text>\n'
                )

    # Legende (bei mehreren Serien)
    legend = ""
    if ns > 1:
        lx = PAD_L
        for s in series:
            legend += (
                f'<rect x="{lx}" y="18" width="8" height="8" rx="2" fill="{s["color"]}"/>'
                f'<text x="{lx + 12}" y="26" font-size="9" fill="{C_TEXT}">{s["label"]}</text>'
            )
            lx += len(s["label"]) * 6 + 26

    return f'''\
<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">
  <text x="{PAD_L}" y="18" font-size="11" font-weight="600" fill="{C_TEXT}">{title}</text>
  {legend}
  {grid}
  <line x1="{PAD_L}" y1="{PAD_T + ih}" x2="{width - PAD_R}" y2="{PAD_T + ih}" stroke="{C_BORDER}" stroke-width="1"/>
  {bars}
  {val_labels}
  {ylabels}
  {xlabels}
</svg>'''


# ── Sparkline ────────────────────────────────────────────────────────────────

def sparkline(
    values: list[float],
    color: str = C_PRIMARY,
    width: int = 120,
    height: int = 36,
) -> str:
    """Mini-Sparkline ohne Achsen."""
    if len(values) < 2:
        return f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg"/>'

    PAD = 3
    iw, ih = width - PAD * 2, height - PAD * 2
    vmin, vmax = min(values), max(values)
    vr = vmax - vmin or 1
    n = len(values)

    def sx(i: int) -> float:
        return PAD + (i / (n - 1)) * iw

    def sy(v: float) -> float:
        return PAD + ih - (v - vmin) / vr * ih

    pts = [(sx(i), sy(v)) for i, v in enumerate(values)]
    line_d = _bezier_path(pts)

    bottom = PAD + ih
    area_d = f"{line_d} L {pts[-1][0]:.2f},{bottom} L {pts[0][0]:.2f},{bottom} Z"
    uid = _uid(f"spark{color}{width}")
    end_color = C_SUCCESS if values[-1] >= values[0] else C_DANGER
    ex, ey = pts[-1]

    return f'''\
<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">
  <defs>
    <linearGradient id="{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{color}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="{color}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="{area_d}" fill="url(#{uid})"/>
  <path d="{line_d}" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{ex:.1f}" cy="{ey:.1f}" r="2.5" fill="{end_color}"/>
</svg>'''


# ── Progress Ring ─────────────────────────────────────────────────────────────

def progress_ring(
    pct: float,
    label: str,
    color: str = C_SUCCESS,
    size: int = 110,
) -> str:
    """Kreisförmiger Fortschrittsindikator."""
    r = size * 0.36
    cx = cy = size / 2
    circ = 2 * math.pi * r
    filled = min(max(pct / 100, 0), 1) * circ
    dash = f"{filled:.2f} {circ - filled:.2f}"
    ring_color = color if pct >= 0 else C_DANGER
    font_main = max(size * 0.15, 11)
    font_label = max(size * 0.09, 8)

    return f'''\
<svg viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">
  <circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{C_BORDER}" stroke-width="7"/>
  <circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{ring_color}" stroke-width="7"
    stroke-dasharray="{dash}" stroke-linecap="round"
    transform="rotate(-90 {cx} {cy})"/>
  <text x="{cx}" y="{cy + font_main * 0.38:.1f}" text-anchor="middle"
    font-size="{font_main:.0f}" font-weight="700" fill="{C_TEXT}">{pct:.0f}%</text>
  <text x="{cx}" y="{size - 7:.0f}" text-anchor="middle"
    font-size="{font_label:.0f}" fill="{C_MUTED}">{label}</text>
</svg>'''


# ── Heatmap Wochentage ────────────────────────────────────────────────────────

def weekday_heatmap(
    day_totals: dict[str, float],  # {"Mo": 1200.0, "Di": 980.0, ...}
    title: str = "Umsatz nach Wochentag",
    color: str = C_PRIMARY,
    unit: str = "€",
    width: int = 560,
    height: int = 90,
) -> str:
    """Horizontale Heatmap für Wochentage."""
    days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    values = [day_totals.get(d, 0.0) for d in days]
    vmax = max(values) or 1

    cell_w = (width - 20) / 7
    cell_h = 44
    y_top = 28
    uid = _uid(title + color)

    cells = ""
    labels_top = ""
    labels_bot = ""

    for i, (d, v) in enumerate(zip(days, values)):
        x = 10 + i * cell_w
        alpha = 0.08 + 0.72 * (v / vmax)
        cells += (
            f'<rect x="{x:.1f}" y="{y_top}" width="{cell_w - 3:.1f}" height="{cell_h}" '
            f'rx="5" fill="{color}" opacity="{alpha:.2f}"/>\n'
        )
        labels_top += (
            f'<text x="{x + (cell_w - 3) / 2:.1f}" y="{y_top - 6}" '
            f'text-anchor="middle" font-size="9" font-weight="600" fill="{C_MUTED}">{d}</text>\n'
        )
        labels_bot += (
            f'<text x="{x + (cell_w - 3) / 2:.1f}" y="{y_top + cell_h + 13}" '
            f'text-anchor="middle" font-size="8" fill="{C_TEXT}">{fmt_value(v, unit)}</text>\n'
        )

    return f'''\
<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">
  <text x="10" y="14" font-size="11" font-weight="600" fill="{C_TEXT}">{title}</text>
  {labels_top}
  {cells}
  {labels_bot}
</svg>'''


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _empty_chart(title: str, width: int, height: int) -> str:
    return (
        f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" '
        f'style="display:block;width:100%;height:auto">'
        f'<text x="{width // 2}" y="{height // 2}" text-anchor="middle" '
        f'font-size="12" fill="{C_MUTED}">{title}: Keine Daten</text>'
        f'</svg>'
    )


def trend_arrow(pct: float) -> str:
    if pct > 3:
        return "↑"
    if pct < -3:
        return "↓"
    return "→"


def trend_color(pct: float) -> str:
    if pct > 3:
        return C_SUCCESS
    if pct < -3:
        return C_DANGER
    return C_MUTED
