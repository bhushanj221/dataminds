# DataMind — Full-Stack Data Intelligence Platform
## Complete Product Requirements Document

**Version:** 2.0  
**Date:** June 2026  
**Scope:** End-to-end data platform combining Grafana + Power BI + Apache Superset + WrenAI + dbt + Monte Carlo + Hightouch + Tableau + Metabase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Data Sources & Connectors](#3-data-sources--connectors)
4. [Dataset Management](#4-dataset-management)
5. [SQL Editor](#5-sql-editor)
6. [Semantic Layer](#6-semantic-layer)
7. [AI Chat & Text-to-SQL](#7-ai-chat--text-to-sql)
8. [Dashboard Builder](#8-dashboard-builder)
9. [Chart & Visualization Library](#9-chart--visualization-library)
10. [KPI Monitoring & Alerting](#10-kpi-monitoring--alerting)
11. [Reports](#11-reports)
12. [Data Lineage](#12-data-lineage)
13. [User Management & Access Control](#13-user-management--access-control)
14. [Collaboration & Sharing](#14-collaboration--sharing)
15. [Settings & Configuration](#15-settings--configuration)
16. [Security](#16-security)
17. [Performance & Caching](#17-performance--caching)
18. [API Layer](#18-api-layer)
19. [Tech Stack](#19-tech-stack)
20. [Build Phases](#20-build-phases)
21. [Data Discovery & Catalog](#21-data-discovery--catalog)
22. [Data Quality & Observability](#22-data-quality--observability)
23. [Transformation & Modeling](#23-transformation--modeling)
24. [Advanced AI Features](#24-advanced-ai-features)
25. [Reverse ETL & Data Activation](#25-reverse-etl--data-activation)
26. [Subscriptions & Self-Service Alerts](#26-subscriptions--self-service-alerts)
27. [Developer Tools & Integration](#27-developer-tools--integration)
28. [Platform Operations & Governance](#28-platform-operations--governance)
29. [UX, Accessibility & Internationalization](#29-ux-accessibility--internationalization)
30. [Advanced Analysis Types](#30-advanced-analysis-types)

---

## 1. Executive Summary

**DataMind** is a unified data intelligence platform that gives any team — technical or not — the ability to connect any data source, explore with SQL or natural language, build dashboards, monitor KPIs, generate reports, and understand data lineage. It is self-hosted, open-core, and designed for accuracy, speed, and ease of use.

### Core Pillars

| Pillar | Description |
|---|---|
| **Connect** | Any database, API, cloud service, file — one unified connection layer |
| **Explore** | SQL editor with autocomplete, AI chat with text-to-SQL, schema browser |
| **Understand** | Semantic layer that defines business meaning on top of raw data |
| **Visualize** | 40+ chart types, drag-and-drop dashboard builder, PowerBI-style layout |
| **Monitor** | KPI tracking, threshold alerts, anomaly detection, scheduled checks |
| **Share** | Reports, embeds, public links, scheduled email delivery |
| **Govern** | Row-level security, data lineage, audit logs, user management |
| **Discover** | Data catalog, global search, business glossary, asset ownership |
| **Observe** | Data quality checks, freshness SLAs, schema drift, anomaly detection |
| **Activate** | Reverse ETL — push results to CRMs, Slack, Google Sheets |
| **Develop** | CLI, Python SDK, Git integration, plugin system |

---

## 2. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  Dashboard │ SQL Editor │ AI Chat │ Lineage │ Admin │ Reports    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ Query    │ │ Semantic │ │   AI     │ │    Data Source     │  │
│  │ Engine   │ │  Layer   │ │ Pipeline │ │    Manager         │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │Dashboard │ │  Alert   │ │ Report   │ │    Lineage         │  │
│  │ Service  │ │ Engine   │ │ Engine   │ │    Tracker         │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │              │              │               │
    PostgreSQL       pgvector        Redis          Workers
    (app data)    (embeddings)     (cache)        (Celery)
         │
    User Databases (any type)
```

### Services Breakdown

| Service | Responsibility |
|---|---|
| **Query Engine** | Execute SQL against any connected source, result caching, query history |
| **Semantic Layer** | Business model definitions, metric fragments, glossary, relationship graph |
| **AI Pipeline** | Text-to-SQL flow: classify → link → generate → validate → self-correct |
| **Data Source Manager** | Connection pooling, health checks, schema sync, credential vault |
| **Dashboard Service** | Layout persistence, widget state, live refresh, snapshot |
| **Alert Engine** | Threshold checks, anomaly detection, notification dispatch |
| **Report Engine** | Scheduled generation, PDF/Excel export, email delivery |
| **Lineage Tracker** | Column-level lineage, impact analysis, dependency graph |

---

## 3. Data Sources & Connectors

### 3.1 Relational Databases

| Database | Versions | Auth Methods | SSL | SSH Tunnel |
|---|---|---|---|---|
| PostgreSQL | 10+ | Password, SSL cert, IAM | Yes | Yes |
| MySQL | 5.7, 8.x | Password, SSL cert | Yes | Yes |
| MariaDB | 10.3+ | Password | Yes | Yes |
| Microsoft SQL Server | 2016+ | SQL Auth, Windows Auth, Azure AD | Yes | Yes |
| Oracle Database | 12c+ | Password, Wallet, Kerberos | Yes | Yes |
| SQLite | 3.x | File path | N/A | N/A |
| CockroachDB | Any | Password, cert | Yes | Yes |
| TiDB | Any | Password | Yes | Yes |

### 3.2 Cloud Data Warehouses

| Warehouse | Auth | Notes |
|---|---|---|
| Google BigQuery | Service account, OAuth | Project + dataset selector |
| Amazon Redshift | Password, IAM, Redshift Serverless | Cluster/workgroup selector |
| Snowflake | Password, SSO, key pair | Warehouse + role selector |
| Azure Synapse Analytics | SQL Auth, Azure AD | Dedicated + serverless |
| Databricks SQL | PAT token, OAuth | Warehouse selector |
| AWS Athena | IAM, access key | S3 output location config |
| ClickHouse | Password, SSL | Cloud + self-hosted |
| Firebolt | Service account | Database + engine selector |
| Starburst / Trino | Password, OAuth | Catalog selector |

### 3.3 NoSQL Databases

| Database | Query Method | Notes |
|---|---|---|
| MongoDB | MQL → translated SQL | Collections as tables |
| Elasticsearch | ES DSL + SQL interface | Index as table |
| Apache Cassandra | CQL | Keyspace + table |
| Redis | Key pattern + hash fields | Via RedisInsight adapter |
| DynamoDB | PartiQL | Table scan + filter |
| Firebase Firestore | Collection query | Read-only |
| Couchbase | N1QL | Bucket as schema |

### 3.4 Analytical / OLAP Engines

| Engine | Notes |
|---|---|
| Apache Druid | Native SQL over HTTP |
| Apache Pinot | SQL endpoint |
| DuckDB | In-process, file or memory |
| MotherDuck | DuckDB cloud |
| StarRocks | MySQL-compatible |
| Doris (Apache) | MySQL-compatible |

### 3.5 Cloud Storage & Data Lakes

| Source | Format Support | Auth |
|---|---|---|
| Amazon S3 | CSV, Parquet, JSON, ORC, Avro | IAM, access key |
| Google Cloud Storage | CSV, Parquet, JSON | Service account, OAuth |
| Azure Blob Storage | CSV, Parquet, JSON | SAS token, Azure AD |
| Cloudflare R2 | CSV, Parquet, JSON | API token |
| MinIO (self-hosted) | CSV, Parquet, JSON | Access key |
| Azure Data Lake Gen2 | CSV, Parquet, Delta | Azure AD |
| AWS Glue Data Catalog | Any registered format | IAM |

### 3.6 Streaming & Real-Time Sources

| Source | Method | Notes |
|---|---|---|
| Apache Kafka | Consumer with time-window aggregation | Topic as table |
| AWS Kinesis | Kinesis Data Analytics SQL | Stream + window |
| Apache Pulsar | SQL over Pulsar | |
| Redpanda | Kafka-compatible | |
| Confluent Cloud | Kafka-compatible | |
| MQTT | Subscribe + buffer | IoT use cases |
| WebSocket feed | Custom adapter | Real-time push to dashboard |

### 3.7 REST APIs

| Feature | Detail |
|---|---|
| **HTTP methods** | GET, POST with body config |
| **Auth types** | API key (header/query), Bearer token, OAuth 2.0, Basic auth, Custom header |
| **Pagination** | Page number, cursor-based, offset-limit, Link header — auto-detected |
| **Response parsing** | JSON path selector, array extraction, nested flattening |
| **Scheduling** | Poll interval (1 min to daily) or webhook push |
| **Rate limiting** | Configurable delay between requests |
| **Chaining** | Use response field as parameter in next request |
| **Transform** | JMESPath expression for reshaping response |
| **GraphQL** | Query builder + variable injection |
| **OpenAPI import** | Import Swagger/OpenAPI spec → auto-generate endpoint configs |

#### API Connector Examples (Pre-built)
- Stripe (payments, subscriptions, customers)
- HubSpot (CRM, deals, contacts)
- Salesforce (objects via REST/SOAP)
- Google Analytics 4
- Mixpanel
- Amplitude
- Segment
- Intercom
- Zendesk
- Shopify
- WooCommerce
- QuickBooks
- Xero
- GitHub (repos, issues, PRs)
- Jira
- Linear
- Notion

### 3.8 File Upload & Datasets

| Format | Max Size | Options |
|---|---|---|
| CSV | 500 MB | Delimiter, encoding, header row, date formats, null values |
| Excel (.xlsx, .xls) | 100 MB | Sheet selector, header row, named range |
| Parquet | 2 GB | Schema auto-detection |
| JSON | 200 MB | Array root, nested flatten depth, column extraction |
| JSONL (newline-delimited) | 500 MB | Auto |
| XML | 100 MB | XPath root selector |
| Avro | 500 MB | Schema registry or embedded |
| ORC | 2 GB | Auto |
| TSV | 500 MB | Same as CSV |
| Google Sheets | Live link | OAuth, auto-refresh interval |
| Airtable | Live link | API key, base + table selector |
| Notion database | Live link | Integration token |

#### Upload Options
- Drag and drop
- URL import (direct download link)
- S3 / GCS path import
- Scheduled re-upload (replace or append)
- Schema inference with override
- Column type casting (string → date, string → number)
- Column rename on import
- Filter rows on import
- Join two uploaded files on upload
- Version history of uploaded files (keep last N versions)

### 3.9 Cloud Containers & Compute

| Source | Method |
|---|---|
| Docker container with DB | SSH + port forward |
| Kubernetes pod | kubectl port-forward proxy |
| AWS RDS | Direct + IAM auth |
| AWS Aurora | Cluster endpoint + reader endpoint |
| AWS Aurora Serverless | Data API (HTTP-based, no persistent connection) |
| Google Cloud SQL | Cloud SQL Auth Proxy |
| Azure Database for PostgreSQL/MySQL | Service endpoint + firewall rule |
| Heroku Postgres | Connection string from Heroku API |
| Railway / Render / Fly.io | Connection string |
| PlanetScale | MySQL-compatible + branching |
| Neon | PostgreSQL serverless + branching |
| Supabase | PostgreSQL + REST auto-API |
| Turso (LibSQL) | HTTP-based SQLite |

### 3.10 Connection Management Features

| Feature | Detail |
|---|---|
| **Connection test** | Test before save, show latency |
| **Health monitoring** | Ping every N minutes, alert on failure |
| **Connection pooling** | PgBouncer-style pooling per connection |
| **SSH tunneling** | Jump host config, key upload |
| **SSL/TLS** | Certificate upload, verify/skip options |
| **Credential vault** | AES-256 encrypted at rest, never exposed in UI |
| **Read replicas** | Separate read/write endpoints |
| **Schema sync** | Auto-detect schema changes, notify admin |
| **Connection tags** | Label connections (prod/staging/dev) |
| **Usage tracking** | Queries run, data scanned, last used |
| **Clone connection** | Duplicate with different credentials |

---

## 4. Dataset Management

### 4.1 Virtual Datasets (Views)

- Define a dataset as a SQL query over any connected source
- Name it, describe it, assign to workspace
- Dataset is reusable across dashboards, charts, AI chat
- Parameters supported: `{{ date_range }}`, `{{ user_id }}` — injected at query time
- Cached with configurable TTL
- Schedule background refresh

### 4.2 Physical Datasets (Materialized)

- Upload file → stored in internal DuckDB or PostgreSQL
- Re-upload: append / replace / merge on key
- Version history: rollback to any previous version
- Schedule: re-fetch from source on cron
- Row count, size, last updated shown in UI

### 4.3 Dataset Features

| Feature | Detail |
|---|---|
| **Schema editor** | Rename columns, change types, add descriptions |
| **Preview** | First 1000 rows with column stats |
| **Column profiling** | Min, max, mean, null %, distinct count, histogram per column |
| **Data quality checks** | Define rules (no nulls in ID, date always increasing) |
| **Row-level security** | Filter rows based on logged-in user's attributes |
| **Computed columns** | Define new columns with SQL expressions |
| **Metrics** | Define reusable metrics (SUM, COUNT, RATIO) on dataset |
| **Dimensions** | Tag columns as dimensions for drill-down |
| **Tags & categories** | Organize datasets in folders |
| **Certified badge** | Mark dataset as trusted/production |
| **Deprecation** | Mark as deprecated with migration note |
| **Duplicate** | Clone dataset |
| **Lineage** | See which dashboards/charts use this dataset |
| **Access log** | Who queried this dataset and when |

---

## 5. SQL Editor

### 5.1 Editor Features

| Feature | Detail |
|---|---|
| **Monaco-based editor** | VS Code quality editing experience |
| **Multi-tab** | Open multiple queries in tabs, persist across sessions |
| **Syntax highlighting** | SQL dialect-aware (PG, MySQL, MSSQL, BigQuery, Snowflake) |
| **Autocomplete** | Table names, column names, functions, keywords — context-aware |
| **Schema browser** | Sidebar: databases → schemas → tables → columns with types |
| **Column preview** | Hover over column name → see type + sample values |
| **Format SQL** | Auto-format / prettify SQL (keyboard shortcut) |
| **Keyboard shortcuts** | Run (Ctrl+Enter), Format (Ctrl+Shift+F), Comment (Ctrl+/), etc. |
| **Multi-cursor** | Standard Monaco multi-cursor editing |
| **Find & replace** | In-editor find and replace |
| **Line numbers** | Gutter with line numbers, clickable to select |
| **Fold/unfold** | Collapse CTEs, subqueries |

### 5.2 Execution Features

| Feature | Detail |
|---|---|
| **Run selected** | Highlight portion → run only that |
| **Run all** | Execute full editor content |
| **Cancel query** | Kill running query mid-execution |
| **Query timeout** | Configurable per connection and per user |
| **Row limit** | Default 10k rows, configurable up to 1M |
| **Execution plan** | EXPLAIN / EXPLAIN ANALYZE output with visual plan tree |
| **Query timer** | Show elapsed time live while running |
| **Estimated cost** | For BigQuery/Snowflake — show bytes scanned before running |
| **Parameterized queries** | `{{ param }}` syntax — UI renders input boxes |
| **Multiple result sets** | MSSQL/stored procedures returning multiple sets |

### 5.3 Results Panel

| Feature | Detail |
|---|---|
| **Grid view** | Sortable, resizable columns, frozen first column option |
| **Column stats** | Click column header → see min/max/null% inline |
| **Cell expand** | Long text cells expand on click |
| **JSON viewer** | JSONB/JSON columns render as expandable tree |
| **Copy** | Copy cell, row, column, or full result as CSV/JSON/TSV |
| **Export** | Download as CSV, Excel, JSON, Parquet |
| **Row count** | Total rows in result shown |
| **Pagination** | Client-side pagination for large results |
| **Search in results** | Filter visible rows in result grid |
| **Pin to chart** | One-click: result → chart → save to dashboard |
| **Save as dataset** | Materialize query result as a named dataset |

### 5.4 Query History & Management

| Feature | Detail |
|---|---|
| **History** | All past queries with timestamp, duration, row count, status |
| **Saved queries** | Star any query to save, organize in folders |
| **Shared queries** | Share saved query with team (view/edit permission) |
| **Version history** | Track edits to saved queries |
| **Snippets** | Save reusable SQL fragments (CTEs, common filters) |
| **Search history** | Full-text search across all past queries |
| **Replay** | Re-run any historical query exactly |
| **Schedule** | Run saved query on cron, store results, alert on change |

### 5.5 Advanced SQL Features

| Feature | Detail |
|---|---|
| **CTE builder** | Visual CTE chain builder (like dbt lineage for queries) |
| **Diff view** | Compare two versions of a saved query |
| **Linter** | Real-time SQL linting — flag potential issues (SELECT *, cartesian joins) |
| **AI assist** | Highlight SQL → right-click → "Explain this SQL" or "Optimize this" |
| **AI complete** | Tab-complete with AI suggestion (like GitHub Copilot for SQL) |
| **Cross-source join** | Join tables from two different connections via federation engine |

---

## 6. Semantic Layer

### 6.1 What the Semantic Layer Contains

```
Semantic Model
├── Tables (business models)
│     ├── Logical name + description
│     ├── Underlying SQL or physical table
│     └── Columns
│           ├── Name, type, description
│           ├── Sample values (auto-populated)
│           ├── Is metric / is dimension
│           ├── Hidden (exclude from AI context)
│           └── Synonyms ("revenue" = "sales" = "income")
│
├── Relationships
│     ├── Auto-detected from FK constraints
│     ├── Manual logical joins (no FK in DB)
│     ├── Join type: inner / left / many-to-one / many-to-many
│     └── Join condition (SQL expression)
│
├── Metrics (Verified SQL Fragments)
│     ├── Name + description
│     ├── SQL expression (tested before save)
│     ├── Aggregation type: SUM, COUNT, AVG, RATIO, CUSTOM
│     ├── Format: currency, percentage, number, duration
│     └── Dimension filters (only valid with certain dimensions)
│
├── Dimensions
│     ├── Column or expression
│     ├── Hierarchy (Country → Region → City)
│     └── Time dimension (special: auto-generates period comparisons)
│
├── Calculated Fields
│     ├── SQL expression over other columns
│     ├── Examples: profit_margin = revenue - cost / revenue
│     └── Re-usable across all charts and AI
│
├── Glossary
│     ├── Business term → SQL pattern mapping
│     ├── Examples: "YTD" → date filter, "churn" → SQL definition
│     └── Synonyms library
│
└── Row-Level Security Rules
      ├── Filter expression per role/user
      └── Applied automatically to all queries
```

### 6.2 Semantic Layer Bootstrap (Cold Start)

1. **Connect DB** → system reads INFORMATION_SCHEMA automatically
2. **Auto-detect FKs** → relationship graph built immediately
3. **Sample column values** → `SELECT DISTINCT col LIMIT 20` per column
4. **LLM auto-describes** → generates table + column descriptions from DDL + samples
5. **LLM infers metrics** → suggests common metrics from schema context
6. **LLM generates seed Q→SQL** → 20–30 synthetic pairs to bootstrap few-shot bank
7. **Human review UI** → review/edit descriptions, approve/reject inferred metrics
8. **Save → ready** → semantic layer active, accuracy ~68–74% immediately

### 6.3 Semantic Layer Management UI

| Screen | Features |
|---|---|
| **Model Explorer** | Tree view of all models, metrics, dimensions |
| **Model Editor** | Edit descriptions, add synonyms, hide columns |
| **Metric Studio** | Write + test SQL fragment, verify against live DB before saving |
| **Relationship Graph** | Visual ER diagram, add/edit/delete relationships |
| **Glossary Manager** | Add business terms, map to SQL patterns, test |
| **Quality Score** | Coverage % — how many tables/columns have descriptions |
| **Usage Analytics** | Which metrics/models are used most |
| **Version History** | Track every change to the semantic layer |
| **Export / Import** | Export as YAML, import to replicate across workspaces |

---

## 7. AI Chat & Text-to-SQL

### 7.1 Query Pipeline

```
Step 1 — CLASSIFY  (Haiku / GPT-4o-mini)
  Input:  user question
  Output: intent, entities, time range, complexity, ambiguity score

Step 2 — AMBIGUITY CHECK
  If ambiguity > threshold → ask ONE clarifying question before proceeding
  Example: "When you say 'revenue', do you mean gross or net?"

Step 3 — SCHEMA LINK  (no LLM — retrieval only)
  Vector search: find relevant tables by entity matching
  FK graph traversal: pull related tables
  Inject: column value samples + verified metric fragments

Step 4 — DECOMPOSE  (only for complex questions)
  Break into sub-questions → ordered execution plan

Step 5 — GENERATE SQL  (Sonnet / GPT-4o)
  Context: focused schema + value samples + fragments + 3-5 similar past Q→SQL
  Output: SQL query with inline reasoning comments

Step 6 — VALIDATE
  Syntax check → schema column check → execute
  If error → Step 7
  If empty + filter detected → Step 7 with "too restrictive" hint

Step 7 — SELF-CORRECT  (max 2 retries)
  Input: SQL + error + available columns hint
  Output: corrected SQL → back to Step 6

Step 8 — INTERPRET & VISUALIZE  (Haiku / GPT-4o-mini)
  Detect result shape → suggest chart type + axis mapping
  Generate 1-line insight text
  Store Q→SQL pair in few-shot bank
```

### 7.2 Chat Interface Features

| Feature | Detail |
|---|---|
| **Conversation threads** | Each chat is a thread, history preserved |
| **Follow-up questions** | Remembers context: "Now break that down by region" |
| **Show SQL** | Expand to see generated SQL below the answer |
| **Edit SQL** | User can edit generated SQL and re-run |
| **Inline chart** | Chart renders directly in chat message |
| **Save to dashboard** | One-click from chat result → save chart to any dashboard |
| **Thumbs up/down** | Feedback stored → improves future accuracy |
| **Correct the SQL** | User pastes corrected SQL → stored as high-quality example |
| **Ask follow-up** | "Why is this metric lower than last month?" → narrative answer |
| **Data dictionary mode** | "What is the orders table?" → returns description from semantic layer |
| **Multi-turn context** | AI remembers previous filters/dimensions in conversation |
| **Voice input** | Whisper API for voice-to-text question input |
| **Suggested questions** | AI suggests follow-up questions based on result |
| **Export chat** | Download full conversation as PDF |

### 7.3 AI Accuracy Features

| Feature | Accuracy Impact |
|---|---|
| Column value sampling | +15–20% — eliminates filter hallucination |
| Verified metric fragments | +12–18% — no invented business logic |
| Few-shot bank (grows with usage) | +10–15% — pattern matching |
| Self-correction loop (2 retries) | +10–15% — catches execution errors |
| Ambiguity detection | +5–8% — prevents wrong interpretation |
| Chain-of-thought prompting | +6–10% — structured reasoning |
| Focused schema (not full dump) | +8–12% — less LLM distraction |

### 7.4 LLM Provider Configuration

| Provider | Models Available | Config |
|---|---|---|
| Anthropic | Claude Haiku 4.5, Sonnet 4.6, Opus 4.8 | API key per workspace |
| OpenAI | GPT-4o-mini, GPT-4o, o1 | API key per workspace |
| Azure OpenAI | GPT-4o, GPT-4 Turbo | Endpoint + key + deployment |
| Google Gemini | Gemini 1.5 Flash, Pro, Ultra | API key |
| Groq | Llama 3.3 70B (fast + cheap) | API key |
| Ollama | Any local model | Endpoint URL |
| Custom | Any OpenAI-compatible endpoint | URL + key |

**Per workspace config:** choose classify model (cheap) + generate model (accurate) separately.

---

## 8. Dashboard Builder

### 8.1 Canvas & Layout

| Feature | Detail |
|---|---|
| **Grid layout** | 12-column responsive grid (react-grid-layout) |
| **Drag & drop** | Drag widgets anywhere, snap to grid |
| **Resize** | Drag handles to resize widgets |
| **Free-form mode** | Pixel-perfect positioning (like Figma) |
| **Auto-layout** | Smart arrangement of widgets |
| **Responsive breakpoints** | Desktop / tablet / mobile layout per dashboard |
| **Canvas zoom** | Zoom in/out for dense dashboards |
| **Multi-page dashboard** | Tabbed pages within one dashboard |
| **Fullscreen mode** | Kiosk/TV mode for wall displays |
| **Dark / light theme** | Per dashboard theme override |
| **Background** | Solid color, gradient, or image background |
| **Grid lines** | Show/hide alignment guides |
| **Undo / redo** | Full undo stack (Ctrl+Z) |

### 8.2 Widget Types

| Widget | Description |
|---|---|
| **Chart** | Any of the 40+ chart types from library |
| **KPI Card** | Single metric with trend, target, sparkline |
| **Table** | Paginated data table with sort, filter, conditional formatting |
| **Pivot Table** | Drag dimensions/metrics into rows/columns |
| **Text / Markdown** | Rich text, markdown, with variable interpolation |
| **Image** | Upload or URL |
| **Iframe** | Embed external content |
| **Filter Bar** | Cross-dashboard filter widget |
| **Date Picker** | Date range filter connected to all charts |
| **Dropdown Filter** | Multi-select dimension filter |
| **Metric Comparison** | Side-by-side metric with period comparison |
| **Progress Bar** | KPI vs target progress |
| **Gauge** | Circular gauge for single metric |
| **Alert Status** | Live alert status widget |
| **Map** | Choropleth / bubble map |
| **Divider** | Horizontal/vertical separator |
| **Spacer** | Blank space |

### 8.3 Dashboard Features

| Feature | Detail |
|---|---|
| **Global filters** | Any filter widget applies to all charts on dashboard |
| **Cross-filtering** | Click on chart element → filters other charts |
| **Drill-down** | Click to drill into sub-dimension |
| **Drill-through** | Click to open detail dashboard |
| **Time range picker** | Global date range applied to all time-series charts |
| **Auto-refresh** | Configure refresh interval (10s to 1 day) |
| **Scheduled snapshot** | Save screenshot daily, weekly |
| **Version history** | Restore any previous dashboard version |
| **Duplicate** | Clone dashboard |
| **Template variables** | `{{ workspace }}`, `{{ user_email }}` in SQL + titles |
| **Annotations** | Add text notes to specific time points on charts |
| **Bookmark** | Save current filter state as a bookmark |
| **Comments** | Leave comments on dashboards or specific widgets |
| **Export** | PDF, PNG, CSV (all widget data) |
| **Embed** | iFrame embed code with token |
| **Public link** | Shareable link (optional password) |
| **Scheduled report** | Send dashboard as PDF/email on schedule |
| **Presentation mode** | Auto-cycle through pages for TV |

---

## 9. Chart & Visualization Library

### 9.1 Chart Types (40+)

**Comparison**
- Bar chart (vertical/horizontal)
- Grouped bar
- Stacked bar
- 100% stacked bar
- Bullet chart (KPI vs target)
- Lollipop chart

**Trend / Time-Series**
- Line chart
- Area chart
- Stacked area
- Step line
- Candlestick / OHLC
- Waterfall chart

**Distribution**
- Histogram
- Box plot (with whiskers)
- Violin plot
- Density plot
- Heatmap

**Part-to-Whole**
- Pie chart
- Donut chart
- Treemap
- Sunburst
- Waffle chart

**Flow & Relationship**
- Sankey diagram
- Chord diagram
- Network graph (nodes + edges)
- Arc diagram

**Geographical**
- Choropleth map (country/state/city fill)
- Bubble map
- Point map (scatter on map)
- Route map (line on map)
- Density heatmap (geo)

**Multi-Dimensional**
- Scatter plot
- Bubble chart
- Parallel coordinates
- Radar / spider chart
- Polar bar

**KPI / Single Value**
- KPI card (metric + trend + sparkline)
- Gauge chart
- Progress bar
- Bullet chart

**Special**
- Funnel chart
- Cohort retention grid
- Calendar heatmap
- Word cloud
- Gantt chart
- 3D scatter
- 3D surface

### 9.2 Chart Configuration Options

| Category | Options |
|---|---|
| **Data** | X-axis, Y-axis, color dimension, size dimension, tooltip fields |
| **Axes** | Label, format (currency/%, date), min/max, log scale, dual axis |
| **Colors** | Color palette, per-series color, conditional coloring (red/green by value) |
| **Legend** | Position, format, click-to-toggle series |
| **Labels** | Data labels on/off, format, position |
| **Tooltip** | Custom tooltip, show multiple fields, format |
| **Reference lines** | Horizontal/vertical reference lines with label |
| **Annotations** | Mark specific data points |
| **Sorting** | By value, by label, custom order |
| **Drill-down** | Configure drill-down dimension |
| **Conditional formatting** | Color scale, icon sets, thresholds |
| **Animations** | Enable/disable, duration |

---

## 10. KPI Monitoring & Alerting

### 10.1 KPI Definition

| Feature | Detail |
|---|---|
| **KPI name & description** | Business name + context |
| **Underlying metric** | Select from semantic layer metrics or write SQL |
| **Target value** | Fixed number, dynamic (from query), or % of another KPI |
| **Target period** | Daily, weekly, monthly, quarterly |
| **Owner** | Assigned user responsible for this KPI |
| **Direction** | Higher is better / Lower is better |
| **Thresholds** | Green/yellow/red bands with values or % of target |
| **Comparison** | vs prior period, vs same period last year, vs target |
| **Aggregation** | Current value, rolling average, cumulative |

### 10.2 Alert Types

| Alert Type | How It Works |
|---|---|
| **Threshold alert** | Metric crosses a fixed value (> 1000 errors) |
| **% change alert** | Metric changes by X% vs prior period |
| **No data alert** | No rows returned for N minutes (pipeline broken) |
| **Anomaly detection** | ML-based: value is outside expected range for time/day |
| **Goal progress** | KPI is off-track to hit target by deadline |
| **Data freshness** | Table hasn't been updated in N hours |
| **Query failure** | Scheduled query fails to execute |
| **SLA breach** | Query takes longer than X seconds |

### 10.3 Alert Configuration

| Feature | Detail |
|---|---|
| **Check frequency** | Every 1 min, 5 min, 15 min, 1 hour, daily |
| **Silence window** | Suppress alerts between 10pm–8am, weekends |
| **Cooldown** | Don't re-alert for N minutes after first trigger |
| **Conditions** | AND/OR multiple conditions |
| **Preview** | Test alert against historical data before enabling |

### 10.4 Notification Channels

| Channel | Config |
|---|---|
| **Email** | SMTP config, per-user and distribution lists |
| **Slack** | Webhook URL, channel selector |
| **Microsoft Teams** | Webhook URL |
| **PagerDuty** | Integration key, severity mapping |
| **OpsGenie** | API key, team selector |
| **Webhook** | Custom HTTP POST with payload template |
| **SMS** | Twilio integration |
| **In-app** | Notification bell in UI |
| **Mobile push** | PWA push notification |

### 10.5 Alert Management

| Feature | Detail |
|---|---|
| **Alert history** | Every trigger with value, time, notification sent |
| **Acknowledge** | Mark alert as acknowledged with comment |
| **Escalation** | If not acknowledged in N min → notify manager |
| **Dashboard widget** | Alert status widget on dashboards |
| **Alert groups** | Group related alerts, suppress during maintenance |
| **Maintenance window** | Scheduled silence for deployments |

---

## 11. Reports

### 11.1 Report Types

| Type | Description |
|---|---|
| **Dashboard snapshot** | PDF/PNG of a dashboard at a point in time |
| **Data export** | Schedule a query → export result as CSV/Excel |
| **Pixel-perfect report** | Custom template with data tables + charts |
| **Narrative report** | AI-generated text + charts — "Monthly performance report" |
| **Operational report** | Tabular operational data (orders, transactions) |
| **Executive summary** | KPI cards + trend charts, high-level |
| **Drill-through report** | Master + detail pages |
| **Embedded report** | iFrame-embeddable for external portals |

### 11.2 Report Builder

| Feature | Detail |
|---|---|
| **Template editor** | Drag-drop sections: header, text, table, chart, KPI card |
| **Page settings** | A4/Letter/Legal, portrait/landscape, margins |
| **Header/footer** | Logo, report name, date, page number |
| **Variables** | `{{ report_date }}`, `{{ filters.region }}` |
| **Conditional sections** | Show/hide section based on data condition |
| **Sub-reports** | Nested reports within a report |
| **Branding** | Company logo, colors, font |
| **AI narrative** | Auto-generate paragraph summarizing key findings |
| **Preview** | Live preview as you edit |

### 11.3 Report Scheduling

| Feature | Detail |
|---|---|
| **Cron schedule** | Every day at 9am, every Monday, first of month, etc. |
| **Timezone** | Per-schedule timezone |
| **Recipients** | Individual users, groups, external email addresses |
| **Format** | PDF, Excel, CSV, HTML email inline |
| **Conditions** | Only send if metric changes or data is present |
| **Dynamic recipients** | Send to email from query result (per-customer reports) |
| **History** | Log of every sent report with delivery status |
| **Re-send** | Manually trigger a past report |
| **Unsubscribe link** | Auto-included in emails |

---

## 12. Data Lineage

### 12.1 Lineage Tracking Levels

| Level | What Is Tracked |
|---|---|
| **Source level** | Which data source / table is used |
| **Dataset level** | Which datasets derive from which sources |
| **Column level** | Which source columns feed which output columns |
| **Dashboard level** | Which dashboards use which datasets |
| **Chart level** | Which charts use which datasets + columns |
| **Report level** | Which reports use which queries/datasets |
| **Alert level** | Which alerts monitor which metrics/datasets |

### 12.2 Lineage Graph UI

| Feature | Detail |
|---|---|
| **Visual DAG** | Directed acyclic graph showing full data flow |
| **Node types** | Source DB, table, view, dataset, chart, dashboard, report |
| **Click to expand** | Click node → expand upstream/downstream |
| **Column lineage** | Click column → highlight all columns it flows through |
| **Impact analysis** | "If I change this table, what breaks?" → highlight affected |
| **Filter by type** | Show only tables, only dashboards, only charts |
| **Search** | Find any asset in lineage graph |
| **Full-screen** | Expand to full screen for large graphs |
| **Export** | Export lineage as PNG or JSON |
| **Time-travel** | View lineage as it was N days ago |

### 12.3 Impact Analysis

| Feature | Detail |
|---|---|
| **Schema change preview** | Before changing a column name: show all assets that use it |
| **Deprecation analysis** | Mark dataset deprecated → show all downstream dependents |
| **Breaking change detection** | Auto-detect when a column is dropped or renamed |
| **Notification** | Notify chart/dashboard owners when upstream changes |
| **Dependency count** | Badge on each asset showing downstream count |

---

## 13. User Management & Access Control

### 13.1 Authentication Methods

| Method | Detail |
|---|---|
| **Email + password** | Bcrypt hashed, configurable complexity rules |
| **Google OAuth** | Sign in with Google |
| **Microsoft OAuth** | Sign in with Microsoft / Azure AD |
| **GitHub OAuth** | Sign in with GitHub |
| **SAML 2.0** | Enterprise SSO (Okta, Auth0, OneLogin, ADFS) |
| **LDAP / Active Directory** | Direct LDAP bind |
| **Magic link** | Passwordless email link |
| **MFA** | TOTP (Google Authenticator), SMS, Email OTP |
| **API keys** | For programmatic access |
| **Session management** | Configurable TTL, force-logout all sessions |

### 13.2 Role System

#### System Roles

| Role | Capabilities |
|---|---|
| **Super Admin** | Full platform control, all orgs, billing, system settings |
| **Org Admin** | All org resources, user management, data source management |
| **Data Engineer** | Connect sources, manage datasets, semantic layer |
| **Analyst** | Create dashboards, charts, run queries, AI chat |
| **Viewer** | View shared dashboards only, no edit, no query |
| **Guest** | View specific public-shared dashboards only |

#### Resource-Level Permissions

| Resource | Permissions |
|---|---|
| **Data source** | View, query, manage |
| **Dataset** | View, query, edit, delete |
| **Dashboard** | View, edit, delete, share |
| **Chart** | View, edit, delete |
| **Report** | View, create, schedule, delete |
| **Semantic layer** | View, edit metrics, edit full model |
| **Alert** | View, create, edit, delete |
| **SQL editor** | Query only, or full access |

### 13.3 Organization & Team Structure

```
Organization
  └── Workspaces  (separate data environments)
        ├── Teams  (group of users with shared access)
        │     └── Members
        ├── Data Sources  (scoped to workspace)
        ├── Datasets
        ├── Dashboards
        └── Projects  (group dashboards + datasets by project)
```

### 13.4 Row-Level Security (RLS)

| Feature | Detail |
|---|---|
| **Policy definition** | SQL WHERE clause injected based on user attribute |
| **User attributes** | email, role, team, custom attributes from SSO |
| **Policies per dataset** | Each dataset can have its own RLS policy |
| **Policy testing** | Preview what data a specific user sees |
| **Bypass** | Admin can override RLS for debugging |
| **Audit** | Log when RLS policy filters rows |

### 13.5 User Management UI

| Feature | Detail |
|---|---|
| **User directory** | List all users, search, filter by role/status |
| **Invite by email** | Send invite link with role pre-assigned |
| **Bulk invite** | Upload CSV of emails to invite |
| **SSO group sync** | Auto-assign roles based on IdP groups |
| **Deactivate user** | Disable login without deleting data |
| **Transfer ownership** | Reassign assets when user leaves |
| **Activity log** | Per-user activity timeline |
| **Impersonation** | Admin can preview as another user (audited) |
| **API key management** | Per-user API keys with scope and expiry |

---

## 14. Collaboration & Sharing

### 14.1 Sharing Options

| Option | Detail |
|---|---|
| **Share with user** | Specific users with view or edit permission |
| **Share with team** | All members of a team |
| **Public link** | Anyone with link can view (optional password) |
| **Embed code** | iFrame snippet with JWT-signed token |
| **Scheduled email** | PDF/PNG sent to recipients on schedule |
| **Slack integration** | Send chart or dashboard snapshot to Slack channel |
| **Teams integration** | Send to Microsoft Teams channel |
| **Export + download** | CSV, Excel, PDF, PNG per widget or full dashboard |

### 14.2 Comments & Annotations

| Feature | Detail |
|---|---|
| **Dashboard comments** | Leave comment on a dashboard |
| **Widget comments** | Comment on specific chart |
| **Annotation points** | Pin annotation to specific data point or time |
| **Mentions** | `@user` mentions with notification |
| **Resolve comments** | Mark comment thread as resolved |
| **Comment notifications** | Email/Slack notification on new comment |

### 14.3 Versioning & Change Tracking

| Feature | Detail |
|---|---|
| **Dashboard versions** | Every save creates a version, restore any |
| **Query versions** | Track changes to saved queries |
| **Semantic layer versions** | Track changes to model definitions |
| **Change log** | Who changed what and when |
| **Change approval** | Optional: require approval before publishing changes |

---

## 15. Settings & Configuration

### 15.1 Organization Settings

| Setting | Detail |
|---|---|
| **Organization name & logo** | Branding |
| **Default timezone** | Applied to all date queries |
| **Default date format** | MM/DD/YYYY vs DD/MM/YYYY etc. |
| **Default currency** | Symbol + formatting |
| **Number formatting** | Thousands separator, decimal places |
| **Session timeout** | Idle session TTL |
| **Password policy** | Length, complexity, expiry, history |
| **MFA enforcement** | Require MFA for all / admins only |
| **IP allowlist** | Restrict login to allowed IP ranges |
| **Allowed email domains** | Only accept signups from @company.com |
| **Data retention** | How long to keep query history, audit logs |
| **Storage quota** | Max upload size per workspace |

### 15.2 Workspace Settings

| Setting | Detail |
|---|---|
| **Name & description** | Workspace display info |
| **Default LLM provider** | Which AI provider + models to use for this workspace |
| **AI budget** | Max $ per month on LLM calls |
| **Query timeout** | Default query execution timeout |
| **Max rows returned** | Default + max row limits |
| **Cache TTL** | Default query result cache duration |
| **Allowed data sources** | Restrict which connection types are allowed |
| **Export permissions** | Who can export data |
| **Notification channels** | Default channels for workspace alerts |

### 15.3 Data Source Settings (Per Connection)

| Setting | Detail |
|---|---|
| **Connection credentials** | Edit host, port, user, password |
| **Schema sync schedule** | How often to refresh schema metadata |
| **Query timeout** | Override for this connection |
| **Max connections** | Pool size |
| **SSL config** | Certificate upload |
| **SSH tunnel** | Jump host config |
| **Read replica** | Separate endpoint for SELECT queries |
| **Cost tracking** | BigQuery/Snowflake: track bytes/credits used |

### 15.4 AI Settings

| Setting | Detail |
|---|---|
| **LLM provider + model** | Select provider and model for classify/generate |
| **API key** | Per provider |
| **Max tokens per query** | Budget per request |
| **Temperature** | 0.0 for deterministic SQL, 0.3 for narrative |
| **Self-correction retries** | How many times to retry on error (0–3) |
| **Ambiguity threshold** | Score above which to ask clarifying question |
| **Semantic layer refresh** | How often to re-run bootstrap descriptions |
| **Few-shot bank size** | Max examples to retrieve (default 5) |
| **Log AI requests** | Store prompt + response for audit |

### 15.5 Notification Settings

| Setting | Detail |
|---|---|
| **Email (SMTP)** | Host, port, TLS, from address, credentials |
| **Slack** | Workspace app install + channel config |
| **Microsoft Teams** | Webhook URL |
| **PagerDuty** | Integration key |
| **Webhook** | Custom HTTP endpoint |
| **Twilio (SMS)** | Account SID, auth token, from number |

### 15.6 System Settings (Super Admin)

| Setting | Detail |
|---|---|
| **License** | License key, seats, expiry |
| **Backup** | Schedule automated DB backup |
| **System health** | CPU/memory/disk usage dashboard |
| **Worker queues** | Monitor Celery worker health |
| **Feature flags** | Enable/disable platform features |
| **Maintenance mode** | Take platform offline for updates |
| **Audit log export** | Export full audit log |
| **SMTP test** | Send test email |
| **Custom domain** | White-label domain config |

---

## 16. Security

### 16.1 Data Security

| Feature | Detail |
|---|---|
| **Credentials encryption** | AES-256 for all stored credentials |
| **Secret rotation** | Automatic rotation for internally managed secrets |
| **TLS everywhere** | All connections (UI, API, DB) require TLS |
| **No data storage by default** | Query results not stored on server unless explicitly cached |
| **Cache encryption** | Cached results encrypted at rest |
| **PII detection** | Flag columns likely containing PII (email, phone, SSN) |
| **Data masking** | Mask PII columns for non-privileged users |
| **VPC support** | Deploy behind private VPC, no public internet required |

### 16.2 Access Security

| Feature | Detail |
|---|---|
| **RBAC** | Role-based access control (defined above) |
| **RLS** | Row-level security per dataset |
| **Column-level security** | Hide specific columns from specific roles |
| **MFA** | TOTP, SMS, email |
| **Session management** | Revoke sessions, force logout |
| **IP allowlist** | Restrict access by IP |
| **API key scopes** | Limit API keys to specific operations |
| **Audit logging** | Every login, query, change logged |
| **Penetration testing** | OWASP top 10 compliance |

### 16.3 Compliance

| Standard | Support |
|---|---|
| **GDPR** | Right to deletion, data export, processing agreements |
| **SOC 2 Type II** | Audit controls, access logs |
| **HIPAA** | Configurable, BAA available for cloud version |
| **ISO 27001** | Security management framework |
| **CCPA** | California consumer privacy |

---

## 17. Performance & Caching

### 17.1 Query Caching

| Cache Type | Detail |
|---|---|
| **Result cache** | Cache query result by hash of SQL + params |
| **TTL** | Configurable per dataset and per dashboard |
| **Invalidation** | Manual invalidation, schedule-based, on data change |
| **Semantic cache** | Similar questions reuse SQL (embedding similarity) |
| **Pre-warm** | Run dashboard queries on schedule before users arrive |
| **Cache hit indicator** | Show users when result is from cache |

### 17.2 Query Optimization

| Feature | Detail |
|---|---|
| **Query partitioning** | Auto-add partition filters for partitioned tables |
| **Columnar push-down** | Select only needed columns |
| **Predicate push-down** | Push WHERE filters to source |
| **Aggregation push-down** | Push GROUP BY to source where possible |
| **Query limits** | Enforce row + byte limits |
| **Cost estimation** | Pre-query cost estimate for BigQuery/Snowflake |
| **Slow query log** | Alert on queries exceeding threshold |

### 17.3 Infrastructure Performance

| Feature | Detail |
|---|---|
| **Async queries** | Long queries run async, notify when done |
| **Background workers** | Celery workers for scheduled jobs |
| **Connection pooling** | PgBouncer-style per data source |
| **Horizontal scaling** | Stateless backend, scale workers independently |
| **CDN for assets** | Static frontend assets via CDN |
| **WebSocket for live data** | Push updates to live dashboards |

---

## 18. API Layer

### 18.1 REST API

Full REST API for all platform operations:

| Category | Endpoints |
|---|---|
| **Auth** | Login, refresh token, API key management |
| **Data sources** | CRUD connections, test, sync schema |
| **Datasets** | CRUD datasets, preview, profile |
| **Queries** | Execute SQL, get history, save queries |
| **AI chat** | Send question, get SQL + result + chart |
| **Dashboards** | CRUD dashboards, export |
| **Charts** | CRUD charts |
| **Semantic layer** | CRUD models, metrics, glossary |
| **Alerts** | CRUD alerts, trigger, history |
| **Reports** | CRUD reports, schedule, send now |
| **Users** | CRUD users, invite, permissions |
| **Lineage** | Get lineage graph, impact analysis |

### 18.2 Embedding API

- Embed any dashboard, chart, or AI chat widget in external apps
- JWT-signed tokens with scoped permissions
- Custom theme via URL parameters
- Row-level filtering via token payload
- Events API for cross-frame communication

### 18.3 Webhook Events

| Event | Trigger |
|---|---|
| `alert.triggered` | Alert condition met |
| `report.sent` | Scheduled report delivered |
| `data_source.error` | Connection health check failed |
| `query.failed` | Scheduled query failed |
| `schema.changed` | Schema change detected |
| `user.invited` | New user invited |
| `dashboard.shared` | Dashboard shared externally |

---

## 19. Tech Stack

### Backend

| Layer | Technology | Reason |
|---|---|---|
| Framework | FastAPI (Python 3.11) | Async, fast, great DX |
| Database driver | asyncpg | Fastest PostgreSQL async driver |
| App database | PostgreSQL 15 + pgvector | Single DB for app data + embeddings |
| Caching | Redis | Query result cache, session store |
| Task queue | Celery + Redis | Scheduled jobs, alerts, reports |
| ORM | SQLAlchemy (core, not ORM) | Lightweight query building for user DBs |
| Auth | python-jose + bcrypt | JWT + password hashing |
| Email | FastAPI-Mail + SMTP | Report + alert delivery |
| PDF generation | WeasyPrint | Report PDF rendering |
| Excel export | openpyxl | Excel file generation |
| SQL parsing | sqlparse + sqlglot | Multi-dialect SQL parsing + transpilation |
| Graph traversal | NetworkX | FK relationship graph |
| Schema detection | SQLAlchemy inspect | Cross-DB schema reading |
| LLM SDKs | anthropic + openai | Direct SDK, no wrappers |
| Vector embeddings | openai text-embedding-3-small | Fast, cheap, good quality |
| File parsing | pandas + pyarrow + duckdb | CSV, Parquet, Excel, JSON parsing |

### Frontend

| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14 + TypeScript | SSR + great DX |
| Styling | Tailwind CSS | Utility-first, fast development |
| Charts | Plotly.js + ECharts | 40+ chart types, excellent performance |
| Dashboard layout | react-grid-layout | PowerBI-style drag-resize grid |
| SQL editor | Monaco Editor (@monaco-editor/react) | VS Code quality |
| Tables | TanStack Table v8 | Headless, high-performance data grid |
| Maps | Mapbox GL JS / Leaflet | Geographic visualizations |
| Diagrams (lineage) | React Flow | DAG lineage graph |
| State management | Zustand | Lightweight, simple |
| Data fetching | TanStack Query | Cache + server state |
| Forms | React Hook Form + Zod | Validation + forms |
| Rich text | TipTap | Report builder text blocks |
| Drag & drop | dnd-kit | Accessible drag-and-drop |
| Date handling | date-fns | Lightweight date utilities |

### Infrastructure

| Component | Technology |
|---|---|
| Container | Docker + Docker Compose |
| Reverse proxy | Nginx |
| Process manager | Supervisor / systemd |
| Object storage | MinIO (self-hosted) / S3 compatible |
| Monitoring | Prometheus + Grafana (internal) |
| Log aggregation | Loki or ELK |
| Secret management | HashiCorp Vault / AWS Secrets Manager |
| CI/CD | GitHub Actions |

---

## 20. Build Phases

### Phase 1 — Foundation (Weeks 1–3)
```
✓ Project setup: FastAPI + Next.js + PostgreSQL + Docker
✓ Auth: email/password, JWT, session management
✓ Organization + workspace + user model
✓ Data source connectors: PostgreSQL, MySQL, SQLite, CSV upload
✓ Schema scanner + schema browser UI
✓ Basic SQL editor (Monaco) with autocomplete
✓ Simple query execution + results grid
✓ Basic chart: bar, line, pie from query result
✓ Simple dashboard: add charts, layout
```

### Phase 2 — Semantic Layer + AI (Weeks 4–6)
```
✓ Semantic layer data model
✓ Bootstrap flow: auto-describe schema with LLM
✓ Column value sampling
✓ FK relationship graph (NetworkX)
✓ Metric fragment builder + verifier
✓ Glossary manager
✓ AI chat pipeline: classify → link → generate → execute → self-correct
✓ Few-shot bank: store + retrieve Q→SQL pairs
✓ Thumbs up/down feedback loop
✓ Ambiguity detection + clarifying question
✓ Chart auto-selection from result shape
```

### Phase 3 — Full Data Sources (Weeks 7–9)
```
✓ BigQuery, Snowflake, Redshift, Athena connectors
✓ S3, GCS file source
✓ REST API connector (generic + pre-built templates)
✓ SSH tunnel support
✓ Connection health monitoring
✓ File upload: Excel, Parquet, JSON, JSONL
✓ Dataset management: virtual + physical
✓ Column profiling + data quality checks
✓ Row-level security
```

### Phase 4 — Dashboard + Visualization (Weeks 10–12)
```
✓ Full dashboard builder with react-grid-layout
✓ All 40+ chart types
✓ Global filters + cross-filtering
✓ Drill-down + drill-through
✓ KPI card widget
✓ Filter widgets (date picker, dropdown, text search)
✓ Dashboard templates
✓ Auto-refresh
✓ Embed code generation
✓ Dashboard versioning
```

### Phase 5 — Monitoring + Reports (Weeks 13–15)
```
✓ KPI definition + target setting
✓ Alert engine: threshold, % change, no-data, anomaly
✓ Notification channels: email, Slack, Teams, webhook
✓ Alert history + acknowledgement
✓ Report builder (template-based)
✓ Scheduled report delivery (PDF, Excel, email)
✓ AI narrative report generation
✓ Report history
```

### Phase 6 — Lineage + Advanced (Weeks 16–18)
```
✓ Column-level lineage tracking
✓ Visual lineage DAG (React Flow)
✓ Impact analysis: what breaks if I change X
✓ Full user management UI
✓ SAML 2.0 + LDAP integration
✓ Advanced RBAC + column-level security
✓ Audit log viewer
✓ Full REST API documentation
✓ Embedding API + JWT tokens
✓ Performance: query caching, result pagination, async queries
```

### Phase 7 — Enterprise Polish (Weeks 19–21)
```
✓ Multi-LLM provider support (Anthropic, OpenAI, Gemini, Groq, Ollama)
✓ Cross-source joins (federation)
✓ Advanced SQL editor: CTE builder, AI assist, linter
✓ Pivot table widget
✓ Cohort retention chart
✓ Calendar heatmap
✓ Mobile responsive dashboards
✓ White-label / custom domain
✓ Kubernetes deployment guide
✓ Helm chart
```

---

## 21. Data Discovery & Catalog

### 21.1 Global Search

| Feature | Detail |
|---|---|
| **Universal search bar** | Search across all assets: datasets, dashboards, charts, queries, columns, metrics |
| **Search scope filters** | Filter results by type, workspace, owner, tag, last modified |
| **Column-level search** | Find any column by name across all connected databases |
| **Full-text content search** | Search inside dashboard descriptions, query text, metric definitions |
| **Fuzzy matching** | Typo-tolerant search (e.g. "custommer" finds "customer") |
| **Keyboard shortcut** | `Cmd+K` / `Ctrl+K` opens search from anywhere |
| **Recent + pinned** | Show recently viewed and pinned assets on search open |
| **Search analytics** | Track what users search for — informs what to document |

### 21.2 Data Catalog

| Feature | Detail |
|---|---|
| **Asset registry** | Every table, dataset, chart, dashboard, metric auto-registered |
| **Asset profile page** | Owner, description, tags, schema, lineage, usage stats, quality score |
| **Ownership** | Assign owner(s) per asset — they get notified of issues |
| **Stewardship** | Data steward role — responsible for quality and documentation |
| **Certification** | Mark asset as Certified (production-ready) / Deprecated / Draft |
| **Popularity score** | Based on query count, dashboard views, bookmarks |
| **Dead asset detection** | Flag assets with 0 views in 90 days |
| **Asset relationships** | See all upstream sources + downstream dashboards per asset |
| **Change history** | Who edited the asset description, schema, or certification status |
| **Bulk edit** | Update descriptions, tags, owners across multiple assets at once |
| **Import/export catalog** | Export full catalog as JSON or CSV |

### 21.3 Business Glossary

| Feature | Detail |
|---|---|
| **Term definitions** | Business terms with plain-English definitions (separate from semantic layer) |
| **Term-to-column mapping** | Link glossary term to one or more physical columns |
| **Related terms** | Group synonyms and related terms |
| **Domain categories** | Organise terms by domain (Finance, Sales, Product, Engineering) |
| **Term approval workflow** | New terms require steward approval before publishing |
| **Inline tooltips** | Hover on any metric name in dashboards → see glossary definition |
| **Search integration** | Glossary terms appear in global search results |
| **Export** | Export glossary as PDF or CSV for documentation |

### 21.4 Homepage & Discovery Feed

| Feature | Detail |
|---|---|
| **Personalised homepage** | Recently viewed, bookmarked, trending assets |
| **Trending dashboards** | Most viewed dashboards in your workspace this week |
| **New assets** | Recently published/certified assets |
| **Announcements** | Admin broadcast messages to all users |
| **Quick actions** | New query, new dashboard, ask AI — from homepage |
| **Activity feed** | What your teammates have published or updated |

---

## 22. Data Quality & Observability

### 22.1 Automated Quality Checks

| Check Type | Detail |
|---|---|
| **Null %** | Alert if null % exceeds threshold for critical columns |
| **Duplicate rows** | Detect duplicate primary keys |
| **Out-of-range values** | Numeric column exceeds expected min/max |
| **Referential integrity** | FK values not found in parent table |
| **Format validation** | Email, phone, date format checks on string columns |
| **Enum check** | Column value not in expected set (status not in allowed list) |
| **Row count change** | Table row count changes by > X% vs yesterday |
| **Zero rows** | Alert if query returns 0 rows when it should have data |
| **Uniqueness** | Column expected to be unique has duplicates |
| **Distribution drift** | Statistical distribution of column shifts significantly |

### 22.2 Data Freshness Monitoring

| Feature | Detail |
|---|---|
| **SLA definition** | Define expected update frequency per table (every hour, daily by 9am) |
| **Freshness check** | Monitor `MAX(updated_at)` or `MAX(created_at)` per table |
| **Alert on breach** | Notify owner if data is stale beyond SLA |
| **Freshness badge** | Show data freshness on every dataset and dashboard |
| **Pipeline health** | Track ingestion pipeline success/failure rates |
| **Last updated** | Show "Data as of 2 hours ago" on every chart |

### 22.3 Schema Change Detection

| Feature | Detail |
|---|---|
| **Column added** | Detect new columns, notify dataset owners |
| **Column removed** | Detect dropped columns, highlight broken queries/charts |
| **Column renamed** | Detect renames, suggest fixes in broken assets |
| **Type changed** | INT → VARCHAR change flagged |
| **Table added/removed** | New tables surfaced, removed tables break lineage |
| **Diff view** | Side-by-side schema diff between current and last known |
| **Impact report** | List all queries, datasets, charts, dashboards affected by schema change |
| **Auto-fix suggestions** | AI suggests fix for broken SQL after schema change |

### 22.4 Data Contracts

| Feature | Detail |
|---|---|
| **Contract definition** | Define expectations: freshness, row count range, null %, schema |
| **Contract owner** | Assigned team responsible for upholding contract |
| **Consumers** | List of dashboards/reports that depend on this contract |
| **SLA tracking** | Track contract breach history over time |
| **Contract status badge** | Green/yellow/red on dataset profile page |
| **Breach notification** | Notify all downstream consumers when contract breached |

### 22.5 Quality Score

| Feature | Detail |
|---|---|
| **Per-asset score** | 0–100 based on documentation %, check pass rate, freshness |
| **Workspace-level score** | Aggregate quality score for the workspace |
| **Score breakdown** | Which checks are passing/failing |
| **Improvement suggestions** | "Add description to 3 columns to increase score to 85" |
| **Quality dashboard** | Admin view — all assets, scores, trend over time |

---

## 23. Transformation & Modeling

### 23.1 No-Code Query Builder

| Feature | Detail |
|---|---|
| **Table picker** | Select source table visually |
| **Column selector** | Checkbox columns to include |
| **Filter builder** | Add WHERE conditions with dropdowns (column, operator, value) |
| **Join builder** | Visual join — select two tables, pick join columns, join type |
| **Aggregation builder** | GROUP BY with SUM/COUNT/AVG/MIN/MAX |
| **Sort builder** | ORDER BY with direction |
| **Limit** | LIMIT rows |
| **Preview** | Live preview of result as you build |
| **Generate SQL** | Export built query as SQL to editor |
| **Save as dataset** | Save the no-code query as a reusable dataset |

### 23.2 Transformation UI (Power Query–style)

| Feature | Detail |
|---|---|
| **Step-based pipeline** | Each transformation is a step — add, reorder, delete steps |
| **Column rename** | Rename any column |
| **Type cast** | Change column type (string → date, string → number) |
| **Fill nulls** | Fill null values with constant, mean, previous row |
| **String operations** | Trim, upper, lower, split, extract substring, regex replace |
| **Date operations** | Extract year/month/day, date diff, date add, date format |
| **Filter rows** | Remove rows matching condition |
| **Pivot / Unpivot** | Reshape tabular data |
| **Merge (join)** | Join two datasets visually |
| **Append (union)** | Stack two datasets with same schema |
| **Add computed column** | Expression-based new column |
| **Aggregate** | Summarise rows by group |
| **Preview per step** | See data after each transformation step |
| **Undo/redo** | Full undo stack across all steps |
| **Generate SQL** | Export transformation pipeline as SQL |

### 23.3 dbt Integration

| Feature | Detail |
|---|---|
| **dbt project connect** | Connect a dbt project (Git repo or dbt Cloud) |
| **Model import** | Import dbt models as datasets automatically |
| **dbt lineage** | Show dbt model DAG inside platform lineage view |
| **dbt docs** | Surface dbt model descriptions + column docs in catalog |
| **dbt test results** | Show dbt test pass/fail per model |
| **dbt run trigger** | Trigger dbt run from within the platform |
| **dbt metrics** | Import dbt metrics as semantic layer metrics |
| **dbt sources** | Import dbt source definitions as data source metadata |

### 23.4 Scheduled Query Jobs

| Feature | Detail |
|---|---|
| **Job definition** | Name, SQL query, data source, output destination |
| **Schedule** | Cron expression or simple picker (daily/weekly/monthly) |
| **Output options** | Append to dataset, replace dataset, write to S3, send email |
| **On failure** | Retry N times, send alert, skip |
| **Job history** | Every run: status, duration, rows written, error |
| **Dependency chain** | Job B runs after Job A succeeds |
| **Manual trigger** | Run job now outside of schedule |
| **Parameterized** | Inject date range or other params at run time |

### 23.5 Python Notebook Mode

| Feature | Detail |
|---|---|
| **Jupyter-style interface** | Code cells + markdown cells + output cells |
| **Pre-loaded libraries** | pandas, numpy, matplotlib, plotly, sqlalchemy available |
| **DB connection** | `db.query("SELECT ...")` returns pandas DataFrame |
| **Inline charts** | Plotly charts render inline in cell output |
| **Save as dataset** | Save DataFrame as a platform dataset |
| **Share notebook** | Share with team members (view or edit) |
| **Schedule notebook** | Run notebook on cron, store output |
| **Kernel management** | Start/stop Python kernel per session |
| **Variable inspector** | See all variables in current session |

---

## 24. Advanced AI Features

### 24.1 AI-Generated Insights

| Feature | Detail |
|---|---|
| **Chart insight** | Below every chart: 1–3 sentence AI summary ("Revenue up 23% MoM driven by Enterprise segment") |
| **Anomaly explanation** | When anomaly detected: "This drop coincides with a 40% decrease in new sign-ups" |
| **Period comparison narrative** | "This month vs last month: 3 metrics improved, 2 declined" |
| **Executive summary** | AI writes a full narrative summary of a dashboard on demand |
| **Root cause suggestion** | "Possible reasons for this decline: seasonality, recent price change, campaign ending" |
| **Trend detection** | "This metric has been steadily declining for 6 weeks" |
| **Correlation insight** | "Revenue and support tickets are highly correlated (r=0.87)" |

### 24.2 Time-Series Forecasting

| Feature | Detail |
|---|---|
| **Forecast any metric** | Add forecast line to any time-series chart |
| **Methods** | ARIMA, Holt-Winters, Prophet (via LLM-assisted config) |
| **Confidence interval** | Show upper/lower bounds as shaded area |
| **Forecast horizon** | Configurable (next 7 days, 30 days, 90 days) |
| **Seasonality** | Auto-detect daily, weekly, yearly seasonality |
| **Forecast accuracy** | Show MAPE / MAE for back-test period |
| **Alert on deviation** | Alert when actual value diverges from forecast by X% |

### 24.3 Anomaly Detection (ML-based)

| Feature | Detail |
|---|---|
| **Auto-detect** | Platform learns baseline for each metric automatically |
| **Seasonality-aware** | "Low on weekends" is normal — not an anomaly |
| **Sensitivity** | Configurable sensitivity (high / medium / low) |
| **Anomaly markers** | Red dots on time-series charts at anomaly points |
| **Root cause candidates** | Show correlated dimensions that changed at same time |
| **False positive feedback** | Mark as "expected" to improve model |
| **Anomaly feed** | Dedicated feed of all detected anomalies across workspace |

### 24.4 AI Dashboard Builder

| Feature | Detail |
|---|---|
| **Natural language prompt** | "Build me a sales performance dashboard for Q2" |
| **AI generates layout** | Creates dashboard with relevant charts from semantic layer |
| **User refines** | Add, remove, rearrange AI-generated widgets |
| **Smart suggestions** | "Based on your data, you might want to add a cohort retention chart" |
| **Auto chart type** | AI picks best chart type for each metric |
| **Template selection** | AI suggests closest template to intent |

### 24.5 AI SQL Assistant (in Editor)

| Feature | Detail |
|---|---|
| **Inline autocomplete** | GitHub Copilot-style suggestion as you type |
| **Explain selection** | Highlight SQL → "Explain this" → plain English explanation |
| **Optimize selection** | Highlight SQL → "Optimize" → rewrite with better performance |
| **Generate from comment** | Write `-- top 10 customers by revenue` → AI generates SQL below |
| **Fix error** | Paste error message → AI fixes the query |
| **Convert dialect** | Rewrite MySQL SQL as BigQuery SQL |
| **Add comments** | Auto-add inline SQL comments explaining complex logic |
| **Simplify** | Rewrite nested subquery as CTE |

### 24.6 Natural Language Dashboard Filters

| Feature | Detail |
|---|---|
| **NL filter bar** | Type "show me only USA data" → applies country filter to dashboard |
| **Date parsing** | "Last 3 months", "Q1 2026", "since last week" → date range |
| **Comparison** | "vs last year" → adds comparison series to all charts |
| **Segment filter** | "only enterprise customers" → applies RLS-aware filter |
| **Reset** | Clear all NL-applied filters with one click |

---

## 25. Reverse ETL & Data Activation

### 25.1 What Is Reverse ETL

Push query results from the platform back to external tools — CRMs, marketing platforms, Slack, spreadsheets. Closes the loop: data in → analyse → act.

### 25.2 Destinations

| Destination | What Gets Pushed | Auth |
|---|---|---|
| **Salesforce** | Update leads, contacts, opportunities | OAuth |
| **HubSpot** | Update contacts, companies, deals | API key / OAuth |
| **Intercom** | Update user attributes, send messages | API key |
| **Zendesk** | Update ticket fields, user attributes | API key |
| **Slack** | Send message / table to channel | Webhook / OAuth |
| **Microsoft Teams** | Send message / table to channel | Webhook |
| **Google Sheets** | Write result to sheet range | OAuth |
| **Airtable** | Create or update records | API key |
| **Notion** | Create database rows | Integration token |
| **Webhooks** | POST result rows to any HTTP endpoint | Auth header |
| **Amazon S3** | Write CSV/Parquet to S3 path | IAM |
| **SFTP** | Write file to SFTP server | Key/password |
| **Email** | Send CSV attachment to email list | SMTP |

### 25.3 Sync Configuration

| Feature | Detail |
|---|---|
| **Source query** | SQL query or saved dataset as source |
| **Mapping** | Map source columns to destination fields |
| **Sync mode** | Insert only / upsert (update if exists) / full replace |
| **Match key** | Column used to identify existing records (e.g. email, ID) |
| **Schedule** | Cron or event-triggered |
| **Filter** | Only sync rows matching a condition |
| **Dry run** | Preview what would change before running |
| **Sync history** | Rows inserted, updated, failed per run |
| **Error rows** | Download rows that failed to sync |
| **Alerts** | Notify on sync failure or partial failure |

---

## 26. Subscriptions & Self-Service Alerts

### 26.1 User Subscriptions

| Feature | Detail |
|---|---|
| **Subscribe to dashboard** | Get emailed snapshot when dashboard is updated |
| **Subscribe to metric** | Get notified when a specific metric changes by X% |
| **Subscribe to dataset** | Get notified when dataset is refreshed |
| **Subscribe to report** | Receive scheduled report without admin setting it up |
| **Subscribe to alert** | Get notified when a team alert fires |
| **Manage subscriptions** | User-facing page to manage all subscriptions |
| **Unsubscribe link** | Every notification email has one-click unsubscribe |
| **Frequency control** | User sets: immediate / daily digest / weekly digest |

### 26.2 Self-Service Alert Creation

| Feature | Detail |
|---|---|
| **Any user creates alerts** | Not just admins — any analyst can create alerts on any metric |
| **Alert wizard** | Step-by-step: pick metric → set condition → pick channel → done |
| **Personal alerts** | Alert only notifies the creator, not the whole team |
| **Team alerts** | Share alert with team members |
| **Alert templates** | Common alert patterns available as one-click templates |
| **Alert from chart** | Right-click any chart → "Alert me when this changes" |
| **Budget cap** | Limit how many alerts a non-admin user can create |

---

## 27. Developer Tools & Integration

### 27.1 CLI Tool

```bash
# Install
pip install datamind-cli   # or: brew install datamind

# Authenticate
datamind login --workspace my-workspace

# Query
datamind query "SELECT * FROM orders LIMIT 10" --source prod-db --format csv

# AI query
datamind ask "top 10 customers by revenue this month" --project sales

# Export dashboard
datamind dashboard export my-dashboard --format pdf --output ./report.pdf

# Push dataset
datamind dataset push ./data.csv --name "Q2 Leads" --workspace marketing

# Sync semantic layer
datamind semantic pull --output ./semantic/
datamind semantic push --input ./semantic/

# Trigger report
datamind report send monthly-sales --to team@company.com

# Run alert check
datamind alert check revenue-drop
```

### 27.2 Python SDK

```python
from datamind import DataMind

client = DataMind(api_key="...", workspace="sales")

# Query any data source
df = client.query("SELECT * FROM orders WHERE status = 'completed'", source="prod-db")

# AI text-to-SQL
result = client.ask("top 10 customers by revenue last quarter")
print(result.sql)       # generated SQL
print(result.data)      # pandas DataFrame
print(result.chart)     # Plotly figure

# Push a dataset
client.datasets.push(df, name="Q2 Analysis", replace=True)

# Trigger alert check
client.alerts.check("revenue-drop")

# Get dashboard data
dash = client.dashboards.get("sales-overview")
for widget in dash.widgets:
    print(widget.name, widget.data)
```

### 27.3 JavaScript / TypeScript SDK

```typescript
import { DataMind } from '@datamind/sdk';

const client = new DataMind({ apiKey: '...', workspace: 'sales' });

// Ask AI
const result = await client.ask('monthly revenue trend');
console.log(result.sql, result.rows);

// Embed dashboard
const embed = await client.dashboards.embed('sales-overview', {
  filters: { region: 'US' },
  theme: 'dark',
});
console.log(embed.iframeUrl);
```

### 27.4 Git Integration

| Feature | Detail |
|---|---|
| **Semantic layer as YAML** | Export full semantic model to YAML files |
| **Git sync** | Connect a Git repo — push/pull semantic model changes |
| **Version control** | Track every change to metrics, models, glossary in Git |
| **Pull request workflow** | Propose semantic layer changes via PR |
| **CI validation** | Git CI action validates semantic layer on every PR |
| **Diff view** | See YAML diff of semantic layer changes in platform UI |
| **Dashboard as code** | Export dashboards as JSON — commit and deploy |
| **Rollback** | Revert semantic layer to any Git commit |

### 27.5 Plugin System

| Feature | Detail |
|---|---|
| **Custom connector** | Build and register a custom data source connector |
| **Custom chart type** | Register a custom Plotly/ECharts chart |
| **Custom transform** | Add custom transformation step to transformation pipeline |
| **Custom AI prompt** | Override default prompts with workspace-specific versions |
| **Webhook plugins** | Custom logic on platform events |
| **Plugin registry** | Browse and install community plugins |
| **Plugin SDK** | Python + TypeScript SDK for building plugins |

### 27.6 Spreadsheet Integrations

| Integration | Feature |
|---|---|
| **Excel Add-in** | Pull live query results into Excel, refresh on demand |
| **Google Sheets Add-on** | Pull dataset into sheet, scheduled auto-refresh |
| **Sheets formula** | `=DATAMIND("SELECT SUM(revenue) FROM orders")` |
| **Push to Sheets** | Reverse ETL: push query result to specific sheet range |
| **Airtable sync** | Two-way sync between platform dataset and Airtable base |

### 27.7 Third-Party Integrations

| Platform | Integration |
|---|---|
| **Zapier** | Trigger Zap on alert, query result, report send |
| **Make (Integromat)** | Full module with all platform actions |
| **n8n** | Self-hosted workflow automation node |
| **dbt Cloud** | Trigger runs, import models, sync lineage |
| **Airflow** | Trigger DAGs, receive completion webhooks |
| **Prefect** | Flow integration for data pipeline orchestration |
| **GitHub Actions** | CI/CD actions for semantic layer validation |
| **Terraform** | Provision workspaces, connections, users as code |

---

## 28. Platform Operations & Governance

### 28.1 Usage Analytics (Admin)

| Feature | Detail |
|---|---|
| **Active users** | DAU/WAU/MAU by workspace |
| **Query volume** | Queries per hour/day, by user, by source |
| **Popular assets** | Most viewed dashboards, most queried datasets |
| **Dead assets** | Assets with no views in 30/60/90 days |
| **AI usage** | AI queries per day, accuracy rate, self-correction rate |
| **Feature adoption** | Which features are used vs not used |
| **User journey** | Funnel: connected source → created dataset → created dashboard |
| **Error rate** | Query failures, connection errors, alert failures |
| **Response time** | P50/P95/P99 query latency by source |

### 28.2 Cost Management

| Feature | Detail |
|---|---|
| **BigQuery cost tracking** | Bytes scanned per query, cost per user, cost per dashboard |
| **Snowflake credit tracking** | Credits consumed per query, per warehouse |
| **Redshift cost** | WLM queue utilisation, query cost estimate |
| **Cost per user** | Attribute cloud costs to individual users |
| **Cost budget** | Set monthly budget per data source, alert on approach |
| **Cost anomaly** | Alert if a single query exceeds N bytes/credits |
| **Cost optimisation tips** | AI suggests partitioning, clustering, materialisation to cut costs |
| **AI API cost** | Track LLM API spend per workspace, per user |

### 28.3 Query Governance

| Feature | Detail |
|---|---|
| **Query approval** | Optional: queries against production sources require approval |
| **Query review queue** | Admin reviews and approves/rejects pending queries |
| **Sensitive table flag** | Mark tables as sensitive — require justification to query |
| **Query tagging** | Auto-tag queries by type (report, exploration, export) |
| **Data access request** | User requests access to a restricted source — workflow |
| **Access expiry** | Grant temporary access that auto-expires |
| **Query budget** | Per-user daily query budget (rows scanned or cost) |

### 28.4 Audit Log

| Feature | Detail |
|---|---|
| **All events captured** | Login, logout, query run, export, share, dashboard change |
| **Searchable** | Filter by user, action type, resource, date range |
| **Export** | Download as CSV or JSON |
| **Retention** | Configurable retention period (default 1 year) |
| **Tamper-proof** | Append-only log, cannot be edited or deleted |
| **Alert on suspicious** | Alert on login from new country, bulk export, after-hours access |
| **Compliance report** | Pre-built report: who accessed what data in a period |

### 28.5 Maintenance & Health

| Feature | Detail |
|---|---|
| **System health dashboard** | CPU, memory, disk, worker queue depth, DB pool status |
| **Connection health** | Per-connection uptime, latency, error rate |
| **Worker monitoring** | Celery worker count, queue length, failed jobs |
| **Scheduled job monitor** | All scheduled jobs with last run status + next run |
| **Error log** | Platform-wide error log with severity and stack trace |
| **Maintenance mode** | Put platform in read-only or offline mode for upgrades |
| **Backup** | Scheduled automated backup of platform database |
| **Restore** | Restore from backup with preview |
| **Update notifications** | In-app notification of available platform updates |

---

## 29. UX, Accessibility & Internationalization

### 29.1 Themes & Branding

| Feature | Detail |
|---|---|
| **Dark / light mode** | Per-user preference, auto-detect from OS |
| **Custom theme** | Custom primary color, font, border radius |
| **White-label** | Replace logo, app name, favicon, login page branding |
| **Custom domain** | Serve platform on your own domain |
| **Custom login page** | Custom background, welcome message |
| **Dashboard themes** | Per-dashboard color theme overriding global |
| **Chart color palettes** | Define custom color palettes for charts |
| **Dense / comfortable** | UI density toggle for data-heavy vs comfortable views |

### 29.2 Accessibility (WCAG 2.1 AA)

| Feature | Detail |
|---|---|
| **Keyboard navigation** | Full platform navigable by keyboard only |
| **Focus indicators** | Visible focus rings on all interactive elements |
| **Screen reader** | ARIA labels on all charts, tables, dialogs |
| **Color blind modes** | Deuteranopia, Protanopia, Tritanopia chart palette modes |
| **High contrast** | High contrast theme option |
| **Text scaling** | UI responds correctly to browser text size increase |
| **Alt text on charts** | AI-generated alt text for chart images |
| **Skip links** | Skip to main content link for keyboard users |

### 29.3 Internationalization (i18n)

| Feature | Detail |
|---|---|
| **UI language** | English, Spanish, French, German, Portuguese, Japanese, Chinese, Hindi |
| **Date formats** | Per-locale date/time formatting |
| **Number formats** | Per-locale thousands separator and decimal |
| **Currency** | Per-workspace currency symbol and formatting |
| **Right-to-left (RTL)** | Arabic, Hebrew UI layout support |
| **Timezone** | Per-user timezone, shown on all timestamps |

### 29.4 Mobile & PWA

| Feature | Detail |
|---|---|
| **Responsive dashboards** | Dashboards auto-reflow for mobile screen widths |
| **Mobile breakpoints** | Separate layout per breakpoint (desktop/tablet/mobile) |
| **PWA** | Installable as app on iOS and Android |
| **Offline mode** | View last-cached dashboards without internet |
| **Touch interactions** | Tap/swipe on charts, pinch-zoom on maps |
| **Mobile notifications** | Push notifications for alerts via PWA |
| **Mobile SQL editor** | Basic query execution on mobile |

### 29.5 Performance UX

| Feature | Detail |
|---|---|
| **Skeleton loaders** | Loading placeholders instead of blank charts |
| **Progressive rendering** | Charts render as data arrives, not all-at-once |
| **Optimistic updates** | UI updates immediately, syncs in background |
| **Infinite scroll** | Dataset previews and history load incrementally |
| **Lazy loading** | Off-screen dashboard widgets load on scroll |
| **Query progress** | Live progress indicator for long-running queries |

---

## 30. Advanced Analysis Types

### 30.1 Cohort Analysis

| Feature | Detail |
|---|---|
| **Cohort definition** | Define cohort by any event (sign-up date, first purchase, etc.) |
| **Retention grid** | Heatmap showing % retained per week/month after cohort creation |
| **Cohort size** | Size of each cohort shown in first column |
| **Time granularity** | Day / week / month cohorts |
| **Metric selection** | Any metric (retained users, revenue, sessions) |
| **Comparison** | Compare two cohorts side by side |
| **CSV export** | Export full cohort grid |

### 30.2 Funnel Analysis

| Feature | Detail |
|---|---|
| **Step definition** | Define funnel steps as SQL events or user actions |
| **Conversion rate** | % conversion between each step |
| **Drop-off %** | Absolute and relative drop-off per step |
| **Time to convert** | Average time between steps |
| **Segment breakdown** | Funnel by dimension (device, country, plan) |
| **Date range** | Filter funnel to specific time period |
| **Trend** | Funnel conversion over time (is it improving?) |

### 30.3 A/B Test Result Viewer

| Feature | Detail |
|---|---|
| **Experiment definition** | Name, control, variants, start/end date |
| **Metrics** | Primary + guardrail metrics |
| **Statistical significance** | p-value, confidence interval, z-score |
| **Lift** | % improvement vs control per variant |
| **Sample size** | Exposure count per variant |
| **Segment breakdown** | Results split by user segment |
| **Verdict** | AI-generated recommendation: ship / iterate / reject |

### 30.4 Financial Analysis Views

| Feature | Detail |
|---|---|
| **P&L statement view** | Revenue / Cost / Gross Profit / EBITDA table format |
| **Balance sheet view** | Assets / Liabilities / Equity formatted view |
| **Waterfall chart** | Bridge chart showing movement between two values |
| **Variance analysis** | Actual vs budget with variance column |
| **Period-over-period** | Automatic MoM, QoQ, YoY comparison columns |
| **Rolling averages** | 7-day, 30-day, 90-day rolling average on any metric |

### 30.5 Geospatial Analysis

| Feature | Detail |
|---|---|
| **Choropleth** | Country / state / city fill by metric |
| **Bubble map** | Sized bubbles on map per location |
| **Point map** | Scatter points with hover detail |
| **Route map** | Lines between origin-destination pairs |
| **Density heatmap** | Geographic density heatmap |
| **Geo filter** | Draw polygon on map → filter data to that region |
| **Geocoding** | Auto-geocode address/city/country columns to lat/lng |
| **Basemap options** | Streets / satellite / terrain / dark / light |
| **Clustering** | Auto-cluster overlapping points at low zoom |

### 30.6 Network & Relationship Analysis

| Feature | Detail |
|---|---|
| **Network graph** | Nodes + edges visualisation from two-column query |
| **Node sizing** | Size nodes by metric (e.g. revenue, connections) |
| **Edge weight** | Edge thickness by value |
| **Layout algorithms** | Force-directed, circular, hierarchical |
| **Click to filter** | Click a node → filter connected edges |
| **Community detection** | Auto-colour nodes by detected cluster |
| **Export** | Export graph as PNG or adjacency list CSV |

---

## Appendix A: Competitive Feature Matrix

| Feature | DataMind | Grafana | Power BI | Superset | WrenAI | Tableau | Metabase |
|---|---|---|---|---|---|---|---|
| Text-to-SQL AI | Yes | No | Copilot (basic) | No | Yes | Einstein (basic) | Yes (basic) |
| Semantic layer | Yes (auto-bootstrap) | No | Yes (manual) | No | Yes (manual) | Yes (manual) | No |
| SQL editor | Yes (Monaco) | Yes | No | Yes | No | No | Yes |
| 40+ chart types | Yes | Yes | Yes | Yes | Basic | Yes | Yes |
| Dashboard builder | Yes (PowerBI-style) | Yes | Yes | Yes | No | Yes | Yes |
| KPI monitoring | Yes | Yes | Yes | Partial | No | No | Partial |
| Alerts | Yes | Yes | Yes | Partial | No | Partial | Partial |
| Data lineage | Yes (column-level) | No | Partial | Partial | No | Partial | No |
| Reports (scheduled) | Yes | Yes | Yes | Yes | No | Yes | Yes |
| REST API connectors | Yes | No | No | No | No | No | No |
| Cloud storage (S3/GCS) | Yes | Partial | Yes | Partial | No | Yes | No |
| Streaming sources | Yes | Yes | No | No | No | No | No |
| Row-level security | Yes | No | Yes | Yes | No | Yes | Yes |
| Data catalog | Yes | No | Partial | No | No | Yes | No |
| Data quality checks | Yes | No | No | No | No | No | No |
| Schema drift detection | Yes | No | No | No | No | No | No |
| No-code query builder | Yes | No | Yes | No | No | Yes | Yes |
| Transformation UI | Yes | No | Yes (Power Query) | No | No | Prep (separate) | No |
| dbt integration | Yes | No | Partial | Partial | No | Partial | Yes |
| Forecasting (AI) | Yes | Partial | Yes | No | No | Yes | No |
| Anomaly detection (ML) | Yes | Partial | Partial | No | No | No | No |
| AI-generated insights | Yes | No | Copilot | No | Partial | No | No |
| AI dashboard builder | Yes | No | Copilot | No | No | No | No |
| Reverse ETL | Yes | No | No | No | No | No | No |
| User subscriptions | Yes | No | Yes | No | No | Yes | Partial |
| CLI tool | Yes | No | No | No | No | No | No |
| Python SDK | Yes | Yes | No | No | No | No | No |
| Git integration | Yes | Yes | No | No | No | No | No |
| Plugin system | Yes | Yes | Yes | Yes | No | Yes | No |
| Excel/Sheets add-in | Yes | No | Yes | No | No | Yes | No |
| Cohort analysis | Yes | No | Partial | No | No | Partial | Yes |
| Funnel analysis | Yes | No | No | No | No | No | Yes |
| A/B test viewer | Yes | No | No | No | No | No | No |
| Geospatial analysis | Yes | Partial | Yes | Yes | No | Yes | Partial |
| Network graph | Yes | No | No | No | No | Partial | No |
| Usage analytics | Yes | No | Yes | No | No | Yes | Partial |
| Cost management | Yes | No | Partial | No | No | No | No |
| WCAG 2.1 accessible | Yes | Partial | Partial | No | No | Partial | Partial |
| Multi-language (i18n) | Yes | Partial | Yes | No | No | Yes | Partial |
| Mobile PWA | Yes | Partial | Yes | No | No | Yes | No |
| Self-hosted | Yes | Yes | No | Yes | Yes | No | Yes |
| Open source | Core | Yes | No | Yes | Yes | No | Yes |
| AI self-correction loop | Yes | No | No | No | No | No | No |
| Column value sampling | Yes | No | No | No | No | No | No |
| Cold-start bootstrap | Yes | N/A | N/A | N/A | No | N/A | N/A |
| Accuracy (text-to-SQL) | 82–88% | N/A | ~60% | N/A | 72–78% | ~55% | ~65% |

---

## Appendix B: Section Summary

| # | Section | Key Capabilities |
|---|---|---|
| 1 | Executive Summary | Platform overview, 10 core pillars |
| 2 | System Architecture | Backend services, infrastructure diagram |
| 3 | Data Sources | 10 categories: RDBMS, warehouses, NoSQL, S3, APIs, files, streaming, cloud |
| 4 | Dataset Management | Virtual + physical datasets, profiling, RLS, computed columns |
| 5 | SQL Editor | Monaco, multi-tab, autocomplete, explain plan, AI assist, history |
| 6 | Semantic Layer | Auto-bootstrap, metrics, glossary, FK graph, cold-start solved |
| 7 | AI Chat & Text-to-SQL | 8-step pipeline, self-correction, few-shot learning, multi-turn |
| 8 | Dashboard Builder | PowerBI-style layout, 18 widget types, cross-filtering, drill-down |
| 9 | Chart Library | 40+ chart types across all categories |
| 10 | KPI Monitoring | Threshold + ML anomaly alerts, 9 notification channels |
| 11 | Reports | Template builder, AI narrative, scheduled delivery |
| 12 | Data Lineage | Column-level DAG, impact analysis, React Flow |
| 13 | User Management | SAML/LDAP/OAuth, MFA, RBAC, RLS, column-level security |
| 14 | Collaboration | Sharing, comments, versioning, annotations |
| 15 | Settings | Org, workspace, AI, data source, notification, system settings |
| 16 | Security | AES-256, TLS, PII masking, GDPR/SOC2/HIPAA compliance |
| 17 | Performance | Result cache, semantic cache, query optimisation, async queries |
| 18 | API Layer | REST API, embedding API, webhook events |
| 19 | Tech Stack | FastAPI, Next.js, PostgreSQL, pgvector, Redis, Celery |
| 20 | Build Phases | 7 phases, 21 weeks to production |
| 21 | Data Discovery | Global search, asset catalog, business glossary, discovery feed |
| 22 | Data Quality | Quality checks, freshness SLAs, schema drift, data contracts |
| 23 | Transformation | No-code builder, Power Query–style UI, dbt integration, notebooks |
| 24 | Advanced AI | Forecasting, ML anomaly, AI dashboard builder, NL filters |
| 25 | Reverse ETL | Push to Salesforce, HubSpot, Slack, Sheets, S3, webhooks |
| 26 | Subscriptions | Self-service alerts, metric subscriptions, digest notifications |
| 27 | Developer Tools | CLI, Python SDK, JS SDK, Git integration, plugins, spreadsheet add-ins |
| 28 | Platform Ops | Usage analytics, cost management, query governance, audit log |
| 29 | UX / Accessibility | Themes, white-label, WCAG 2.1, i18n 8 languages, mobile PWA |
| 30 | Advanced Analysis | Cohort, funnel, A/B test, financial views, geospatial, network graph |

---

*Document version 2.0 — DataMind Platform Requirements — 30 sections, 300+ features*
