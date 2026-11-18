"""Safe `{{ variable }}` substitution for dashboard query variables.

Threat model: the chart's SQL template is written by the chart owner (trusted —
they can already write any SQL on their own source). The *variable values* come
from dashboard viewers (untrusted). So the job is to inject viewer-supplied
values into the owner's SQL **without** allowing SQL injection.

Defences (all enforced):
  1. Only `{{ identifier }}` placeholders are recognised — the regex matches a
     strict identifier, so a viewer can never introduce a new placeholder.
  2. Only variables DEFINED on the dashboard are substituted; an unknown
     placeholder raises (fails closed).
  3. Every value is rendered as a literal, validated by type:
       - number : must match a numeric regex → emitted as a bare numeric literal.
       - date   : must match YYYY-MM-DD[ T HH:MM[:SS]] → emitted as a quoted literal.
       - select : must be one of the variable's whitelisted options.
       - text   : quoted + escaped (backslash and single-quote neutralised, which
                  covers standard SQL and MySQL backslash escaping).
  Result: a value can only ever become a self-contained literal; it can never
  break out to add clauses/statements.
"""
import re
from typing import Any

_PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$")


class VariableError(ValueError):
    """Raised when a value fails validation (surfaced to the user as a 400)."""


def has_variables(sql: str | None) -> bool:
    return bool(sql) and "{{" in sql and bool(_PLACEHOLDER.search(sql))


def _escape_str(s: str) -> str:
    """Wrap as a SQL string literal, neutralising backslashes and single quotes.
    Doubling quotes is standard SQL; escaping backslashes also defeats MySQL's
    backslash-escape mode — so the value can't terminate the literal."""
    return "'" + str(s).replace("\\", "\\\\").replace("'", "''") + "'"


def _render(var_def: dict[str, Any], raw: Any) -> str:
    name = var_def.get("name", "?")
    vtype = (var_def.get("type") or "text").lower()
    val = raw if raw not in (None, "") else var_def.get("default", "")
    val = "" if val is None else str(val)

    if vtype == "number":
        if not _NUM_RE.match(val.strip()):
            raise VariableError(f"Variable “{name}” must be a number.")
        return val.strip()                          # validated numeric literal (no quotes)
    if vtype == "date":
        if not _DATE_RE.match(val.strip()):
            raise VariableError(f"Variable “{name}” must be a date (YYYY-MM-DD).")
        return _escape_str(val.strip())
    if vtype == "select":
        opts = [str(o) for o in (var_def.get("options") or [])]
        if val not in opts:
            raise VariableError(f"Variable “{name}” must be one of its allowed options.")
        return _escape_str(val)
    # text (default)
    return _escape_str(val)


def substitute(sql: str, var_defs: list[dict[str, Any]] | None,
               values: dict[str, Any] | None) -> str:
    """Replace every `{{ name }}` in `sql` with a safe literal. Raises
    VariableError on an unknown placeholder or an invalid value."""
    if not sql or "{{" not in sql:
        return sql
    defs = {d["name"]: d for d in (var_defs or [])
            if isinstance(d, dict) and d.get("name") and _NAME_RE.match(str(d["name"]))}
    values = values or {}

    def repl(m: re.Match) -> str:
        name = m.group(1)
        d = defs.get(name)
        if not d:
            raise VariableError(f"Unknown variable “{name}”.")
        return _render(d, values.get(name))

    return _PLACEHOLDER.sub(repl, sql)
