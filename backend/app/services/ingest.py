"""Ingestion service — files, Google Sheets, REST APIs → DuckDB.

Every ingested source becomes a DuckDB database file under UPLOAD_DIR.
After ingestion it behaves exactly like any SQL data source: schema
browsing, queries, and (later) the AI pipeline all work unchanged.
"""
import io
import os
import re
import uuid
from typing import Any
from urllib.parse import urlparse, parse_qs

import duckdb
import requests

UPLOAD_DIR = "/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB

FILE_FORMATS = {".csv": "csv", ".tsv": "csv", ".txt": "csv",
                ".xlsx": "excel", ".xls": "excel",
                ".json": "json", ".ndjson": "json", ".jsonl": "json",
                ".parquet": "parquet"}


def new_db_path() -> str:
    return os.path.join(UPLOAD_DIR, f"src_{uuid.uuid4().hex}.duckdb")


def safe_table_name(raw: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9_]", "_", raw.strip()).strip("_").lower() or "data"
    if name[0].isdigit():
        name = "t_" + name
    return name[:60]


def _create_csv_table(con, table: str, path: str) -> None:
    """Load a CSV into `table`, hardened against delimiter-sniffing failures.

    DuckDB's auto-sniffer occasionally collapses every row into a single column
    whose *name* still contains the delimiter (e.g. one column literally called
    'city,lat,lng,...'). When we detect that, retry with an explicit delimiter so
    the columns split correctly instead of leaving an unusable one-column table."""
    con.execute(
        f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_csv_auto(?, sample_size=-1)',
        [path],
    )
    cols = [r[1] for r in con.execute(f'PRAGMA table_info("{table}")').fetchall()]
    if len(cols) == 1 and any(d in cols[0] for d in (",", ";", "\t", "|")):
        delim = max((",", ";", "\t", "|"), key=lambda d: cols[0].count(d))
        con.execute(
            f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM '
            f"read_csv(?, delim=?, header=true, sample_size=-1, ignore_errors=true)",
            [path, delim],
        )


def _row_count(db_path: str, table: str) -> int:
    con = duckdb.connect(db_path)
    try:
        return con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
    finally:
        con.close()


# ── Files ──────────────────────────────────────────────────────
def ingest_file(filename: str, content: bytes, db_path: str | None = None,
                table: str | None = None) -> dict[str, Any]:
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError(f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)")
    ext = os.path.splitext(filename)[1].lower()
    fmt = FILE_FORMATS.get(ext)
    if not fmt:
        raise ValueError(f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(FILE_FORMATS))}")

    db_path = db_path or new_db_path()
    table = table or safe_table_name(os.path.splitext(os.path.basename(filename))[0])

    # Write raw bytes to a temp file DuckDB can read
    tmp = os.path.join(UPLOAD_DIR, f"tmp_{uuid.uuid4().hex}{ext}")
    with open(tmp, "wb") as f:
        f.write(content)

    con = duckdb.connect(db_path)
    try:
        if fmt == "csv":
            _create_csv_table(con, table, tmp)
        elif fmt == "json":
            con.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_json_auto(?)', [tmp])
        elif fmt == "parquet":
            con.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM read_parquet(?)', [tmp])
        elif fmt == "excel":
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))  # noqa: F841 — registered below
            con.register("df_upload", df)
            con.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM df_upload')
            con.unregister("df_upload")
        rows = con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        cols = len(con.execute(f'DESCRIBE "{table}"').fetchall())
    finally:
        con.close()
        try:
            os.remove(tmp)
        except OSError:
            pass

    return {"db_path": db_path, "table": table, "format": fmt, "row_count": rows, "column_count": cols}


# ── Google Sheets ──────────────────────────────────────────────
def gsheet_export_url(url: str) -> str:
    """Convert a Google Sheets share link to its CSV export URL."""
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url)
    if not m:
        raise ValueError("Not a valid Google Sheets URL (expected …/spreadsheets/d/<id>/…)")
    sheet_id = m.group(1)
    # preserve tab (gid) if present in fragment or query
    gid = "0"
    frag_q = parse_qs(urlparse(url).fragment) | parse_qs(urlparse(url).query)
    if "gid" in frag_q:
        gid = frag_q["gid"][0]
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def ingest_gsheet(url: str, db_path: str | None = None, table: str | None = None) -> dict[str, Any]:
    export_url = gsheet_export_url(url)
    resp = requests.get(export_url, timeout=30, allow_redirects=True)
    content_type = resp.headers.get("content-type", "")
    if resp.status_code != 200 or "text/html" in content_type:
        raise ValueError(
            "Could not read the sheet. Make sure sharing is set to 'Anyone with the link can view'."
        )
    return ingest_file("sheet.csv", resp.content, db_path=db_path, table=table or "sheet")


# ── REST API ───────────────────────────────────────────────────
def _auth_headers(cfg: dict[str, Any]) -> tuple[dict[str, str], tuple[str, str] | None]:
    headers = {"Accept": "application/json"}
    basic = None
    auth_type = cfg.get("auth_type", "none")
    if auth_type == "bearer" and cfg.get("auth_token"):
        headers["Authorization"] = f"Bearer {cfg['auth_token']}"
    elif auth_type == "api_key" and cfg.get("header_name"):
        headers[cfg["header_name"]] = cfg.get("header_value", "")
    elif auth_type == "basic":
        basic = (cfg.get("username", ""), cfg.get("password", ""))
    return headers, basic


def _dig(data: Any, path: str) -> Any:
    """Navigate a dotted JSON path like 'data.items'."""
    for part in path.split("."):
        if part:
            if isinstance(data, dict) and part in data:
                data = data[part]
            else:
                raise ValueError(f"JSON path '{path}' not found in response (failed at '{part}')")
    return data


def ingest_restapi(cfg: dict[str, Any], db_path: str | None = None,
                   table: str | None = None) -> dict[str, Any]:
    import pandas as pd

    headers, basic = _auth_headers(cfg)
    resp = requests.get(cfg["url"], headers=headers, auth=basic, timeout=30)
    if resp.status_code >= 400:
        raise ValueError(f"API returned HTTP {resp.status_code}: {resp.text[:150]}")
    try:
        data = resp.json()
    except ValueError:
        raise ValueError("API response is not valid JSON")

    if cfg.get("json_path"):
        data = _dig(data, cfg["json_path"])
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("Expected a JSON array (or use json_path to point to one)")
    if len(data) == 0:
        raise ValueError("API returned an empty result")

    df = pd.json_normalize(data, sep="_")
    db_path = db_path or new_db_path()
    table = table or "api_data"

    con = duckdb.connect(db_path)
    try:
        con.register("df_api", df)
        con.execute(f'CREATE OR REPLACE TABLE "{table}" AS SELECT * FROM df_api')
        con.unregister("df_api")
        rows = con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        cols = len(con.execute(f'DESCRIBE "{table}"').fetchall())
    finally:
        con.close()

    return {"db_path": db_path, "table": table, "format": "restapi", "row_count": rows, "column_count": cols}
