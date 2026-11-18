"""Server-side chart builder.

Takes a query result (columns + rows) and a chart config, returns a Plotly
figure as JSON. The frontend renders it verbatim with react-plotly.js.
The AI pipeline will reuse build_figure() for auto-charting later.

Config keys (per type): x, y (list), series, size, value, lat, lon,
location, source, target, open, high, low, close, path (list).
"""
import json
import math
import os
import re
from typing import Any

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

COLORWAY = ["#2563eb", "#06b6d4", "#7c3aed", "#059669", "#f59e0b",
            "#ef4444", "#ec4899", "#14b8a6", "#8b5cf6", "#84cc16"]

# Token-free tile basemaps (OpenStreetMap / Carto / Stamen) work out of the box.
# "satellite" needs a Mapbox token; set MAPBOX_TOKEN to enable it, else we fall
# back to streets so the chart still renders.
_MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN", "")
MAP_STYLES = {
    "streets": "open-street-map",
    "light": "carto-positron",
    "dark": "carto-darkmatter",
    "terrain": "stamen-terrain",
    "satellite": "satellite-streets",
}

# Named colour palettes a dashboard can apply to every chart at once.
# Keep "default" first — it matches the app's brand gradient.
PALETTES: dict[str, list[str]] = {
    "default": COLORWAY,
    "ocean":   ["#0ea5e9", "#0891b2", "#2563eb", "#06b6d4", "#3b82f6", "#0d9488", "#1d4ed8", "#22d3ee"],
    "sunset":  ["#f97316", "#ef4444", "#f59e0b", "#ec4899", "#e11d48", "#fb923c", "#facc15", "#db2777"],
    "forest":  ["#059669", "#65a30d", "#16a34a", "#0d9488", "#84cc16", "#15803d", "#22c55e", "#4d7c0f"],
    "berry":   ["#7c3aed", "#db2777", "#8b5cf6", "#ec4899", "#a855f7", "#d946ef", "#6366f1", "#f472b6"],
    "slate":   ["#475569", "#0ea5e9", "#64748b", "#38bdf8", "#94a3b8", "#0284c7", "#334155", "#7dd3fc"],
    "vibrant": ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6"],
}

# Continuous scale paired with each palette (used by heatmap / choropleth).
CONTINUOUS = {
    "default": "Blues", "ocean": "Teal", "sunset": "OrRd", "forest": "Greens",
    "berry": "Purples", "slate": "Blues", "vibrant": "Viridis",
}


def resolve_palette(name: str | None) -> list[str]:
    return PALETTES.get((name or "default").lower(), COLORWAY)


def _rgba(hex_color: str, alpha: float) -> str:
    """#rrggbb -> rgba(r,g,b,alpha). Falls back to the input if not a hex colour."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return hex_color
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return f"rgba({r},{g},{b},{alpha})"


def _layout(palette: list[str], theme: str | None) -> dict:
    """Build the shared layout for a given palette + light/dark theme."""
    dark = (theme or "light").lower() == "dark"
    text = "#e2e8f0" if dark else "#334155"
    grid = "rgba(148,163,184,0.18)" if dark else "rgba(148,163,184,0.20)"
    return dict(
        template="plotly_dark" if dark else "plotly_white",
        colorway=palette,
        margin=dict(l=50, r=24, t=36, b=44),
        font=dict(family="Inter, system-ui, sans-serif", size=12, color=text),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(gridcolor=grid, zerolinecolor=grid),
        yaxis=dict(gridcolor=grid, zerolinecolor=grid),
        hoverlabel=dict(bgcolor="#1e293b" if dark else "white", font_size=12),
    )


# Legacy module-level layout kept for any importers (light + default palette).
LAYOUT = _layout(COLORWAY, "light")

ALL_CHART_TYPES = [
    "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100", "lollipop",
    "line", "line_smooth", "line_step", "area", "area_stacked",
    "pie", "donut", "sunburst", "treemap", "funnel",
    "histogram", "boxplot", "violin", "heatmap", "density_heatmap",
    "scatter", "bubble", "candlestick", "waterfall", "sankey", "radar", "polar_bar",
    "parallel", "scatter_3d", "surface_3d",
    "choropleth", "geo_scatter", "map_scatter", "map_density",
    "gauge", "metric", "bullet", "table",
]


def _df(columns: list[str], rows: list[list[Any]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=columns)


def _ys(cfg: dict) -> list[str]:
    y = cfg.get("y") or []
    return y if isinstance(y, list) else [y]


# Chart types where duplicate category values must be aggregated before
# plotting — otherwise bars overlay, pies get duplicate slices, lines zigzag.
AGGREGATING = {
    "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100", "lollipop",
    "line", "line_smooth", "line_step", "area", "area_stacked",
    "pie", "donut", "funnel", "radar", "waterfall", "polar_bar",
}

# Config keys whose mapped columns must be numeric for the math to be right
NUMERIC_KEYS = ("value", "size", "open", "high", "low", "close", "lat", "lon", "z")

AGG_FUNCS = {"sum": "sum", "avg": "mean", "mean": "mean",
             "count": "count", "min": "min", "max": "max"}

# Required config keys per chart type -> human-readable field name.
# Validated before building so users get a clear message, never a 500.
REQUIRED_FIELDS: dict[str, list[tuple[str, str]]] = {
    "bar": [("x", "X axis"), ("y", "Y axis")],
    "bar_horizontal": [("x", "Category"), ("y", "Values")],
    "bar_grouped": [("x", "Category"), ("y", "Values")],
    "bar_stacked": [("x", "Category"), ("y", "Values")],
    "bar_stacked_100": [("x", "Category"), ("y", "Values")],
    "lollipop": [("x", "Category"), ("y", "Values")],
    "line": [("x", "X axis"), ("y", "Y axis")],
    "line_smooth": [("x", "X axis"), ("y", "Y axis")],
    "line_step": [("x", "X axis"), ("y", "Y axis")],
    "area": [("x", "X axis"), ("y", "Y axis")],
    "area_stacked": [("x", "X axis"), ("y", "Y axis")],
    "pie": [("x", "Labels"), ("y", "Values")],
    "donut": [("x", "Labels"), ("y", "Values")],
    "sunburst": [("path", "Hierarchy levels"), ("y", "Values")],
    "treemap": [("path", "Hierarchy levels"), ("y", "Values")],
    "funnel": [("x", "Stage"), ("y", "Values")],
    "histogram": [("x", "Values")],
    "boxplot": [("y", "Values")],
    "violin": [("y", "Values")],
    "heatmap": [("x", "X axis"), ("y", "Y axis"), ("value", "Value")],
    "density_heatmap": [("x", "X axis"), ("y", "Y axis")],
    "scatter": [("x", "X axis"), ("y", "Y axis")],
    "bubble": [("x", "X axis"), ("y", "Y axis"), ("size", "Bubble size")],
    "candlestick": [("x", "Date"), ("open", "Open"), ("high", "High"), ("low", "Low"), ("close", "Close")],
    "waterfall": [("x", "Step"), ("y", "Change")],
    "sankey": [("source", "Source"), ("target", "Target"), ("value", "Flow value")],
    "radar": [("x", "Axes"), ("y", "Values")],
    "polar_bar": [("x", "Axes"), ("y", "Values")],
    "parallel": [("y", "Dimensions")],
    "scatter_3d": [("x", "X axis"), ("y", "Y axis"), ("z", "Z axis")],
    "surface_3d": [("x", "X axis"), ("y", "Y axis"), ("value", "Z value")],
    "choropleth": [("location", "Country column"), ("value", "Color value")],
    "geo_scatter": [("lat", "Latitude"), ("lon", "Longitude")],
    "map_scatter": [("lat", "Latitude"), ("lon", "Longitude")],
    "map_density": [("lat", "Latitude"), ("lon", "Longitude")],
    "gauge": [],
    "metric": [],
    "bullet": [],
    "table": [],
}


def _validate(chart_type: str, cfg: dict[str, Any], df: pd.DataFrame) -> None:
    missing = []
    for key, label in REQUIRED_FIELDS.get(chart_type, []):
        v = cfg.get(key)
        if v is None or v == "" or (isinstance(v, list) and len(v) == 0):
            missing.append(label)
    if missing:
        raise ValueError(f"Map these fields first: {', '.join(missing)}")
    # mapped columns must exist in the query result
    for key, label in REQUIRED_FIELDS.get(chart_type, []):
        v = cfg.get(key)
        cols = v if isinstance(v, list) else [v]
        for c in cols:
            if c not in df.columns:
                raise ValueError(f"Column '{c}' ({label}) is not in the query result")


def _prepare(df: pd.DataFrame, cfg: dict[str, Any], chart_type: str) -> tuple[pd.DataFrame, dict]:
    """Normalize config + data so every chart computes correct numbers:
    1. y is always a list
    2. measure columns are coerced to numeric (string-numbers from drivers)
    3. duplicate categories are aggregated (sum by default, cfg['agg'] to override)
    """
    cfg = dict(cfg)
    ys = _ys(cfg)
    cfg["y"] = ys

    # numeric coercion for every measure-mapped column
    for col in [*ys, *[cfg.get(k) for k in NUMERIC_KEYS if cfg.get(k)]]:
        if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]):
            coerced = pd.to_numeric(df[col], errors="coerce")
            if not coerced.isna().all():  # only adopt if column is actually numeric-ish
                df[col] = coerced

    # series + multiple y don't mix in plotly express — keep first y
    if cfg.get("series") and len(ys) > 1:
        cfg["y"] = ys = ys[:1]

    agg = AGG_FUNCS.get(str(cfg.get("agg") or "sum").lower(), "sum")

    # Categorical measure: summing text makes no sense (it concatenates).
    # Fall back to counting rows — "pie of certificates by status" just works.
    if chart_type in AGGREGATING and ys and agg in ("sum", "mean"):
        if all(y in df.columns and not pd.api.types.is_numeric_dtype(df[y]) for y in ys):
            agg = "count"
    if chart_type == "choropleth" and cfg.get("value") in df.columns and agg in ("sum", "mean"):
        if not pd.api.types.is_numeric_dtype(df[cfg["value"]]):
            agg = "count"

    if chart_type in AGGREGATING and ys:
        keys = [k for k in (cfg.get("x"), cfg.get("series")) if k and k in df.columns]
        valid_ys = [y for y in ys if y in df.columns]
        if keys and valid_ys and df.duplicated(subset=keys).any():
            df = df.groupby(keys, sort=False, dropna=False)[valid_ys].agg(agg).reset_index()

    if chart_type == "choropleth" and cfg.get("location") and cfg.get("value"):
        if df.duplicated(subset=[cfg["location"]]).any():
            df = df.groupby(cfg["location"], sort=False, dropna=False)[[cfg["value"]]].agg(agg).reset_index()

    # Optional sort by the first measure (options.sort = asc|desc) — turns an
    # unordered bar/lollipop into a clean ranked chart.
    sort = str((cfg.get("options") or {}).get("sort") or "none").lower()
    if sort in ("asc", "desc") and chart_type in AGGREGATING and ys and not cfg.get("series"):
        ycol = next((y for y in ys if y in df.columns), None)
        if ycol is not None:
            df = df.sort_values(ycol, ascending=(sort == "asc"), kind="stable")

    return df, cfg


def _detect_latlon(columns: list[str]) -> tuple[str | None, str | None]:
    """Guess latitude/longitude columns by common names — used to auto-map
    geo charts and to offer a map suggestion."""
    low = {c.lower().strip(): c for c in columns}
    lat = next((low[k] for k in ("lat", "latitude", "lat_deg", "y_lat") if k in low), None)
    lon = next((low[k] for k in ("lon", "lng", "long", "longitude", "lon_deg", "x_lon") if k in low), None)
    return lat, lon


def _column_kinds(columns: list[str], rows: list[list[Any]]) -> list[str]:
    """Classify each column as 'num' | 'time' | 'cat' from sample values."""
    kinds = []
    for idx in range(len(columns)):
        sample = [r[idx] for r in rows[:20] if idx < len(r) and r[idx] is not None]
        if not sample:
            kinds.append("cat")
        elif all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in sample):
            kinds.append("num")
        elif all(isinstance(v, str) and re.match(r"^\d{4}[-/]\d{2}", v) for v in sample):
            kinds.append("time")
        else:
            kinds.append("cat")
    return kinds


def suggest_chart(columns: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    """Heuristic auto-chart: pick a sensible type + field mapping from result shape.
    Returns {chart_type, config}. The AI pipeline uses this to visualize answers."""
    if not columns or not rows:
        return {"chart_type": "table", "config": {}}

    kinds = _column_kinds(columns, rows)
    num_idx = [i for i, k in enumerate(kinds) if k == "num"]
    cat_idx = [i for i, k in enumerate(kinds) if k == "cat"]
    time_idx = [i for i, k in enumerate(kinds) if k == "time"]

    # single value → KPI number
    if len(rows) == 1 and len(num_idx) == 1 and len(columns) <= 2:
        return {"chart_type": "metric", "config": {"value": columns[num_idx[0]]}}
    # time + numeric → line
    if time_idx and num_idx:
        return {"chart_type": "line", "config": {"x": columns[time_idx[0]], "y": [columns[num_idx[0]]]}}
    # category + numeric → bar
    if cat_idx and num_idx:
        return {"chart_type": "bar", "config": {"x": columns[cat_idx[0]], "y": [columns[num_idx[0]]]}}
    # two numerics → scatter
    if len(num_idx) >= 2:
        return {"chart_type": "scatter", "config": {"x": columns[num_idx[0]], "y": [columns[num_idx[1]]]}}
    return {"chart_type": "table", "config": {}}


def suggest_charts(columns: list[str], rows: list[list[Any]], limit: int = 8) -> list[dict[str, Any]]:
    """Grafana-style 'visualization suggestions': several ranked chart candidates
    that fit the result shape, each with a ready field mapping. The builder shows
    a mini-preview of each so the user can pick one."""
    if not columns or not rows:
        return [{"chart_type": "table", "config": {}, "label": "Table", "reason": "Raw rows"}]

    kinds = _column_kinds(columns, rows)
    num = [columns[i] for i, k in enumerate(kinds) if k == "num"]
    cat = [columns[i] for i, k in enumerate(kinds) if k == "cat"]
    tim = [columns[i] for i, k in enumerate(kinds) if k == "time"]

    out: list[dict[str, Any]] = []
    def add(ct, cfg, label, reason):
        out.append({"chart_type": ct, "config": cfg, "label": label, "reason": reason})

    lat_c, lon_c = _detect_latlon(columns)
    if lat_c and lon_c:
        add("map_scatter", {"lat": lat_c, "lon": lon_c, **({"size": num[0]} if num else {})},
            "Map points", "Plot locations on a real map")

    if len(rows) == 1 and len(num) == 1:
        add("metric", {"value": num[0]}, "Stat", "One number — show it big")
        add("gauge", {"value": num[0]}, "Gauge", "Value against a range")
    if tim and num:
        add("line", {"x": tim[0], "y": [num[0]]}, "Time series", "Measure over time")
        add("area", {"x": tim[0], "y": [num[0]]}, "Area", "Filled trend")
        add("bar", {"x": tim[0], "y": [num[0]]}, "Bars", "Value per period")
    if cat and num:
        add("bar", {"x": cat[0], "y": [num[0]]}, "Bar", "Compare categories")
        add("bar_horizontal", {"x": cat[0], "y": [num[0]]}, "Horizontal bar", "Many / long labels")
        add("lollipop", {"x": cat[0], "y": [num[0]]}, "Lollipop", "Clean ranked comparison")
        add("pie", {"x": cat[0], "y": num[0]}, "Pie", "Share of total")
        add("donut", {"x": cat[0], "y": num[0]}, "Donut", "Share of total")
        add("treemap", {"path": [cat[0]], "y": num[0]}, "Treemap", "Nested proportions")
        if len(cat) >= 2:
            add("heatmap", {"x": cat[0], "y": cat[1], "value": num[0]}, "Heatmap", "Two dimensions + value")
    if len(num) >= 2:
        add("scatter", {"x": num[0], "y": [num[1]]}, "Scatter", "Relationship of two measures")
        add("density_heatmap", {"x": num[0], "y": [num[1]]}, "Density heatmap", "Where points concentrate")
        if len(num) >= 3:
            add("bubble", {"x": num[0], "y": [num[1]], "size": num[2]}, "Bubble", "Three measures")
            add("scatter_3d", {"x": num[0], "y": [num[1]], "z": num[2]}, "3D scatter", "Three measures in space")
    if len(num) >= 3:
        add("parallel", {"y": num[:4]}, "Parallel", "Compare many measures at once")
    if cat and len(num) >= 3:
        add("radar", {"x": cat[0], "y": num[:3]}, "Radar", "Multi-measure profile")
    add("table", {}, "Table", "Raw rows")

    seen, uniq = set(), []
    for s in out:
        if s["chart_type"] in seen:
            continue
        seen.add(s["chart_type"])
        uniq.append(s)
    return uniq[:limit]


# Chart types the chat switcher offers — all reliably auto-configure from result shape.
SWITCHABLE_TYPES = [
    "bar", "bar_horizontal", "line", "area", "pie", "donut",
    "scatter", "histogram", "radar", "metric", "table",
]


def config_for_type(chart_type: str, columns: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    """Auto-derive a sensible field mapping for a *specific* chart type.
    Used when a user switches chart type and we need fresh encodings."""
    if not columns:
        return {}
    kinds = _column_kinds(columns, rows)
    num = [columns[i] for i, k in enumerate(kinds) if k == "num"]
    cat = [columns[i] for i, k in enumerate(kinds) if k == "cat"]
    tim = [columns[i] for i, k in enumerate(kinds) if k == "time"]

    x_cat = (cat or tim or columns)[0]
    x_time = (tim or cat or columns)[0]
    y0 = num[0] if num else (columns[1] if len(columns) > 1 else columns[0])

    if chart_type in ("bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100",
                       "funnel", "waterfall", "lollipop"):
        return {"x": x_cat, "y": [y0]}
    if chart_type in ("line", "line_smooth", "line_step", "area", "area_stacked", "radar", "polar_bar"):
        return {"x": x_time if chart_type.startswith(("line", "area")) else x_cat, "y": [y0]}
    if chart_type == "parallel":
        return {"y": (num[:4] or [y0])}
    if chart_type == "density_heatmap":
        return {"x": num[0] if num else columns[0], "y": [num[1] if len(num) > 1 else y0]}
    if chart_type == "scatter_3d":
        return {"x": num[0] if num else columns[0],
                "y": [num[1] if len(num) > 1 else y0],
                "z": num[2] if len(num) > 2 else y0}
    if chart_type == "surface_3d":
        return {"x": x_cat, "y": [cat[1] if len(cat) > 1 else x_cat], "value": y0}
    if chart_type == "bullet":
        return {"value": num[0] if num else columns[0]}
    if chart_type in ("pie", "donut"):
        return {"x": x_cat, "y": y0}
    if chart_type in ("sunburst", "treemap"):
        return {"path": [x_cat], "y": y0}
    if chart_type == "scatter":
        return {"x": num[0] if num else columns[0], "y": [num[1] if len(num) > 1 else y0]}
    if chart_type == "bubble":
        return {"x": num[0] if num else columns[0], "y": [num[1] if len(num) > 1 else y0],
                "size": num[2] if len(num) > 2 else y0}
    if chart_type == "histogram":
        return {"x": num[0] if num else columns[0]}
    if chart_type in ("boxplot", "violin"):
        return {"y": [num[0] if num else columns[0]], **({"series": cat[0]} if cat else {})}
    if chart_type == "heatmap":
        return {"x": x_cat, "y": cat[1] if len(cat) > 1 else x_cat, "value": y0}
    if chart_type in ("metric", "gauge"):
        return {"value": num[0] if num else columns[0]}
    if chart_type == "choropleth":
        return {"location": cat[0] if cat else columns[0], "value": y0}
    if chart_type in ("map_scatter", "map_density", "geo_scatter"):
        lat, lon = _detect_latlon(columns)
        cfg: dict[str, Any] = {}
        if lat:
            cfg["lat"] = lat
        if lon:
            cfg["lon"] = lon
        if chart_type == "map_density" and num:
            cfg["value"] = num[0]
        return cfg
    return {}  # table, candlestick, sankey → need explicit/manual config


def _flt_num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _cmp_pair(a: Any, b: Any):
    """Return (a, b) coerced to a comparable pair: both float if possible, else
    both str. String comparison works for ISO dates/timestamps (they sort)."""
    na, nb = _flt_num(a), _flt_num(b)
    if na is not None and nb is not None:
        return na, nb
    return str(a), str(b)


def _filter_match(cell: Any, op: str, values: list[Any]) -> bool:
    vals = [v for v in values if v not in (None, "")]
    if op == "in":
        return str(cell) in {str(v) for v in values}
    if op == "contains":
        return bool(vals) and str(vals[0]).lower() in ("" if cell is None else str(cell)).lower()
    if op == "eq":
        return bool(values) and str(cell) == str(values[0])
    if op == "neq":
        return not values or str(cell) != str(values[0])
    if op in ("gt", "lt", "gte", "lte"):
        if not vals:
            return True
        c, v = _cmp_pair(cell, vals[0])
        try:
            return {"gt": c > v, "lt": c < v, "gte": c >= v, "lte": c <= v}[op]
        except TypeError:
            return False
    if op == "between":
        lo = values[0] if len(values) > 0 and values[0] not in (None, "") else None
        hi = values[1] if len(values) > 1 and values[1] not in (None, "") else None
        if lo is not None:
            c, l = _cmp_pair(cell, lo)
            try:
                if c < l:
                    return False
            except TypeError:
                return False
        if hi is not None:
            c, h = _cmp_pair(cell, hi)
            try:
                if c > h:
                    return False
            except TypeError:
                return False
        return True
    return True  # unknown op → no constraint


def apply_filters(columns: list[str], rows: list[list[Any]],
                  filters: list[dict[str, Any]] | None) -> list[list[Any]]:
    """Power BI-style cross-filtering: keep rows matching every filter whose
    column exists in this result. Filters whose column isn't present are ignored.
    Each filter: {"column": str, "op": str, "values": [...]}. `op` defaults to
    "in" (multi-select). Supported ops: in, contains, eq, neq, gt, lt, gte, lte,
    between. Comparisons coerce to number when possible, else string (ISO-date safe)."""
    if not filters:
        return rows
    idx = {c: i for i, c in enumerate(columns)}
    active = []
    for f in filters:
        col = f.get("column")
        if col not in idx:
            continue
        op = (f.get("op") or "in").lower()
        values = f.get("values") or []
        # a filter with no usable value is a no-op (don't drop everything)
        if not [v for v in values if v not in (None, "")]:
            continue
        active.append((idx[col], op, values))
    if not active:
        return rows
    return [r for r in rows
            if all(i < len(r) and _filter_match(r[i], op, values) for i, op, values in active)]


def distinct_values(columns: list[str], rows: list[list[Any]],
                    *, min_card: int = 2, max_card: int = 50) -> dict[str, list[str]]:
    """Per-column distinct string values for building filter dropdowns.
    Skips constant columns and high-cardinality ones (IDs / continuous measures)."""
    out: dict[str, list[str]] = {}
    for i, col in enumerate(columns):
        seen: set[str] = set()
        overflow = False
        for r in rows:
            if i >= len(r) or r[i] is None:
                continue
            seen.add(str(r[i]))
            if len(seen) > max_card:
                overflow = True
                break
        if not overflow and len(seen) >= min_card:
            out[col] = sorted(seen)
    return out


# Chart types with an x/y cartesian frame — axis/threshold/annotation options
# only make sense here.
CARTESIAN = {
    "bar", "bar_horizontal", "bar_grouped", "bar_stacked", "bar_stacked_100", "lollipop",
    "line", "line_smooth", "line_step", "area", "area_stacked",
    "scatter", "bubble", "histogram", "boxplot", "violin", "waterfall", "candlestick",
    "density_heatmap",
}


def _is_num(v: Any) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def _fmt_num(v: float) -> str:
    av = abs(v)
    if av >= 1e9:
        return f"{v / 1e9:.1f}B"
    if av >= 1e6:
        return f"{v / 1e6:.1f}M"
    if av >= 1e3:
        return f"{v / 1e3:.1f}K"
    return str(int(v)) if v == int(v) else f"{v:.2f}"


def _floats(seq: Any) -> list[float]:
    """Coerce a sequence to python floats, dropping bools/non-numerics.
    Handles numpy scalar types (np.int64 etc.) that fail isinstance(int)."""
    out: list[float] = []
    for v in seq:
        if isinstance(v, bool):
            continue
        try:
            out.append(float(v))
        except (TypeError, ValueError):
            continue
    return out


def _d3_format(opts: dict[str, Any]) -> str | None:
    """Build a d3 number format string from value-format options.
    decimals → fixed precision; thousands → grouping; both optional."""
    deci = opts.get("valueDecimals")
    grp = "," if opts.get("valueThousands") else ""
    if deci in (None, "") and not grp:
        return None
    try:
        d = int(deci) if deci not in (None, "") else None
    except (TypeError, ValueError):
        d = None
    return f"{grp}.{d}f" if d is not None else (f"{grp}" if grp else None)


def _texttemplate(opts: dict[str, Any], ref: str = "y") -> str:
    """Data-label template honouring prefix/suffix/decimals/thousands."""
    fmt = _d3_format(opts)
    inner = f"%{{{ref}:{fmt}}}" if fmt else f"%{{{ref}}}"
    pre = opts.get("valuePrefix") or ""
    suf = opts.get("valueSuffix") or ""
    return f"{pre}{inner}{suf}"


def _series_stats(yvals: list[Any], which: list[str]) -> dict[str, float]:
    nums = _floats(yvals)
    if not nums:
        return {}
    full = {"min": min(nums), "max": max(nums), "mean": sum(nums) / len(nums),
            "last": nums[-1], "sum": sum(nums)}
    return {k: full[k] for k in ("min", "max", "mean", "last", "sum") if k in which}


# Panel options (Grafana-style) applied after the figure is built. They ride
# inside the chart's config under cfg["options"], so preview/render/save all
# carry them with no schema changes.
def _apply_options(fig, opts: dict[str, Any], chart_type: str, theme: str | None):
    if not opts:
        return fig
    cart = chart_type in CARTESIAN

    # ── Title & description ──
    if opts.get("title"):
        fig.update_layout(title=dict(text=opts["title"], x=0.01, xanchor="left",
                                     font=dict(size=15)), margin=dict(t=48))
    if opts.get("description"):
        fig.add_annotation(text=opts["description"], xref="paper", yref="paper", x=0,
                           y=1.0, yshift=24 if opts.get("title") else 10, showarrow=False,
                           xanchor="left", font=dict(size=11, color="#94a3b8"))

    # ── Field overrides (per-series colour) — before any renaming below ──
    for tr in fig.data:
        col = (opts.get("fieldColors") or {}).get(getattr(tr, "name", None))
        if not col:
            continue
        try: tr.marker.color = col
        except Exception: pass
        try: tr.line.color = col
        except Exception: pass

    # ── Legend values appended to series names (Min/Max/Mean/Last/Sum) ──
    lvals = opts.get("legendValues") or []
    if lvals:
        for tr in fig.data:
            y, name = getattr(tr, "y", None), getattr(tr, "name", None)
            if y is None or name is None:
                continue
            stats = _series_stats(list(y), lvals)
            if stats:
                tr.name = f"{name}  ·  " + ", ".join(f"{k}={_fmt_num(v)}" for k, v in stats.items())

    # ── Legend mode + placement ──
    mode = opts.get("legendMode")
    if mode == "hidden":
        fig.update_layout(showlegend=False)
    elif mode in ("list", "table"):
        fig.update_layout(showlegend=True)
    place = opts.get("legendPlacement")
    if place == "bottom":
        fig.update_layout(legend=dict(orientation="h", yanchor="top", y=-0.18, x=0))
    elif place == "right":
        fig.update_layout(legend=dict(orientation="v", yanchor="top", y=1, x=1.02))

    # ── Tooltip mode + sort ──
    tm = opts.get("tooltipMode")
    if tm == "single":
        fig.update_layout(hovermode="closest")
    elif tm == "all":
        fig.update_layout(hovermode="x unified")
    elif tm == "hidden":
        fig.update_layout(hovermode=False)
    ts = opts.get("tooltipSort")
    if ts == "desc":
        fig.update_layout(legend_traceorder="reversed")
    elif ts == "asc":
        fig.update_layout(legend_traceorder="normal")

    # ── Axes (cartesian only) ──
    if cart:
        if opts.get("xLabel") is not None:
            fig.update_xaxes(title_text=opts["xLabel"])
        if opts.get("yLabel") is not None:
            fig.update_yaxes(title_text=opts["yLabel"])
        scale = opts.get("yScale")
        if scale in ("log", "symlog"):     # symlog → log (closest Plotly equiv)
            fig.update_yaxes(type="log")
        elif scale == "linear":
            fig.update_yaxes(type="linear")
        ymin, ymax = opts.get("yMin"), opts.get("yMax")
        if ymin is not None or ymax is not None:
            allv: list[float] = []
            for tr in fig.data:
                y = getattr(tr, "y", None)
                if y is not None:
                    allv += _floats(y)
            lo = ymin if ymin is not None else (min(allv) if allv else 0)
            hi = ymax if ymax is not None else (max(allv) if allv else 1)
            fig.update_yaxes(range=[lo, hi])
        yp = opts.get("yPlacement")
        if yp == "right":
            fig.update_yaxes(side="right")
        elif yp == "left":
            fig.update_yaxes(side="left")
        elif yp == "hidden":
            fig.update_yaxes(visible=False)

    # ── Thresholds (lines / filled regions / off) ──
    thr = [t for t in (opts.get("thresholds") or []) if _is_num(t.get("value"))]
    disp = opts.get("thresholdDisplay", "lines")
    if cart and thr and disp != "off":
        for t in thr:
            val = float(t["value"])
            color = t.get("color") or "#ef4444"
            if disp == "filled":
                top = max(val * 2, val + 1) if val >= 0 else val / 2
                fig.add_hrect(y0=val, y1=top, line_width=0, fillcolor=_rgba(color, 0.10), layer="below")
            fig.add_hline(y=val, line_color=color, line_width=1.5, line_dash="dash")

    # ── Annotations (vertical marker + label at an x value) ──
    for a in (opts.get("annotations") or []):
        x, text = a.get("x"), a.get("text") or ""
        if x is None or x == "":
            continue
        try:
            fig.add_vline(x=float(x) if _is_num(x) else x, line_color="#94a3b8",
                          line_width=1, line_dash="dot",
                          annotation_text=text, annotation_position="top")
        except Exception:
            pass

    # ── Value / number formatting (axes + hover) ──
    fmt = _d3_format(opts)
    pre, suf = opts.get("valuePrefix") or "", opts.get("valueSuffix") or ""
    if cart and (fmt or pre or suf):
        ax = dict()
        if fmt:
            ax["tickformat"] = fmt
        if pre:
            ax["tickprefix"] = pre
        if suf:
            ax["ticksuffix"] = suf
        fig.update_yaxes(**ax)

    # ── Data labels on the marks ──
    dl = opts.get("dataLabels")
    if dl and dl not in ("off", False):
        tt = _texttemplate(opts, "y")
        pos = opts.get("dataLabelPos") or "auto"
        for tr in fig.data:
            t = getattr(tr, "type", "")
            try:
                if t == "bar":
                    tr.texttemplate = tt
                    tr.textposition = pos if pos in ("inside", "outside", "auto", "none") else "auto"
                elif t == "funnel":
                    tr.texttemplate = tt
                elif t == "pie":
                    tr.textinfo = "label+percent"
                elif t == "scatter":
                    tr.texttemplate = _texttemplate(opts, "y")
                    tr.mode = "lines+markers+text" if "lines" in (tr.mode or "") else "markers+text"
                    tr.textposition = "top center"
            except Exception:
                pass

    # ── Line / marker / fill styling (cartesian) ──
    lw = opts.get("lineWidth")
    ms = opts.get("markerSize")
    fop = opts.get("fillOpacity")
    show_marks = opts.get("showMarkers")
    if cart and any(v is not None for v in (lw, ms, fop, show_marks)):
        for tr in fig.data:
            t = getattr(tr, "type", "")
            try:
                if t == "scatter":
                    if lw is not None:
                        tr.line.width = float(lw)
                    if ms is not None:
                        tr.marker.size = float(ms)
                    if show_marks is not None and "lines" in (tr.mode or ""):
                        tr.mode = "lines+markers" if show_marks else "lines"
                    if fop is not None and getattr(tr, "fill", None) not in (None, "none"):
                        base = (tr.line.color if tr.line and tr.line.color else COLORWAY[0])
                        tr.fillcolor = _rgba(base, float(fop))
                elif t == "bar" and fop is not None:
                    tr.marker.opacity = float(fop)
            except Exception:
                pass

    # ── Grid lines toggle ──
    if cart and opts.get("gridLines") is False:
        fig.update_xaxes(showgrid=False)
        fig.update_yaxes(showgrid=False)

    # ── KPI number formatting (metric / gauge / bullet indicators) ──
    if chart_type in ("metric", "gauge", "bullet") and (fmt or pre or suf):
        for tr in fig.data:
            if getattr(tr, "type", "") == "indicator":
                try:
                    tr.number.valueformat = fmt or ""
                    tr.number.prefix = pre
                    tr.number.suffix = suf
                except Exception:
                    pass

    # ── Transparent background toggle (default on) ──
    if opts.get("transparent") is False:
        bg = "#0f172a" if (theme or "light") == "dark" else "#ffffff"
        fig.update_layout(paper_bgcolor=bg, plot_bgcolor=bg)

    return fig


def build_figure(chart_type: str, cfg: dict[str, Any],
                 columns: list[str], rows: list[list[Any]],
                 palette: str | None = None, theme: str | None = None) -> dict[str, Any]:
    if chart_type not in ALL_CHART_TYPES:
        raise ValueError(f"Unknown chart type '{chart_type}'")
    df = _df(columns, rows)
    if df.empty and chart_type not in ("metric", "gauge", "table"):
        raise ValueError("Query returned no rows to chart")

    _validate(chart_type, cfg, df)
    df, cfg = _prepare(df, cfg, chart_type)

    # palette drives both the categorical colourway and the continuous scale.
    # A chart-level options.palette/colorScale overrides the dashboard default,
    # so a single chart can be recoloured without changing the whole board.
    opts = cfg.get("options") or {}
    pal_name = (opts.get("palette") or palette or "default")
    colors = resolve_palette(pal_name)
    scale = opts.get("colorScale") or CONTINUOUS.get(str(pal_name).lower(), "Blues")
    if opts.get("reverseScale"):
        scale = scale[:-2] if str(scale).endswith("_r") else f"{scale}_r"
    cfg = {**cfg, "_colors": colors, "_scale": scale, "_theme": theme}

    fig = _BUILDERS[chart_type](df, cfg)
    fig.update_layout(**_layout(colors, theme))
    _apply_options(fig, cfg.get("options") or {}, chart_type, theme)
    # tile maps fill their frame — the shared cartesian margins waste space
    if chart_type in ("map_scatter", "map_density"):
        fig.update_layout(margin=dict(l=0, r=0, t=30, b=0))
    # round-trip through plotly's own encoder to make numpy types JSON-safe
    return json.loads(fig.to_json())


# ── Comparison ─────────────────────────────────────────────────
def _bar(df, cfg):
    return px.bar(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), barmode="group")

def _bar_horizontal(df, cfg):
    return px.bar(df, y=cfg["x"], x=_ys(cfg), color=cfg.get("series"),
                  orientation="h", barmode="group")

def _bar_grouped(df, cfg):
    return px.bar(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), barmode="group")

def _bar_stacked(df, cfg):
    return px.bar(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), barmode="relative")

def _bar_stacked_100(df, cfg):
    fig = px.bar(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), barmode="relative")
    fig.update_layout(barnorm="percent")
    return fig


# ── Trend ──────────────────────────────────────────────────────
def _line(df, cfg):
    return px.line(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), markers=True)

def _line_smooth(df, cfg):
    return px.line(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"),
                   line_shape="spline", markers=True)

def _line_step(df, cfg):
    return px.line(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), line_shape="hv")

def _area(df, cfg):
    return px.area(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"), groupnorm=None)

def _area_stacked(df, cfg):
    return px.area(df, x=cfg["x"], y=_ys(cfg), color=cfg.get("series"))


# ── Part-to-whole ──────────────────────────────────────────────
def _pie(df, cfg):
    return px.pie(df, names=cfg["x"], values=_ys(cfg)[0])

def _donut(df, cfg):
    return px.pie(df, names=cfg["x"], values=_ys(cfg)[0], hole=0.55)

def _sunburst(df, cfg):
    path = cfg.get("path") or [cfg["x"]]
    return px.sunburst(df, path=path, values=_ys(cfg)[0])

def _treemap(df, cfg):
    path = cfg.get("path") or [cfg["x"]]
    return px.treemap(df, path=path, values=_ys(cfg)[0])

def _funnel(df, cfg):
    return px.funnel(df, y=cfg["x"], x=_ys(cfg)[0])


# ── Distribution ───────────────────────────────────────────────
def _histogram(df, cfg):
    return px.histogram(df, x=cfg["x"], color=cfg.get("series"), nbins=cfg.get("bins") or 30)

def _boxplot(df, cfg):
    return px.box(df, x=cfg.get("series"), y=_ys(cfg)[0], points="outliers")

def _violin(df, cfg):
    return px.violin(df, x=cfg.get("series"), y=_ys(cfg)[0], box=True, points="outliers")

def _heatmap(df, cfg):
    pivot = df.pivot_table(index=cfg["y"][0] if isinstance(cfg["y"], list) else cfg["y"],
                           columns=cfg["x"], values=cfg["value"], aggfunc="sum")
    return px.imshow(pivot, color_continuous_scale=cfg.get("_scale", "Blues"), aspect="auto",
                     labels=dict(color=cfg["value"]))


# ── Relationship / special ─────────────────────────────────────
def _scatter(df, cfg):
    return px.scatter(df, x=cfg["x"], y=_ys(cfg)[0], color=cfg.get("series"))

def _bubble(df, cfg):
    return px.scatter(df, x=cfg["x"], y=_ys(cfg)[0], size=cfg["size"],
                      color=cfg.get("series"), size_max=46)

def _candlestick(df, cfg):
    fig = go.Figure(go.Candlestick(
        x=df[cfg["x"]], open=df[cfg["open"]], high=df[cfg["high"]],
        low=df[cfg["low"]], close=df[cfg["close"]],
        increasing_line_color="#059669", decreasing_line_color="#ef4444",
    ))
    fig.update_layout(xaxis_rangeslider_visible=False)
    return fig

def _waterfall(df, cfg):
    y = _ys(cfg)[0]
    return go.Figure(go.Waterfall(
        x=df[cfg["x"]], y=df[y],
        connector=dict(line=dict(color="#cbd5e1")),
        increasing=dict(marker=dict(color="#059669")),
        decreasing=dict(marker=dict(color="#ef4444")),
        totals=dict(marker=dict(color="#2563eb")),
    ))

def _sankey(df, cfg):
    src_col, tgt_col, val_col = cfg["source"], cfg["target"], cfg["value"]
    colors = cfg.get("_colors", COLORWAY)
    nodes = pd.unique(df[[src_col, tgt_col]].values.ravel()).tolist()
    idx = {n: i for i, n in enumerate(nodes)}
    return go.Figure(go.Sankey(
        node=dict(label=nodes, pad=18, thickness=14,
                  color=[colors[i % len(colors)] for i in range(len(nodes))]),
        link=dict(
            source=[idx[v] for v in df[src_col]],
            target=[idx[v] for v in df[tgt_col]],
            value=df[val_col].tolist(),
            color=_rgba(colors[0], 0.18),
        ),
    ))

def _radar(df, cfg):
    fig = go.Figure()
    colors = cfg.get("_colors", COLORWAY)
    theta = df[cfg["x"]].astype(str).tolist()
    for i, y in enumerate(_ys(cfg)):
        fig.add_trace(go.Scatterpolar(
            r=df[y].tolist(), theta=theta, fill="toself", name=y,
            line=dict(color=colors[i % len(colors)]),
        ))
    fig.update_layout(polar=dict(radialaxis=dict(visible=True)))
    return fig


# ── Geo ────────────────────────────────────────────────────────
def _choropleth(df, cfg):
    mode = cfg.get("locationmode") or "country names"
    fig = px.choropleth(df, locations=cfg["location"], color=cfg["value"],
                        locationmode=mode, color_continuous_scale=cfg.get("_scale", "Blues"))
    fig.update_geos(showcoastlines=True, coastlinecolor="#cbd5e1",
                    showland=True, landcolor="#f8fafc", showframe=False)
    return fig

def _geo_scatter(df, cfg):
    fig = px.scatter_geo(df, lat=cfg["lat"], lon=cfg["lon"],
                         size=cfg.get("size"), color=cfg.get("series"),
                         hover_name=cfg.get("x"))
    fig.update_geos(showcoastlines=True, coastlinecolor="#cbd5e1",
                    showland=True, landcolor="#f8fafc", showframe=False)
    return fig


# ── Tile maps (real street/satellite basemaps, zoom + pan) ─────
def _fit_zoom(lat_span: float, lon_span: float) -> float:
    """Rough world-map zoom that frames a lat/lon bounding box."""
    span = max(abs(lat_span), abs(lon_span), 1e-6)
    return max(0.0, min(16.0, math.log2(360.0 / span) - 1))


def _apply_map_layout(fig, df, latc, lonc, cfg):
    """Set the basemap style, and auto-center/zoom to the data bounds."""
    opts = cfg.get("options") or {}
    theme = cfg.get("_theme")
    name = opts.get("mapStyle") or ("dark" if (theme or "light") == "dark" else "streets")
    style = MAP_STYLES.get(name, "open-street-map")
    if style == "satellite-streets" and not _MAPBOX_TOKEN:
        style = "open-street-map"  # satellite needs a token; degrade gracefully

    lats = pd.to_numeric(df[latc], errors="coerce").dropna()
    lons = pd.to_numeric(df[lonc], errors="coerce").dropna()
    mb: dict[str, Any] = {"style": style}
    if len(lats) and len(lons):
        mb["center"] = {"lat": float(lats.mean()), "lon": float(lons.mean())}
        z = opts.get("mapZoom")
        try:
            mb["zoom"] = float(z) if z not in (None, "") else _fit_zoom(
                float(lats.max() - lats.min()), float(lons.max() - lons.min()))
        except (TypeError, ValueError):
            mb["zoom"] = _fit_zoom(float(lats.max() - lats.min()), float(lons.max() - lons.min()))
    else:
        mb["zoom"] = 1
    if _MAPBOX_TOKEN:
        mb["accesstoken"] = _MAPBOX_TOKEN
    fig.update_layout(mapbox=mb, margin=dict(l=0, r=0, t=30, b=0))
    return fig


def _map_scatter(df, cfg):
    fig = px.scatter_mapbox(
        df, lat=cfg["lat"], lon=cfg["lon"],
        size=cfg.get("size"), color=cfg.get("series"),
        hover_name=cfg.get("x"), size_max=26, opacity=0.85,
        color_discrete_sequence=cfg.get("_colors", COLORWAY),
        color_continuous_scale=cfg.get("_scale", "Blues"))
    return _apply_map_layout(fig, df, cfg["lat"], cfg["lon"], cfg)


def _map_density(df, cfg):
    try:
        radius = int((cfg.get("options") or {}).get("radius") or cfg.get("radius") or 22)
    except (TypeError, ValueError):
        radius = 22
    fig = px.density_mapbox(
        df, lat=cfg["lat"], lon=cfg["lon"], z=cfg.get("value"),
        radius=radius, color_continuous_scale=cfg.get("_scale", "Blues"))
    return _apply_map_layout(fig, df, cfg["lat"], cfg["lon"], cfg)


# ── KPI / single value ─────────────────────────────────────────
def _first_value(df, cfg):
    col = cfg.get("value") or (df.columns[0] if len(df.columns) else None)
    if col is None or df.empty:
        return 0
    val = df[col].iloc[0]
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0

def _gauge(df, cfg):
    accent = cfg.get("_colors", COLORWAY)[0]
    val = float(_first_value(df, cfg) or 0)
    max_val = float(cfg.get("max") or (val * 1.5 if val else 100))
    return go.Figure(go.Indicator(
        mode="gauge+number", value=val,
        gauge=dict(
            axis=dict(range=[0, max_val]),
            bar=dict(color=accent),
            steps=[dict(range=[0, max_val * 0.6], color=_rgba(accent, 0.10)),
                   dict(range=[max_val * 0.6, max_val * 0.85], color=_rgba(accent, 0.22))],
        ),
    ))

def _metric(df, cfg):
    accent = cfg.get("_colors", COLORWAY)[0]
    num = _first_value(df, cfg)
    return go.Figure(go.Indicator(
        mode="number", value=num,
        title=dict(text=cfg.get("title") or (cfg.get("value") or ""), font=dict(size=15)),
        number=dict(font=dict(size=52, color=accent)),
    ))

def _table(df, cfg):
    df = df.head(100)  # render cap; full data belongs in the SQL editor grid
    return go.Figure(go.Table(
        header=dict(values=list(df.columns), fill_color="#f8fafc",
                    font=dict(color="#334155", size=12), align="left",
                    line_color="#e2e8f0"),
        cells=dict(values=[df[c] for c in df.columns], fill_color="white",
                   font=dict(color="#475569", size=11), align="left",
                   line_color="#f1f5f9", height=26),
    ))


# ── Extra chart types ──────────────────────────────────────────
def _lollipop(df, cfg):
    """Lollipop = thin stems + a marker head. Cleaner than bars for ranked
    comparisons with many categories."""
    x = cfg["x"]
    colors = cfg.get("_colors", COLORWAY)
    cats = df[x].astype(str).tolist()
    fig = go.Figure()
    for i, y in enumerate(_ys(cfg)):
        c = colors[i % len(colors)]
        vals = df[y].tolist()
        for cat, v in zip(cats, vals):
            try:
                fig.add_shape(type="line", x0=cat, x1=cat, y0=0, y1=v,
                              line=dict(color=c, width=2), layer="below")
            except Exception:
                pass
        fig.add_trace(go.Scatter(x=cats, y=vals, mode="markers", name=y,
                                 marker=dict(size=12, color=c, line=dict(width=0))))
    fig.update_layout(showlegend=len(_ys(cfg)) > 1)
    return fig


def _density_heatmap(df, cfg):
    bins = cfg.get("bins") or 30
    return px.density_heatmap(df, x=cfg["x"], y=_ys(cfg)[0], nbinsx=bins, nbinsy=bins,
                              color_continuous_scale=cfg.get("_scale", "Blues"))


def _polar_bar(df, cfg):
    return px.bar_polar(df, r=_ys(cfg)[0], theta=df[cfg["x"]].astype(str),
                        color=cfg.get("series"),
                        color_discrete_sequence=cfg.get("_colors", COLORWAY))


def _parallel(df, cfg):
    dims = [y for y in _ys(cfg) if y in df.columns]
    color = cfg.get("series")
    use_color = color if (color in df.columns and pd.api.types.is_numeric_dtype(df[color])) else None
    return px.parallel_coordinates(df, dimensions=dims, color=use_color,
                                   color_continuous_scale=cfg.get("_scale", "Blues"))


def _scatter_3d(df, cfg):
    return px.scatter_3d(df, x=cfg["x"], y=_ys(cfg)[0], z=cfg["z"],
                         color=cfg.get("series"), size=cfg.get("size"),
                         color_discrete_sequence=cfg.get("_colors", COLORWAY))


def _surface_3d(df, cfg):
    y0 = _ys(cfg)[0]
    pivot = df.pivot_table(index=y0, columns=cfg["x"], values=cfg["value"], aggfunc="mean")
    return go.Figure(go.Surface(z=pivot.values,
                                x=[str(c) for c in pivot.columns],
                                y=[str(i) for i in pivot.index],
                                colorscale=cfg.get("_scale", "Blues")))


def _bullet(df, cfg):
    """KPI value against a target on a horizontal bullet gauge."""
    opts = cfg.get("options") or {}
    accent = cfg.get("_colors", COLORWAY)[0]
    val = float(_first_value(df, cfg) or 0)
    try:
        target = float(opts.get("target")) if opts.get("target") not in (None, "") else val * 1.1
    except (TypeError, ValueError):
        target = val * 1.1
    try:
        max_val = float(opts.get("max")) if opts.get("max") not in (None, "") else max(val, target) * 1.3
    except (TypeError, ValueError):
        max_val = max(val, target) * 1.3
    max_val = max_val or 100
    return go.Figure(go.Indicator(
        mode="number+gauge+delta", value=val,
        delta=dict(reference=target),
        gauge=dict(
            shape="bullet",
            axis=dict(range=[0, max_val]),
            bar=dict(color=accent),
            steps=[dict(range=[0, max_val * 0.6], color=_rgba(accent, 0.10)),
                   dict(range=[max_val * 0.6, max_val * 0.85], color=_rgba(accent, 0.22))],
            threshold=dict(line=dict(color="#ef4444", width=2), thickness=0.8, value=target),
        ),
    ))


_BUILDERS = {
    "bar": _bar, "bar_horizontal": _bar_horizontal, "bar_grouped": _bar_grouped,
    "bar_stacked": _bar_stacked, "bar_stacked_100": _bar_stacked_100, "lollipop": _lollipop,
    "line": _line, "line_smooth": _line_smooth, "line_step": _line_step,
    "area": _area, "area_stacked": _area_stacked,
    "pie": _pie, "donut": _donut, "sunburst": _sunburst, "treemap": _treemap, "funnel": _funnel,
    "histogram": _histogram, "boxplot": _boxplot, "violin": _violin, "heatmap": _heatmap,
    "density_heatmap": _density_heatmap,
    "scatter": _scatter, "bubble": _bubble, "candlestick": _candlestick,
    "waterfall": _waterfall, "sankey": _sankey, "radar": _radar, "polar_bar": _polar_bar,
    "parallel": _parallel, "scatter_3d": _scatter_3d, "surface_3d": _surface_3d,
    "choropleth": _choropleth, "geo_scatter": _geo_scatter,
    "map_scatter": _map_scatter, "map_density": _map_density,
    "gauge": _gauge, "metric": _metric, "bullet": _bullet, "table": _table,
}
