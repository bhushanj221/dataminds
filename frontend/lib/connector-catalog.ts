// Connector catalog — field definitions drive the dynamic connection form.
// `target: "options"` fields are sent in the options{} dict; everything else
// maps to the core payload (host, port, database, username, password).

export interface Field {
  key: string
  label: string
  inputType?: "text" | "password" | "textarea"
  placeholder?: string
  required?: boolean
  isOption?: boolean
  defaultValue?: string
  hint?: string
}

export interface Connector {
  type: string
  label: string
  color: string
  category: string
  available: boolean
  note: string
  fields: Field[]
}

const f = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, ...extra })

// Standard host/port/db/user/pass set used by most SQL databases
function standard(defaultPort: number, dbLabel = "Database name", dbPlaceholder = "production"): Field[] {
  return [
    f("host", "Host", { placeholder: "db.example.com", required: true }),
    f("port", "Port", { defaultValue: String(defaultPort), required: true }),
    f("database", dbLabel, { placeholder: dbPlaceholder, required: true }),
    f("username", "Username", { required: true }),
    f("password", "Password", { inputType: "password" }),
  ]
}

export const CATALOG: Connector[] = [
  // ── Relational (open source) ────────────────────────────────
  { type: "postgresql", label: "PostgreSQL", color: "#336791", category: "Relational", available: true,
    note: "The world's most loved open-source DB", fields: standard(5432) },
  { type: "mysql", label: "MySQL", color: "#00758F", category: "Relational", available: true,
    note: "Classic open-source relational DB", fields: standard(3306) },
  { type: "mariadb", label: "MariaDB", color: "#003545", category: "Relational", available: true,
    note: "MySQL-compatible community fork", fields: standard(3306) },
  { type: "sqlite", label: "SQLite", color: "#003B57", category: "Relational", available: true,
    note: "File-based, zero config",
    fields: [f("database", "Database file path", { placeholder: "/data/mydb.sqlite", required: true })] },
  { type: "cockroachdb", label: "CockroachDB", color: "#6933FF", category: "Relational", available: true,
    note: "Distributed SQL, postgres-compatible", fields: standard(26257) },
  { type: "yugabyte", label: "YugabyteDB", color: "#FF5F3B", category: "Relational", available: true,
    note: "Distributed SQL, postgres-compatible", fields: standard(5433) },
  { type: "mssql", label: "SQL Server", color: "#A91D22", category: "Relational", available: true,
    note: "Microsoft SQL Server 2016+", fields: standard(1433) },
  { type: "oracle", label: "Oracle", color: "#C74634", category: "Relational", available: true,
    note: "Oracle 12c+ (thin mode, no client needed)",
    fields: standard(1521, "Service name", "ORCLPDB1") },
  { type: "tidb", label: "TiDB", color: "#DC150B", category: "Relational", available: true,
    note: "Distributed SQL, mysql-compatible", fields: standard(4000) },
  { type: "singlestore", label: "SingleStore", color: "#AA00FF", category: "Relational", available: true,
    note: "Formerly MemSQL, mysql-compatible", fields: standard(3306) },

  // ── Cloud Warehouses ────────────────────────────────────────
  { type: "snowflake", label: "Snowflake", color: "#29B5E8", category: "Cloud Warehouses", available: true,
    note: "Cloud data warehouse",
    fields: [
      f("account", "Account identifier", { isOption: true, placeholder: "xy12345.us-east-1", required: true,
        hint: "From your Snowflake URL: <account>.snowflakecomputing.com" }),
      f("database", "Database", { required: true }),
      f("username", "Username", { required: true }),
      f("password", "Password", { inputType: "password", required: true }),
      f("warehouse", "Warehouse", { isOption: true, placeholder: "COMPUTE_WH" }),
      f("role", "Role", { isOption: true, placeholder: "ANALYST" }),
      f("schema", "Schema", { isOption: true, placeholder: "PUBLIC" }),
    ] },
  { type: "bigquery", label: "BigQuery", color: "#4285F4", category: "Cloud Warehouses", available: true,
    note: "Google's serverless warehouse",
    fields: [
      f("database", "GCP Project ID", { placeholder: "my-project-123", required: true }),
      f("dataset", "Dataset (optional)", { isOption: true, placeholder: "analytics" }),
      f("keyfile_json", "Service account key (JSON)", { isOption: true, inputType: "textarea", required: true,
        placeholder: '{"type": "service_account", "project_id": ...}',
        hint: "IAM → Service Accounts → Keys → Create new key (JSON)" }),
    ] },
  { type: "redshift", label: "Amazon Redshift", color: "#8C4FFF", category: "Cloud Warehouses", available: true,
    note: "AWS warehouse, postgres-compatible",
    fields: standard(5439, "Database name", "dev") },
  { type: "databricks", label: "Databricks", color: "#FF3621", category: "Cloud Warehouses", available: true,
    note: "Lakehouse SQL warehouse",
    fields: [
      f("host", "Server hostname", { placeholder: "dbc-xxxx.cloud.databricks.com", required: true }),
      f("http_path", "HTTP path", { isOption: true, placeholder: "/sql/1.0/warehouses/abc123", required: true,
        hint: "SQL Warehouse → Connection details" }),
      f("password", "Access token", { inputType: "password", required: true }),
      f("database", "Catalog", { placeholder: "main", required: true }),
      f("schema", "Schema", { isOption: true, placeholder: "default" }),
    ] },
  { type: "athena", label: "AWS Athena", color: "#FF9900", category: "Cloud Warehouses", available: true,
    note: "Query S3 with SQL",
    fields: [
      f("region", "AWS Region", { isOption: true, placeholder: "us-east-1", required: true }),
      f("database", "Schema / database", { placeholder: "default", required: true }),
      f("username", "Access key ID", { required: true }),
      f("password", "Secret access key", { inputType: "password", required: true }),
      f("s3_staging_dir", "S3 staging directory", { isOption: true, required: true,
        placeholder: "s3://my-bucket/athena-results/" }),
    ] },
  { type: "clickhouse", label: "ClickHouse", color: "#FFCC01", category: "Cloud Warehouses", available: true,
    note: "Blazing-fast OLAP (cloud + self-hosted)", fields: standard(8123) },
  { type: "trino", label: "Trino", color: "#DD00A1", category: "Cloud Warehouses", available: true,
    note: "Federated queries across sources",
    fields: standard(8080, "Catalog", "hive") },
  { type: "starburst", label: "Starburst", color: "#1E76FF", category: "Cloud Warehouses", available: true,
    note: "Enterprise Trino", fields: standard(8080, "Catalog", "hive") },
  { type: "presto", label: "Presto", color: "#5890FF", category: "Cloud Warehouses", available: true,
    note: "Original federated SQL engine", fields: standard(8080, "Catalog", "hive") },
  { type: "starrocks", label: "StarRocks", color: "#0AB4C4", category: "Cloud Warehouses", available: true,
    note: "MPP OLAP, mysql-compatible", fields: standard(9030) },
  { type: "doris", label: "Apache Doris", color: "#38B2AC", category: "Cloud Warehouses", available: true,
    note: "Real-time warehouse, mysql-compatible", fields: standard(9030) },

  // ── Embedded ────────────────────────────────────────────────
  { type: "duckdb", label: "DuckDB", color: "#FFF000", category: "Embedded", available: true,
    note: "In-process OLAP — also queries CSV/Parquet files",
    fields: [f("database", "Database file path", { placeholder: "/data/analytics.duckdb", required: true,
      hint: "Can also query CSV/Parquet/JSON files via SQL" })] },

  // ── Serverless Postgres/MySQL providers ─────────────────────
  { type: "neon", label: "Neon", color: "#00E599", category: "Serverless Providers", available: true,
    note: "Serverless Postgres", fields: standard(5432) },
  { type: "supabase", label: "Supabase", color: "#3ECF8E", category: "Serverless Providers", available: true,
    note: "Postgres + instant APIs", fields: standard(5432, "Database name", "postgres") },
  { type: "planetscale", label: "PlanetScale", color: "#000000", category: "Serverless Providers", available: true,
    note: "Serverless MySQL with branching", fields: standard(3306) },
  { type: "timescaledb", label: "TimescaleDB", color: "#FDB515", category: "Serverless Providers", available: true,
    note: "Time-series Postgres", fields: standard(5432) },

  // ── Streaming SQL ───────────────────────────────────────────
  { type: "materialize", label: "Materialize", color: "#7F4EFF", category: "Streaming SQL", available: true,
    note: "Streaming SQL views, pg-compatible", fields: standard(6875, "Database name", "materialize") },
  { type: "risingwave", label: "RisingWave", color: "#005EEC", category: "Streaming SQL", available: true,
    note: "Streaming database, pg-compatible", fields: standard(4566, "Database name", "dev") },

  // ── Files & APIs (ingested → instantly queryable) ──────────
  { type: "file", label: "CSV / Excel Upload", color: "#059669", category: "Files & APIs", available: true,
    note: "CSV, TSV, Excel, JSON, Parquet — drag & drop", fields: [] },
  { type: "gsheets", label: "Google Sheets", color: "#0F9D58", category: "Files & APIs", available: true,
    note: "Paste a share link — anyone-with-link sheets", fields: [] },
  { type: "restapi", label: "REST API", color: "#7c3aed", category: "Files & APIs", available: true,
    note: "Any JSON API — bearer, API key or basic auth", fields: [] },

  // ── Coming soon ─────────────────────────────────────────────
  { type: "s3", label: "Amazon S3", color: "#FF9900", category: "Files & APIs", available: false,
    note: "Coming soon — bucket import", fields: [] },
  { type: "graphql", label: "GraphQL", color: "#E10098", category: "Files & APIs", available: false,
    note: "Coming soon", fields: [] },
  { type: "mongodb", label: "MongoDB", color: "#47A248", category: "NoSQL", available: false,
    note: "Coming soon — via SQL adapter", fields: [] },
  { type: "elasticsearch", label: "Elasticsearch", color: "#FEC514", category: "NoSQL", available: false,
    note: "Coming soon — ES SQL API", fields: [] },
  { type: "cassandra", label: "Cassandra", color: "#1287B1", category: "NoSQL", available: false,
    note: "Coming soon — via CQL", fields: [] },
  { type: "dynamodb", label: "DynamoDB", color: "#4053D6", category: "NoSQL", available: false,
    note: "Coming soon — via PartiQL", fields: [] },
  { type: "salesforce", label: "Salesforce", color: "#00A1E0", category: "SaaS", available: false,
    note: "Coming in Wave 5 — SOQL", fields: [] },
  { type: "hubspot", label: "HubSpot", color: "#FF7A59", category: "SaaS", available: false,
    note: "Coming in Wave 5", fields: [] },
  { type: "airtable", label: "Airtable", color: "#FCB400", category: "SaaS", available: false,
    note: "Coming in Wave 5", fields: [] },
  { type: "kafka", label: "Kafka (ksqlDB)", color: "#231F20", category: "Streaming SQL", available: false,
    note: "Coming in Wave 5", fields: [] },
]

export const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))]
