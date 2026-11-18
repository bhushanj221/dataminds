"""Lineage graph builder.

Walks every asset a user owns and derives a dependency graph:

    Source ─▶ Table ─▶ Chart  ─▶ Dashboard
                   ├▶ KPI    ─▶ Alert
                   └▶ Report

Table references are extracted from each asset's SQL with a lightweight
FROM/JOIN scanner (no SQL-parser dependency). This catches the common cases;
it can be upgraded to sqlglot later for full CTE/subquery/column lineage.
"""
import json
import re

import sqlglot
from sqlglot import exp
from sqlglot.lineage import lineage as _sg_lineage

# Map our data-source types → sqlglot dialects (None = generic parser).
_DIALECTS = {
    "postgresql": "postgres", "postgres": "postgres", "redshift": "redshift",
    "mysql": "mysql", "mariadb": "mysql", "duckdb": "duckdb", "motherduck": "duckdb",
    "snowflake": "snowflake", "bigquery": "bigquery", "sqlite": "sqlite",
    "mssql": "tsql", "sqlserver": "tsql", "clickhouse": "clickhouse",
    "oracle": "oracle", "trino": "trino", "athena": "trino", "databricks": "databricks",
}


def sqlglot_dialect(source_type: str | None) -> str | None:
    return _DIALECTS.get((source_type or "").lower())


# Words that can follow FROM/JOIN but are NOT table names.
_NOT_TABLES = {"select", "lateral", "unnest", "values", "table"}

# FROM/JOIN followed by an identifier (optionally schema-qualified / quoted).
_TABLE_RE = re.compile(
    r'\b(?:from|join)\s+'
    r'(?P<tbl>"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)',
    re.IGNORECASE,
)

# Names defined in a WITH … AS (…) clause — these are CTEs, not real tables.
_CTE_RE = re.compile(r'(?:\bwith\b|,)\s*("[^"]+"|`[^`]+`|[A-Za-z_][\w$]*)\s+as\s*\(', re.IGNORECASE)


def _cte_names(sql: str) -> set[str]:
    return {m.group(1).strip('"`').lower() for m in _CTE_RE.finditer(sql)}


def _strip_comments(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    return sql


def extract_tables(sql: str, source_type: str | None = None) -> list[str]:
    """Distinct base tables referenced by a query. Prefers sqlglot (handles
    CTEs/subqueries/aliases); falls back to the regex scanner on parse error."""
    if not sql:
        return []
    try:
        tree = sqlglot.parse_one(sql, dialect=sqlglot_dialect(source_type))
        cte_names = {c.alias_or_name.lower() for c in tree.find_all(exp.CTE)}
        out, seen = [], set()
        for t in tree.find_all(exp.Table):
            name = t.name
            key = name.lower()
            if not name or key in cte_names or key in seen:
                continue
            seen.add(key)
            out.append(name)
        if out:
            return out
    except Exception:
        pass
    return _extract_tables_regex(sql)


def _extract_tables_regex(sql: str) -> list[str]:
    """Dependency-free fallback table scanner."""
    cleaned = _strip_comments(sql)
    ctes = _cte_names(cleaned)
    found: list[str] = []
    seen: set[str] = set()
    for m in _TABLE_RE.finditer(cleaned):
        raw = m.group("tbl").strip().strip('"`[]')
        # keep the last component as the table name (drop schema/db prefix for the label)
        name = raw.split(".")[-1].strip('"`[]')
        key = name.lower()
        if not name or key in _NOT_TABLES or key in ctes:
            continue
        if key not in seen:
            seen.add(key)
            found.append(name)
    return found


def _node(nid: str, ntype: str, label: str, **meta) -> dict:
    return {"id": nid, "type": ntype, "label": label, "meta": meta}


def build_graph(sources: list[dict], charts: list[dict], kpis: list[dict],
                reports: list[dict], dashboards: list[dict], alerts: list[dict]) -> dict:
    """Build {nodes, edges} from the user's assets.

    Each input is a list of plain dicts:
      sources:    {id, name, type}
      charts:     {id, name, source_id, sql}
      kpis:       {id, name, source_id, sql}
      reports:    {id, name, source_id, sql}
      dashboards: {id, name, chart_ids: [int]}
      alerts:     {id, name, kpi_id}
    """
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    edge_seen: set[tuple[str, str]] = set()

    def add_node(node: dict):
        nodes.setdefault(node["id"], node)

    def add_edge(src: str, dst: str, kind: str = "feeds"):
        if (src, dst) in edge_seen or src == dst:
            return
        edge_seen.add((src, dst))
        edges.append({"from": src, "to": dst, "kind": kind})

    src_name = {s["id"]: s["name"] for s in sources}
    src_type = {s["id"]: s.get("type") for s in sources}
    for s in sources:
        add_node(_node(f"source:{s['id']}", "source", s["name"], db_type=s.get("type")))

    def table_id(source_id: int, tbl: str) -> str:
        return f"table:{source_id}:{tbl.lower()}"

    # SQL-bearing assets: chart / kpi / report
    def wire_sql_asset(asset: dict, ntype: str):
        nid = f"{ntype}:{asset['id']}"
        add_node(_node(nid, ntype, asset["name"], source_id=asset.get("source_id")))
        sid = asset.get("source_id")
        source_node = f"source:{sid}" if sid in src_name else None
        tables = extract_tables(asset.get("sql", ""), src_type.get(sid))
        if tables:
            for t in tables:
                tid = table_id(sid, t)
                add_node(_node(tid, "table", t, source_id=sid, source_name=src_name.get(sid)))
                if source_node:
                    add_edge(source_node, tid)
                add_edge(tid, nid)
        elif source_node:
            add_edge(source_node, nid)  # fall back so it isn't orphaned
        return nid

    for c in charts:
        wire_sql_asset(c, "chart")
    for k in kpis:
        wire_sql_asset(k, "kpi")
    for r in reports:
        wire_sql_asset(r, "report")

    # dashboards depend on their charts
    for d in dashboards:
        did = f"dashboard:{d['id']}"
        add_node(_node(did, "dashboard", d["name"]))
        for cid in d.get("chart_ids", []):
            chart_node = f"chart:{cid}"
            if chart_node in nodes:
                add_edge(chart_node, did)

    # alerts depend on their KPI
    for a in alerts:
        aid = f"alert:{a['id']}"
        add_node(_node(aid, "alert", a["name"]))
        kpi_node = f"kpi:{a.get('kpi_id')}"
        if kpi_node in nodes:
            add_edge(kpi_node, aid)

    counts: dict[str, int] = {}
    for n in nodes.values():
        counts[n["type"]] = counts.get(n["type"], 0) + 1

    return {"nodes": list(nodes.values()), "edges": edges, "counts": counts}


def _adjacency(edges: list[dict], reverse: bool = False) -> dict[str, list[str]]:
    adj: dict[str, list[str]] = {}
    for e in edges:
        a, b = (e["to"], e["from"]) if reverse else (e["from"], e["to"])
        adj.setdefault(a, []).append(b)
    return adj


def _walk(start: str, adj: dict[str, list[str]]) -> list[str]:
    seen: set[str] = set()
    stack = list(adj.get(start, []))
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(adj.get(cur, []))
    return list(seen)


def _trace_column(col: str, sql: str, schema: dict | None, dialect: str | None,
                  alias_map: dict[str, str] | None = None) -> list[str]:
    """Trace one output column to its leaf source columns (through CTEs/subqueries).
    Resolves table aliases (e.g. `c.country` → `customers.country`)."""
    try:
        node = _sg_lineage(col, sql, schema=schema, dialect=dialect)
    except Exception:
        return []
    amap = alias_map or {}
    leaves, seen, stack = [], set(), list(node.downstream)
    while stack:
        n = stack.pop()
        if n.downstream:
            stack.extend(n.downstream)
        else:
            name = (n.name or "").strip()
            if name and "." in name:
                tbl, _, colname = name.rpartition(".")
                name = f"{amap.get(tbl, tbl)}.{colname}"
                if name not in seen:
                    seen.add(name)
                    leaves.append(name)
    return sorted(leaves)


def column_lineage(sql: str, source_type: str | None = None, schema: dict | None = None) -> dict:
    """For each output column of the query, the source table.columns feeding it.

    `schema` is {table: {column: type}} from the source — when provided, bare
    columns resolve to their real table and CTEs/subqueries trace to base tables.
    Returns {output_columns: [{output, sources}], tables, star, error?}."""
    dialect = sqlglot_dialect(source_type)
    tables = extract_tables(sql, source_type)
    try:
        tree = sqlglot.parse_one(sql, dialect=dialect)
    except Exception:
        return {"output_columns": [], "tables": tables, "star": False, "error": "Could not parse SQL"}

    select = tree.find(exp.Select)
    if select is None:
        return {"output_columns": [], "tables": tables, "star": False}

    # alias → real table name (for resolving leaf column owners)
    alias_map = {t.alias_or_name: t.name for t in tree.find_all(exp.Table)}

    star = False
    names: list[str] = []
    for proj in select.expressions:
        # a bare `*` or `table.*` is a star projection — but NOT COUNT(*) etc.,
        # which merely *contains* a Star deeper in the expression.
        if isinstance(proj, exp.Star) or (isinstance(proj, exp.Column) and isinstance(proj.this, exp.Star)):
            star = True
            continue
        nm = proj.alias_or_name
        if nm:
            names.append(nm)

    results = []
    for nm in names:
        results.append({"output": nm, "sources": _trace_column(nm, sql, schema, dialect, alias_map)})
    return {"output_columns": results, "tables": tables, "star": star}


def impact(node_id: str, graph: dict) -> dict:
    """Downstream (what breaks if this changes) + upstream (where it comes from)."""
    down = _walk(node_id, _adjacency(graph["edges"]))
    up = _walk(node_id, _adjacency(graph["edges"], reverse=True))
    by_id = {n["id"]: n for n in graph["nodes"]}
    downstream = [by_id[n] for n in down if n in by_id]
    upstream = [by_id[n] for n in up if n in by_id]
    affected: dict[str, int] = {}
    for n in downstream:
        affected[n["type"]] = affected.get(n["type"], 0) + 1
    return {
        "node": by_id.get(node_id),
        "downstream": downstream,
        "upstream": upstream,
        "affected_counts": affected,
    }
