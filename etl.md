# DataMind — ETL / ELT Design & Feasibility

**Status:** design note (no code yet)
**Context:** DataMind stack = FastAPI (Python 3.11) · async SQLAlchemy 2.0 · asyncpg · PostgreSQL 15 + pgvector · DuckDB (file ingestion) · Next.js 14 · in‑process asyncio poller (single instance, no `--workers`) · Docker Compose (dev/prod). **No Redis/Celery currently running.**

---

## 0. TL;DR verdict

Build **ELT‑lite**, not a general ETL/orchestration engine.

- **Extract** with the connectors you already have.
- **Load raw** into Postgres or DuckDB.
- **Transform with SQL inside the database** (ELT), falling back to Python (pandas/Polars/DuckDB) only when SQL can't express it.
- **Schedule** with the existing asyncio poller for light jobs; graduate to a real queue/orchestrator only when data volume or parallelism demands it.

This reuses ~70% of what's built (connectors, DuckDB, the Datasets feature, the poller) and avoids rebuilding Airflow.

---

## 1. ETL vs ELT — pick ELT

| | ETL (transform in Python mid‑flight) | **ELT (load raw, transform in‑DB with SQL)** |
|---|---|---|
| Where transforms run | App memory (pandas) | The database engine (Postgres/DuckDB/warehouse) |
| Memory pressure | High (whole dataset in RAM) | Low (engine streams + spills to disk) |
| Speed on medium/large data | Slow | Fast (columnar, vectorized) |
| Reuses DataMind SQL stack | Partly | Fully (you already run read‑only SQL) |
| Best for | Messy non‑relational cleaning, APIs, ML features | 90% of BI cleaning/joining/aggregating |

**Rule of thumb:** if a transform can be a `SELECT`, keep it in SQL. Drop to Python only for things SQL is bad at (fuzzy matching, regex‑heavy parsing, JSON explosion, ML enrichment, calling external APIs row‑by‑row).

---

## 2. How it maps onto what already exists

| ETL stage | Existing DataMind primitive | Gap to fill |
|---|---|---|
| **Extract** | `connectors/` (Postgres, MySQL, SQLite, DuckDB, file, REST), Fernet‑encrypted creds | incremental/watermark reads |
| **Stage / Load raw** | `services/ingest.py` (DuckDB), file uploads under `/data/uploads` | write to a managed "raw" schema/table |
| **Transform** | read‑only SQL execution path; `sqlglot`, `sqlparse` deps | a place to store + run transform SQL on a schedule |
| **Store clean** | Datasets feature (virtual views) | **materialize** = persist the result as a table |
| **Orchestrate** | in‑process asyncio poller (`_alert_loop`) runs alerts/reports every 30s | a `Job` entity + run history + retries |
| **Reverse‑load (out)** | connector pattern | destination adapters (Slack/Sheets/S3/webhook) |

---

## 3. Compute — where the work runs and how to size it

### 3.1 Three execution places (choose per job)
1. **In‑database (push‑down)** — run `CREATE TABLE clean AS SELECT … FROM raw …` directly in Postgres/DuckDB/warehouse. **Default. Cheapest, lowest memory, scales best.**
2. **In‑process (the backend container)** — pull rows into pandas/Polars/DuckDB, clean, write back. Use only for medium data + Python‑only logic.
3. **Off‑box worker** — a separate process/container/Batch job for heavy or long jobs so it never blocks the API or the poller.

### 3.2 The single‑instance constraint (important)
The asyncio poller runs **in the API process** and prod runs **one** uvicorn process (no `--workers`, because the poller must be a singleton). Consequences:
- A long/CPU‑heavy transform **inside** the poller will block alerts/reports and slow the API.
- Fine for: small jobs, serial execution, off‑peak schedules.
- Not fine for: many concurrent jobs, multi‑GB transforms, anything > a few seconds of CPU.

**Mitigations (in order of effort):**
- Run transforms **in DuckDB/Postgres** (releases the GIL, work happens in the engine, not Python).
- `run_in_threadpool(...)` for blocking calls (already used for queries) so the event loop keeps serving.
- A **separate worker container** (same image, different entrypoint) that pulls jobs from a table — turns the single API box into API + worker.
- A real queue (**Celery+Redis**) or external orchestrator when you outgrow the above.

### 3.3 Sizing guidance
| Data size per job | Recommended compute |
|---|---|
| < ~1 GB | In‑process Polars/DuckDB or in‑DB SQL on the existing box |
| ~1–50 GB | DuckDB out‑of‑core (spills to disk) on a bigger box, or push to warehouse |
| > 50 GB / continuous | Warehouse push‑down (Snowflake/BigQuery/Redshift) or Spark (AWS Glue/EMR) |

---

## 4. Memory — how to not OOM

The #1 failure mode of naive ETL is loading a whole table into RAM. Avoid it:

### 4.1 Techniques
- **Never** `pd.read_sql("SELECT * FROM big")`. Stream instead.
- **DuckDB** is the workhorse: columnar, vectorized, **out‑of‑core** (spills to disk when RAM runs out).
  ```sql
  SET memory_limit = '4GB';
  SET temp_directory = '/data/duckdb_spill';   -- spill target
  SET threads = 4;
  CREATE TABLE clean AS SELECT … FROM read_parquet('/data/raw/*.parquet') WHERE …;
  ```
- **Polars** for Python‑side work: lazy + streaming, ~5–10× less memory than pandas.
  ```python
  import polars as pl
  (pl.scan_csv("raw.csv")               # lazy — nothing loaded yet
     .filter(pl.col("amount") > 0)
     .with_columns(pl.col("email").str.to_lowercase())
     .sink_parquet("clean.parquet"))    # streamed to disk, never fully in RAM
  ```
- **pandas with `chunksize`** if you must use pandas: process N rows at a time, append out.
- **Arrow/Parquet** as the on‑disk interchange format (columnar, compressed, zero‑copy).
- **Row/byte caps** per job (you already cap query rows) + a "this job exceeded N rows, switch to push‑down" guard.

### 4.2 Docker / container memory
- Dev (Docker Desktop on Windows/WSL2): cap WSL memory in `C:\Users\<you>\.wslconfig`:
  ```ini
  [wsl2]
  memory=8GB
  processors=4
  swap=8GB
  ```
- Prod compose: set limits so a runaway job can't kill the host:
  ```yaml
  backend:
    deploy:
      resources:
        limits: { memory: 4G, cpus: "2" }
  ```
- Give DuckDB a `temp_directory` on a real volume so spill doesn't fill the container's overlay FS.

---

## 5. Running locally on a PC

Everything ETL can run on the developer/host machine with **zero extra infrastructure**, because DuckDB is in‑process and Postgres is already in the compose stack.

- **Transform engine:** DuckDB inside the backend container (already a dependency) — no server, no cluster.
- **Raw/clean storage:** Postgres (the app DB) for relational clean tables; DuckDB files + Parquet under `/data` for file‑style data (mirrors how uploads already work).
- **Scheduling:** the existing asyncio poller fires jobs; for ad‑hoc runs, a "Run now" button hitting an endpoint.
- **Good for:** development, demos, and **genuinely production‑grade small/medium workloads** (a single box with DuckDB handles tens of GB).
- **Practical local recipe:**
  1. Extract → write Parquet to `/data/raw/<source>/`.
  2. DuckDB transforms Parquet → clean table (Postgres) or clean Parquet (`/data/clean/`).
  3. Register the clean table as a **Dataset/source** so charts + AI can use it.
- **Limits of local:** bounded by one machine's RAM/CPU/disk; no HA; the box must be on for scheduled jobs. Fine until you need always‑on or big data.

---

## 6. Cloud (AWS) — if you want managed/cloud compute

Three tiers depending on scale. Start at Tier 1; only climb when you must.

### 6.1 Tier 1 — "same app, just hosted" (cheapest, recommended start)
Keep the monolith; offload storage and cron to managed services.

| Need | AWS service |
|---|---|
| Run the app (API + poller) | **ECS Fargate** (1 task) or a small **EC2** |
| App + clean relational data | **RDS for PostgreSQL** (replaces local Postgres) |
| Raw + clean file data (Parquet) | **S3** (cheap, durable, the data lake) |
| Query files in S3 without a server | **Athena** (serverless SQL) or DuckDB reading `s3://` |
| Scheduled triggers | **EventBridge Scheduler** (cron) → hits a job endpoint |
| Secrets (DB creds, API keys) | **Secrets Manager** (replaces local Fernet at rest) |
| Container images | **ECR** |
| Logs / metrics / alarms | **CloudWatch** |

DuckDB can read/write S3 directly (`httpfs` extension), so "load to data lake" is just `COPY clean TO 's3://bucket/clean/' (FORMAT PARQUET)`.

### 6.2 Tier 2 — "offload the heavy jobs" (when transforms get big/long)
Keep Tier 1, but don't run heavy transforms inside the API task.

| Need | AWS service |
|---|---|
| Heavy/long batch transform (containerized) | **AWS Batch** (Fargate or EC2) — submit a job, it runs your image with more CPU/RAM, then exits |
| Short transforms (< 15 min, ≤ 10 GB RAM) | **Lambda** (container image with DuckDB/Polars) |
| Chaining steps with retries/branching | **Step Functions** (state machine = your DAG) |
| Event‑driven triggers (file lands in S3) | **S3 Event Notifications** → Lambda/Batch |

Pattern: EventBridge cron → Step Functions → (Batch job extracts to S3) → (Batch/Lambda transforms) → (load to RDS/Redshift) → notify.

### 6.3 Tier 3 — "real data platform" (big data / many pipelines)
| Need | AWS service |
|---|---|
| Managed Airflow (complex DAGs) | **MWAA** (or Prefect Cloud / Dagster Cloud) |
| Spark for huge transforms | **AWS Glue** (serverless Spark) or **EMR** |
| Cloud warehouse (push‑down ELT) | **Redshift** (or Snowflake/BigQuery via connector) |
| Streaming/CDC ingestion | **Kinesis** / **MSK (Kafka)** / **DMS** |
| Catalog / schema registry | **Glue Data Catalog** |

### 6.4 Cost/complexity ladder
```
Local DuckDB  <  ECS+RDS+S3 (Tier1)  <  +Batch/Lambda/StepFns (Tier2)  <  MWAA/Glue/Redshift (Tier3)
   $0 extra          $ low                    $ medium                        $$ high
```
**Don't skip to Tier 3.** Most BI‑grade ELT lives comfortably in Tier 1–2.

---

## 7. Storing the cleaned data

### 7.1 Where
| Target | When to use |
|---|---|
| **Postgres table** (app DB / RDS), schema e.g. `clean.*` or `mart.*` | Relational, queried by charts/AI/dashboards constantly. Default. |
| **DuckDB file** under `/data` | File‑style datasets, single‑user analytics, mirrors current uploads |
| **Parquet on disk / S3** | Large, append‑heavy, or feeding a warehouse/lake; cheap + columnar |
| **Cloud warehouse** | Org‑scale analytics, heavy concurrency |

### 7.2 Load modes (must support)
- **Replace** (full refresh): `CREATE OR REPLACE TABLE clean AS SELECT …`. Simple, fine for small tables.
- **Append**: `INSERT INTO clean SELECT … WHERE loaded_at > :watermark`. Needs a watermark column.
- **Upsert / merge** (on a key): de‑dupe + update changed rows.
  ```sql
  INSERT INTO clean
  SELECT * FROM staging
  ON CONFLICT (id) DO UPDATE SET …;   -- Postgres
  ```
- **SCD type 2** (history): keep `valid_from/valid_to` — only if you need point‑in‑time.

### 7.3 Hygiene
- Separate **raw** (as‑extracted) from **clean/mart** (curated) schemas — never overwrite raw.
- Add bookkeeping columns: `_loaded_at`, `_source`, `_batch_id`, `_row_hash` (for change detection).
- **Partition** big tables/Parquet by date (`/clean/orders/dt=2026-06-21/…`) for cheap pruning.
- Register the clean table as a **Dataset/source** so the rest of DataMind (charts, AI, dashboards) uses it immediately — this is the payoff of the existing Datasets feature.

---

## 8. Python frameworks for cleaning data

Ordered by how they'd fit DataMind:

| Tool | Role | Why / notes |
|---|---|---|
| **DuckDB** | SQL transform engine | Already in stack. Columnar, out‑of‑core, reads CSV/Parquet/JSON/`s3://`. Do most cleaning here in SQL. |
| **Polars** | Python DataFrame | Lazy + streaming, low memory, fast. Prefer over pandas for new ETL code. |
| **pandas** | Python DataFrame | Already a dependency; ubiquitous. Use `chunksize`; fine for small data. |
| **PyArrow** | Columnar I/O | Parquet read/write, Arrow interchange, zero‑copy to DuckDB/Polars. |
| **pandera** | Validation (lightweight) | Schema + value checks as code; integrates with pandas/Polars. Ties into PRD §22 data‑quality. |
| **Great Expectations** | Validation (heavyweight) | Rich expectations + data docs; use if you want a full quality suite. |
| **dlt (data load tool)** | EL framework | Lightweight Python EL: source → normalized tables with schema evolution + incremental loads. Great fit for "extract+load" without Spark. |
| **SQLGlot** | SQL parsing/transpile | Already a dep — validate/transpile transform SQL across dialects. |
| **Ibis** | DataFrame‑over‑SQL | Write Python, execute on DuckDB/Postgres/warehouse — bridges ELT and Python. |
| **Prefect / Dagster** | Orchestration | When the asyncio poller isn't enough: retries, DAGs, backfills, UI. Dagster is asset‑oriented (fits "materialized datasets"). |

### 8.1 Typical cleaning operations (and where to do them)
| Operation | Do it in |
|---|---|
| Filter rows, dedupe, joins, group/aggregate, type casts | **SQL (DuckDB/Postgres)** |
| Trim/case/normalize strings, null handling | SQL `TRIM/LOWER/COALESCE`, or Polars `str.*` |
| Regex extraction, fuzzy/dedupe matching | **Python** (Polars/pandas + `rapidfuzz`) |
| JSON flatten / explode nested | DuckDB `UNNEST`/`json_*`, or `pandas.json_normalize` |
| Date parsing / timezone normalize | SQL `CAST`/`strptime`, or Polars `str.to_datetime` |
| Validation / quality gates | **pandera / Great Expectations** before load |
| External enrichment (geocode, API lookup) | Python, rate‑limited, cached |

### 8.2 Minimal cleaning sketch (Polars + DuckDB, streaming)
```python
import polars as pl, duckdb

# Extract → stage as Parquet (streamed, low memory)
(pl.scan_database(query="SELECT * FROM orders WHERE updated_at > :wm", connection=src)
   .sink_parquet("/data/raw/orders.parquet"))

# Transform + load with DuckDB SQL (out-of-core, spills to disk)
con = duckdb.connect("/data/warehouse.duckdb")
con.execute("SET memory_limit='4GB'; SET temp_directory='/data/spill';")
con.execute("""
  CREATE OR REPLACE TABLE clean_orders AS
  SELECT DISTINCT
         CAST(id AS BIGINT)                AS order_id,
         LOWER(TRIM(email))                AS email,
         COALESCE(amount, 0)               AS amount,
         strptime(created, '%Y-%m-%d')     AS created_at,
         now()                             AS _loaded_at
  FROM read_parquet('/data/raw/orders.parquet')
  WHERE amount IS NOT NULL;
""")
```

---

## 9. Concrete build plan for DataMind (vertical slices)

1. **Materialized datasets** — add "Materialize" to the existing Dataset: run its SQL on a schedule, write the result to a `mart.<name>` Postgres table (or DuckDB), expose it as a source. *Smallest real ETL; reuses Datasets + poller.*
2. **ETL Job entity** — `Job(source, sql/steps, destination, mode, schedule, status)` + **run history** (rows in/out, duration, error) + "Run now". Mirrors the alerts/reports model. Add a dedicated worker entrypoint so jobs don't block the API.
3. **Transform steps UI** — Power Query–style steps compiled to SQL (filter/rename/cast/join/aggregate), live preview per step, "generate SQL".
4. **Quality gates** — pandera/GE checks that can fail a job (null %, uniqueness, ranges) → ties into PRD §22.
5. **Reverse ETL** — destination adapters (S3/Parquet, Sheets, Slack, webhook).
6. **Scale‑out** — only when needed: move scheduling to Celery+Redis or Prefect/Dagster; offload heavy jobs to AWS Batch; push huge transforms to a warehouse.

---

## 10. Risks & honest constraints

- **Don't grow the poller into Airflow.** It's a singleton in the API process; heavy/parallel work needs a worker pool, queue, or orchestrator.
- **The hard 20% is incremental loads, watermarks, idempotency, dedup, and schema drift** — not the happy path. Design these in from job #2.
- **Memory discipline is mandatory** — default to in‑DB/streaming; treat "pull whole table into pandas" as a bug.
- **Scope creep:** full ETL (Fivetran/Airbyte‑class) competes with the BI core. Keep it "good enough to feed dashboards."
- **Security:** ETL touches more sources and writes new tables — keep read‑only on extract where possible, encrypt creds (Secrets Manager in cloud), and guard write destinations with RBAC.

---

## 11. One‑line recommendation

Ship **ELT‑lite = materialized datasets + scheduled SQL jobs**, transform in **DuckDB/Postgres**, clean Python bits with **Polars + pandera**, store curated data in **Postgres (`mart.*`) and/or S3 Parquet**, run **locally on DuckDB** to start and lift to **AWS ECS + RDS + S3 (+ Batch/Step Functions)** when you need always‑on or scale. Reach for **Celery/Redis or Prefect/Dagster + Glue/Redshift** only when volume forces it.

---

## 12. Worked example — create a clean table, step by step

Goal: turn the messy uploaded source `india_cities_latlng` (one row per city, with the
typo column `log` for longitude, mixed types, possible dupes) into a curated table
`mart.cities_clean` that charts/AI can trust.

```
 ┌─────────┐   ┌─────────┐   ┌──────────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────┐
 │ EXTRACT │ → │  STAGE  │ → │  TRANSFORM   │ → │ VALIDATE │ → │     LOAD     │ → │ REGISTER │
 │ source  │   │ raw/    │   │ clean in SQL │   │ pandera  │   │ mart.cities  │   │ as source│
 └─────────┘   └─────────┘   └──────────────┘   └──────────┘   └──────────────┘   └──────────┘
```

### Step 0 — Decide the contract (before any code)
- **Target:** `mart.cities_clean (city TEXT, lat DOUBLE, lng DOUBLE, country TEXT, population BIGINT, _loaded_at TIMESTAMP)`
- **Grain:** one row per `(city, country)`.
- **Load mode:** `replace` (small table, full refresh). Upsert later if it grows.
- **Quality rules:** `lat ∈ [-90,90]`, `lng ∈ [-180,180]`, `city` not null, `(city,country)` unique.

### Step 1 — Extract (read from the source)
Pull the raw rows from the connected source. In DuckDB (the source is already a `.duckdb` file):
```sql
-- stage to Parquet so re-runs are cheap and memory stays low
COPY (SELECT * FROM india_cities_latlng)
  TO '/data/raw/cities.parquet' (FORMAT PARQUET);
```
For a remote DB source instead, stream it out with Polars:
```python
import polars as pl
pl.read_database(query="SELECT * FROM india_cities_latlng", connection=conn) \
  .write_parquet("/data/raw/cities.parquet")
```

### Step 2 — Transform + create the clean table (SQL in DuckDB)
This is the actual **CREATE TABLE** — clean + rename `log → lng`, cast types, drop bad/dupe rows:
```sql
SET memory_limit='2GB'; SET temp_directory='/data/spill';

CREATE OR REPLACE TABLE cities_clean AS
SELECT
    TRIM(city)                              AS city,
    CAST(lat AS DOUBLE)                     AS lat,
    CAST(log AS DOUBLE)                     AS lng,      -- fix the typo column here
    TRIM(country)                           AS country,
    TRY_CAST(population AS BIGINT)          AS population,
    now()                                   AS _loaded_at
FROM read_parquet('/data/raw/cities.parquet')
WHERE city IS NOT NULL
  AND TRY_CAST(lat AS DOUBLE) BETWEEN -90  AND 90
  AND TRY_CAST(log AS DOUBLE) BETWEEN -180 AND 180
QUALIFY row_number() OVER (PARTITION BY city, country ORDER BY population DESC) = 1;  -- de-dupe
```

### Step 3 — Validate (fail the job if data is bad)
```python
import duckdb, pandera as pa
from pandera import Column, Check

df = duckdb.sql("SELECT * FROM cities_clean").df()
schema = pa.DataFrameSchema({
    "city": Column(str, nullable=False),
    "lat":  Column(float, Check.in_range(-90, 90)),
    "lng":  Column(float, Check.in_range(-180, 180)),
}, unique=["city", "country"])
schema.validate(df)          # raises -> job aborts, mart.* is NOT overwritten
```

### Step 4 — Load into the curated store
**Option A — Postgres `mart.*`** (recommended; charts/AI/dashboards read it constantly):
```sql
CREATE SCHEMA IF NOT EXISTS mart;
-- DuckDB can write straight to Postgres via the postgres extension:
INSTALL postgres; LOAD postgres;
ATTACH 'host=postgres dbname=datamind user=... password=...' AS pg (TYPE postgres);
CREATE OR REPLACE TABLE pg.mart.cities_clean AS SELECT * FROM cities_clean;
```
**Option B — keep it as a DuckDB/Parquet table** (file‑style dataset / data lake):
```sql
COPY cities_clean TO '/data/clean/cities_clean.parquet' (FORMAT PARQUET);
-- or for S3:  COPY cities_clean TO 's3://bucket/clean/cities/' (FORMAT PARQUET);
```

### Step 5 — Register it back into DataMind
- **If loaded to Postgres:** point a Dataset/source at `mart.cities_clean` → it instantly shows up for charts, the Tile Bubble Map (`lat`/`lng` now correct), and AI.
- **If kept as a DuckDB/Parquet file:** add it as a new file source (same path the uploads use).

### Step 6 — Schedule it (turn the one‑off into a pipeline)
Wire steps 1–5 into a function and let the existing in‑process poller call it on an interval
(the same mechanism that runs alerts/reports), or trigger "Run now" from an endpoint:
```python
async def run_cities_etl():
    extract_to_parquet()      # step 1
    transform_clean()         # step 2  (CREATE OR REPLACE TABLE …)
    validate_or_raise()       # step 3
    load_to_mart()            # step 4
    # poller calls this every N min; failures are logged, mart.* stays on last-good
```

### Step 7 — Verify
```sql
SELECT count(*) AS rows,
       count(*) FILTER (WHERE lng IS NULL) AS bad_lng,
       min(lat), max(lat), min(lng), max(lng)
FROM mart.cities_clean;        -- expect 0 bad_lng, lat/lng in range
```

### Recap of the moving parts
| Step | Tool | Output |
|---|---|---|
| 1 Extract | connector / DuckDB `COPY` / Polars | `/data/raw/cities.parquet` |
| 2 Transform + create table | **DuckDB SQL `CREATE OR REPLACE TABLE`** | `cities_clean` (in‑engine) |
| 3 Validate | pandera | pass/fail gate |
| 4 Load | DuckDB→Postgres `ATTACH`, or `COPY` to Parquet/S3 | `mart.cities_clean` |
| 5 Register | DataMind Dataset/source | usable in charts/AI |
| 6 Schedule | asyncio poller / Run‑now endpoint | repeatable pipeline |
| 7 Verify | SQL counts | quality confirmation |

> Idempotency note: Steps 2 and 4 use `CREATE OR REPLACE` (full refresh) so re‑runs are safe.
> For incremental loads, add a watermark (`WHERE updated_at > :last_run`) + `INSERT … ON CONFLICT (key) DO UPDATE` instead of replace.
