"""KPI evaluation + alert condition logic.

A KPI's SQL is expected to return a scalar — we take the first value that
casts to a float, scanning the first row left-to-right. The status band
(green/yellow/red) is derived from the configured thresholds, with the
meaning flipping based on whether higher or lower is better.
"""
from app.connectors.base import BaseConnector


def extract_scalar(result: dict) -> float | None:
    """Pull a single numeric value out of a query result.
    Returns None when there are no rows (a 'no data' condition)."""
    rows = result.get("rows") or []
    if not rows:
        return None
    for cell in rows[0]:
        if cell is None:
            continue
        if isinstance(cell, bool):
            return float(cell)
        if isinstance(cell, (int, float)):
            return float(cell)
        try:
            return float(str(cell).replace(",", "").strip())
        except (ValueError, TypeError):
            continue
    return None


def evaluate_kpi_value(connector: BaseConnector, sql: str) -> float | None:
    """Run the KPI SQL and return its scalar value (None = no data)."""
    result = connector.execute(sql, 1)
    return extract_scalar(result)


def status_for(value: float | None, direction: str,
               green: float | None, yellow: float | None) -> str:
    """Classify a value into green/yellow/red given the threshold bands.

    higher-is-better:  value >= green → green; >= yellow → yellow; else red.
    lower-is-better:   value <= green → green; <= yellow → yellow; else red.
    If thresholds aren't set, everything with a value is 'green'."""
    if value is None:
        return "no_data"
    if green is None and yellow is None:
        return "green"
    if direction == "higher":
        if green is not None and value >= green:
            return "green"
        if yellow is not None and value >= yellow:
            return "yellow"
        return "red"
    else:  # lower is better
        if green is not None and value <= green:
            return "green"
        if yellow is not None and value <= yellow:
            return "yellow"
        return "red"


_OPS = {
    ">":  lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<":  lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def evaluate_alert(alert, value: float | None, prev_value: float | None) -> tuple[bool, str, str]:
    """Decide whether an alert condition is met.

    Returns (fired, status, message).
      status ∈ {ok, triggered, no_data, error}
    """
    if alert.alert_type == "no_data":
        if value is None:
            return True, "no_data", "No data returned — the underlying query produced 0 rows."
        return False, "ok", ""

    if value is None:
        # threshold / pct_change can't evaluate without a value
        return True, "no_data", "No data returned — cannot evaluate the alert condition."

    if alert.alert_type == "threshold":
        op = _OPS.get(alert.operator or ">")
        target = alert.threshold_value
        if target is None:
            return False, "error", "Threshold alert has no threshold value configured."
        if op(value, target):
            return True, "triggered", f"Value {_fmt(value)} is {alert.operator} {_fmt(target)}."
        return False, "ok", ""

    if alert.alert_type == "pct_change":
        if prev_value is None or prev_value == 0:
            return False, "ok", ""
        change = (value - prev_value) / abs(prev_value) * 100.0
        limit = alert.pct_change if alert.pct_change is not None else 0
        if abs(change) >= abs(limit):
            arrow = "up" if change >= 0 else "down"
            return True, "triggered", (
                f"Value moved {arrow} {abs(change):.1f}% "
                f"({_fmt(prev_value)} → {_fmt(value)}), crossing the {abs(limit):.1f}% threshold."
            )
        return False, "ok", ""

    return False, "error", f"Unknown alert type: {alert.alert_type}"


def _fmt(v: float) -> str:
    if v == int(v):
        return f"{int(v):,}"
    return f"{v:,.2f}"
