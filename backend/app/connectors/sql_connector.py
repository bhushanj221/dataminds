"""Generic SQLAlchemy connector.

One code path for every SQL-speaking database. Wire-protocol-compatible
databases are aliases of a base dialect (CockroachDB speaks postgres,
TiDB speaks mysql, Starburst speaks trino, ...). Cloud warehouses with
their own auth (Snowflake, BigQuery, Databricks, Athena) get dedicated
URL builders but share everything else.
"""
import json
import time
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy import create_engine, inspect, text

from app.connectors.base import BaseConnector

# Wire-protocol aliases: these databases ARE the base protocol on the wire.
ALIASES: dict[str, str] = {
    # postgres wire protocol
    "cockroachdb": "postgresql",
    "yugabyte": "postgresql",
    "redshift": "postgresql",
    "materialize": "postgresql",
    "risingwave": "postgresql",
    "timescaledb": "postgresql",
    "neon": "postgresql",
    "supabase": "postgresql",
    # mysql wire protocol
    "mariadb": "mysql",
    "tidb": "mysql",
    "starrocks": "mysql",
    "doris": "mysql",
    "planetscale": "mysql",
    "singlestore": "mysql",
    # trino wire protocol
    "presto": "trino",
    "starburst": "trino",
}

# base type -> (sqlalchemy dialect+driver, default port)
BASES: dict[str, tuple[str, int | None]] = {
    "postgresql": ("postgresql+psycopg2", 5432),
    "mysql": ("mysql+pymysql", 3306),
    "sqlite": ("sqlite", None),
    "duckdb": ("duckdb", None),
    "mssql": ("mssql+pymssql", 1433),
    "oracle": ("oracle+oracledb", 1521),
    "clickhouse": ("clickhousedb", 8123),
    "trino": ("trino", 8080),
    # specials below have custom builders, entries are markers
    "snowflake": ("snowflake", None),
    "bigquery": ("bigquery", None),
    "databricks": ("databricks", None),
    "athena": ("awsathena+rest", 443),
}

ALL_TYPES: set[str] = set(BASES) | set(ALIASES)

# pip package per base dialect — used for clear "driver missing" errors
DRIVER_PACKAGES = {
    "postgresql": "psycopg2-binary",
    "mysql": "pymysql",
    "duckdb": "duckdb-engine",
    "mssql": "pymssql",
    "oracle": "oracledb",
    "clickhouse": "clickhouse-connect",
    "trino": "trino",
    "snowflake": "snowflake-sqlalchemy",
    "bigquery": "sqlalchemy-bigquery",
    "databricks": "databricks-sqlalchemy",
    "athena": "PyAthena",
}


class SQLConnector(BaseConnector):
    def __init__(
        self,
        type: str,
        database: str,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        options: dict[str, str] | None = None,
    ):
        self.requested_type = type
        self.base = ALIASES.get(type, type)
        if self.base not in BASES:
            raise ValueError(f"Unsupported SQL type: {type}")
        self.options = options or {}
        self.engine_kwargs: dict[str, Any] = {}
        self.connect_args: dict[str, Any] = {}
        self.url = self._build_url(database, host, port, username, password)

    # ── URL building ───────────────────────────────────────────
    def _build_url(self, database, host, port, username, password) -> str:
        dialect, default_port = BASES[self.base]
        user = quote_plus(username or "")
        pwd = quote_plus(password or "")
        p = port or default_port
        opt = self.options

        if self.base in ("sqlite", "duckdb"):
            return f"{dialect}:///{database}"

        if self.base == "postgresql":
            self.connect_args = {"connect_timeout": 8}
            return f"{dialect}://{user}:{pwd}@{host}:{p}/{database}"

        if self.base == "mysql":
            self.connect_args = {"connect_timeout": 8}
            if self.requested_type == "planetscale":
                self.connect_args["ssl"] = {"ssl": True}
            return f"{dialect}://{user}:{pwd}@{host}:{p}/{database}"

        if self.base == "mssql":
            self.connect_args = {"login_timeout": 8}
            return f"{dialect}://{user}:{pwd}@{host}:{p}/{database}"

        if self.base == "oracle":
            # database field = service name (thin mode, no Oracle client needed)
            return f"{dialect}://{user}:{pwd}@{host}:{p}/?service_name={quote_plus(database)}"

        if self.base == "clickhouse":
            secure = "?secure=true" if opt.get("secure") == "true" else ""
            return f"{dialect}://{user}:{pwd}@{host}:{p}/{database}{secure}"

        if self.base == "trino":
            # database field = catalog. Password auth requires https.
            if password:
                self.connect_args = {"http_scheme": "https"}
                return f"trino://{user}:{pwd}@{host}:{p}/{database}"
            return f"trino://{user}@{host}:{p}/{database}"

        if self.base == "snowflake":
            account = opt.get("account", "")
            if not account:
                raise ValueError("Snowflake requires an 'account' (e.g. xy12345.us-east-1)")
            params = []
            for key in ("warehouse", "role", "schema"):
                if opt.get(key):
                    params.append(f"{key}={quote_plus(opt[key])}")
            qs = ("?" + "&".join(params)) if params else ""
            return f"snowflake://{user}:{pwd}@{quote_plus(account)}/{database}{qs}"

        if self.base == "bigquery":
            # database field = GCP project id
            keyfile = opt.get("keyfile_json", "")
            if not keyfile:
                raise ValueError("BigQuery requires a service-account key (keyfile_json)")
            try:
                self.engine_kwargs["credentials_info"] = json.loads(keyfile)
            except json.JSONDecodeError:
                raise ValueError("keyfile_json is not valid JSON")
            dataset = opt.get("dataset", "")
            return f"bigquery://{database}/{dataset}" if dataset else f"bigquery://{database}"

        if self.base == "databricks":
            # password field = personal access token, database field = catalog
            http_path = opt.get("http_path", "")
            if not http_path:
                raise ValueError("Databricks requires 'http_path' (from your SQL warehouse)")
            schema = opt.get("schema", "default")
            return (
                f"databricks://token:{pwd}@{host}?http_path={quote_plus(http_path)}"
                f"&catalog={quote_plus(database)}&schema={quote_plus(schema)}"
            )

        if self.base == "athena":
            # username = AWS access key id, password = secret key, database = schema
            region = opt.get("region", "")
            staging = opt.get("s3_staging_dir", "")
            if not region or not staging:
                raise ValueError("Athena requires 'region' and 's3_staging_dir' (S3 output location)")
            return (
                f"awsathena+rest://{user}:{pwd}@athena.{region}.amazonaws.com:443/"
                f"{database}?s3_staging_dir={quote_plus(staging)}"
            )

        raise ValueError(f"No URL builder for type: {self.base}")

    # ── Engine ─────────────────────────────────────────────────
    def _engine(self):
        kwargs: dict[str, Any] = {"pool_pre_ping": True, **self.engine_kwargs}
        if self.connect_args:
            kwargs["connect_args"] = self.connect_args
        try:
            return create_engine(self.url, **kwargs)
        except ModuleNotFoundError as e:
            pkg = DRIVER_PACKAGES.get(self.base, self.base)
            raise RuntimeError(
                f"Driver for {self.requested_type} is not installed on the server "
                f"(missing package: {pkg}). Original error: {e.name}"
            )

    # ── Interface ──────────────────────────────────────────────
    def test(self) -> float:
        engine = self._engine()
        try:
            start = time.perf_counter()
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return round((time.perf_counter() - start) * 1000, 1)
        finally:
            engine.dispose()

    def get_schema(self) -> list[dict[str, Any]]:
        engine = self._engine()
        try:
            insp = inspect(engine)
            tables: list[dict[str, Any]] = []
            schemas: list[str | None] = [None]
            if self.base == "postgresql":
                schemas = [s for s in insp.get_schema_names()
                           if s not in ("information_schema", "pg_catalog", "pg_toast", "crdb_internal")]
            for schema in schemas:
                for table_name in sorted(insp.get_table_names(schema=schema)):
                    try:
                        pk_cols = set(
                            insp.get_pk_constraint(table_name, schema=schema).get("constrained_columns") or []
                        )
                    except Exception:
                        pk_cols = set()  # some engines (Athena, ClickHouse) have no PK concept

                    # Foreign keys → relationships
                    try:
                        raw_fks = insp.get_foreign_keys(table_name, schema=schema)
                    except Exception:
                        raw_fks = []
                    fk_target: dict[str, str] = {}  # col -> "ref_table.ref_col"
                    relationships: list[dict[str, Any]] = []
                    for fk in raw_fks:
                        cons = fk.get("constrained_columns") or []
                        ref_table = fk.get("referred_table")
                        ref_cols = fk.get("referred_columns") or []
                        if not ref_table or not cons:
                            continue
                        relationships.append({
                            "columns": cons,
                            "ref_table": ref_table,
                            "ref_columns": ref_cols,
                            "ref_schema": fk.get("referred_schema"),
                        })
                        for i, c in enumerate(cons):
                            rc = ref_cols[i] if i < len(ref_cols) else (ref_cols[0] if ref_cols else "")
                            fk_target[c] = f"{ref_table}.{rc}" if rc else ref_table

                    columns = [
                        {
                            "name": col["name"],
                            "type": str(col["type"]),
                            "nullable": bool(col.get("nullable", True)),
                            "primary_key": col["name"] in pk_cols,
                            "references": fk_target.get(col["name"]),
                        }
                        for col in insp.get_columns(table_name, schema=schema)
                    ]
                    tables.append({
                        "name": table_name, "schema_name": schema,
                        "columns": columns, "foreign_keys": relationships,
                    })
            return tables
        finally:
            engine.dispose()

    def count_rows(self, table: str, schema: str | None = None) -> int:
        engine = self._engine()
        try:
            prep = engine.dialect.identifier_preparer
            qualified = prep.quote(table)
            if schema:
                qualified = f"{prep.quote(schema)}.{qualified}"
            with engine.connect() as conn:
                return int(conn.execute(text(f"SELECT COUNT(*) FROM {qualified}")).scalar() or 0)
        finally:
            engine.dispose()

    def execute(self, sql: str, limit: int = 1000) -> dict[str, Any]:
        engine = self._engine()
        try:
            start = time.perf_counter()
            with engine.connect() as conn:
                result = conn.execute(text(sql))
                columns = list(result.keys())
                rows = [list(row) for row in result.fetchmany(limit)]
            duration = round((time.perf_counter() - start) * 1000, 1)
            return {"columns": columns, "rows": rows, "row_count": len(rows), "duration_ms": duration}
        finally:
            engine.dispose()

    # Type fragments that indicate a string/categorical column
    _STR_TYPES = ("CHAR", "TEXT", "STRING", "ENUM", "CLOB", "NVARCHAR")

    def sample_values(self, tables: list[dict[str, Any]],
                      max_values: int = 15, row_scan: int = 100) -> dict[str, dict[str, list[str]]]:
        """For each table, sample DISTINCT values of low-cardinality string columns.
        One LIMIT query per table. Returns {table: {col: [values]}} — only keeps
        columns that look categorical (≤ max_values distinct in the scan).
        This is what stops the model writing WHERE status='completed' when the
        real values are 'COMPLETE'."""
        engine = self._engine()
        out: dict[str, dict[str, list[str]]] = {}
        try:
            prep = engine.dialect.identifier_preparer
            with engine.connect() as conn:
                for t in tables:
                    str_cols = [c["name"] for c in t["columns"]
                                if any(s in c["type"].upper() for s in self._STR_TYPES)]
                    if not str_cols:
                        continue
                    qualified = prep.quote(t["name"])
                    if t.get("schema_name"):
                        qualified = f'{prep.quote(t["schema_name"])}.{qualified}'
                    col_list = ", ".join(prep.quote(c) for c in str_cols)
                    try:
                        rows = conn.execute(text(f"SELECT {col_list} FROM {qualified} LIMIT {row_scan}")).fetchall()
                    except Exception:
                        continue
                    vals: dict[str, list[str]] = {c: [] for c in str_cols}
                    seen: dict[str, set] = {c: set() for c in str_cols}
                    for row in rows:
                        for i, c in enumerate(str_cols):
                            v = row[i]
                            if isinstance(v, str):
                                v = v.strip()
                                if v and v not in seen[c] and len(seen[c]) <= max_values:
                                    seen[c].add(v)
                                    vals[c].append(v)
                    # keep only categorical-looking columns (bounded distinct count)
                    kept = {c: vs for c, vs in vals.items() if 0 < len(vs) <= max_values}
                    if kept:
                        out[t["name"]] = kept
            return out
        finally:
            engine.dispose()
