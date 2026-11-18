# DataMind

A self-hosted data visualisation and BI app. Connect a database or upload a file, write SQL, build charts and dashboards, ask questions in plain English (AI), and set up KPI alerts and scheduled reports.

| Part | Tech | Default URL |
|---|---|---|
| Frontend | Next.js 14 (Node 20) | http://localhost:3000 |
| Backend API | FastAPI (Python 3.11) | http://localhost:8000 (interactive docs at `/docs`) |
| App database | PostgreSQL 15+ | localhost:5432 |

There are two ways to install it:

- **[Option A: with Docker](#option-a-with-docker-recommended)** (recommended). One command starts everything, and it works the same on Windows, macOS and Linux.
- **[Option B: without Docker](#option-b-without-docker)**. You run PostgreSQL, the backend and the frontend yourself.

---

## Get the code

```bash
git clone https://github.com/bhushanj221/dataminds.git
cd dataminds
```

## Configure `.env` (both options)

Copy the example file:

```bash
cp .env.example .env              # macOS / Linux
Copy-Item .env.example .env       # Windows PowerShell
```

Then open `.env` and set at least these values:

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | Any password for the app database |
| `JWT_SECRET_KEY` | A long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ENCRYPTION_KEY` | **Required.** A Fernet key: `python -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"` |
| `LLM_API_KEY` | Optional. Your Anthropic or OpenAI key, to turn on the AI features |

If you don't have Python installed, `openssl rand -hex 32` works for `JWT_SECRET_KEY`, and `openssl rand -base64 32 | tr '+/' '-_'` works for `ENCRYPTION_KEY`.

> Keep `ENCRYPTION_KEY` the same once you start using the app. If you change it, any data-source passwords already saved can no longer be decrypted.

---

## Option A: with Docker (recommended)

### Prerequisites

- **Windows / macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/). Start it and wait until it says it is running.
- **Linux:** Docker Engine with the Compose plugin (`docker compose version` should work).

### Start

From the project folder (where `docker-compose.yml` is):

```bash
docker compose up -d --build
```

The first build takes about 10–20 minutes because it downloads the base images and installs all the Python and Node packages. Later starts take seconds.

To check that it's up:

```bash
docker compose ps                # all three services should be "Up"; postgres "healthy"
docker compose logs -f backend   # Ctrl+C to stop following
```

### Use it

1. Open http://localhost:3000/register and create an account. Each new sign-up gets its own workspace and is its admin.
2. Sign in. The first visit to each page can take 10–30 seconds, because dev mode compiles pages on demand.

This dev setup mounts your source code into the containers, so backend and frontend changes reload automatically.

### Stop / reset

```bash
docker compose down        # stop (data is kept)
docker compose down -v     # stop AND delete the database and uploaded files
```

### Production build (Docker)

`docker-compose.prod.yml` builds optimised images: the code is baked in, there's no hot reload, and pages are precompiled.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- Don't run the dev and prod stacks at the same time, because they use the same ports.
- `NEXT_PUBLIC_API_URL` is baked into the frontend at build time. If you serve the app from a real domain, set it in `.env` (for example `NEXT_PUBLIC_API_URL=https://api.example.com`) and rebuild. Also add that frontend origin to `allow_origins` in `backend/app/main.py`, which only allows `http://localhost:3000` by default.
- Run exactly **one** backend container or process. Alerts and scheduled reports run inside the backend, so extra replicas or `--workers` would send them twice.

---

## Option B: without Docker

### Prerequisites

- **Python 3.11** (the version the Docker image uses)
- **Node.js 20** and npm
- **PostgreSQL 15 or newer.** Plain PostgreSQL is fine; no extensions are needed.

### 1. Create the database

Connect as the Postgres superuser (`psql -U postgres`) and run the following. Use the same password you put in `.env`.

```sql
CREATE USER datamind WITH PASSWORD 'change-me';
CREATE DATABASE datamind OWNER datamind;
```

You don't need to run migrations. The backend creates and updates its tables automatically when it starts.

### 2. Make sure the upload folder can be created

The backend stores uploaded files (CSV, Excel and so on) in `/data/uploads`. This path is set in `backend/app/services/ingest.py`, and the backend creates the folder when it starts.

- **Windows:** nothing to do. The path resolves to `\data\uploads` on the drive you start the backend from (for example `E:\data\uploads`).
- **Linux:** create it once and give yourself ownership:
  ```bash
  sudo mkdir -p /data/uploads && sudo chown "$USER" /data/uploads
  ```
- **macOS:** the system root is read-only, so `/data` can't be created. Use Docker (Option A), or change `UPLOAD_DIR` in `backend/app/services/ingest.py` to a folder you own.

### 3. Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate             # Windows
source .venv/bin/activate          # macOS / Linux
pip install -r requirements.txt
```

The backend reads its settings from a `.env` file in the folder you start it from (`backend/`). Create `backend/.env` with the same values as the root `.env`, plus a `DATABASE_URL`:

```env
DATABASE_URL=postgresql://datamind:change-me@localhost:5432/datamind
JWT_SECRET_KEY=<same as root .env>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
ENCRYPTION_KEY=<same as root .env>
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_PLATFORM_DAILY_LIMIT=50
```

Start it:

```bash
uvicorn app.main:app --reload --port 8000
```

Check http://localhost:8000/health. It should return `{"status":"ok","service":"datamind-api"}`.

For production, drop `--reload`, and don't add `--workers` (see the note about the alert poller above).

### 4. Run the frontend

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000/register and create your account.

The frontend forwards every `/api/*` request to `http://localhost:8000` (see `frontend/next.config.js`). If your backend runs somewhere else, create `frontend/.env.local` with:

```env
BACKEND_URL=http://your-backend-host:8000
```

For production: `npm run build`, then `npm run start`.

---

## Configuration reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Docker only | none | App database that Docker Compose creates |
| `DATABASE_URL` | Without Docker | none (Docker builds it for you) | `postgresql://user:password@host:5432/dbname` |
| `JWT_SECRET_KEY` | Yes | none | Signs login tokens |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | No | `60` | How long a login stays valid |
| `ENCRYPTION_KEY` | Yes | none | Fernet key that encrypts saved data-source passwords |
| `LLM_PROVIDER` | No | `anthropic` | `anthropic`, `openai` or `ollama` |
| `LLM_API_KEY` | No | blank (AI off) | Platform-wide AI key; users can also bring their own key in Settings |
| `LLM_MODEL` | No | provider default | Override the model name |
| `LLM_BASE_URL` | No | blank | For Ollama or OpenAI-compatible endpoints |
| `LLM_PLATFORM_DAILY_LIMIT` | No | `50` | AI questions per user per day on the platform key |
| `NEXT_PUBLIC_API_URL` | No | Docker: `http://localhost:8000`; without Docker: unset | Where the browser calls the API. If unset, the browser goes through the frontend's own `/api` proxy |
| `BACKEND_URL` | No | `http://localhost:8000` | Where the frontend server forwards `/api/*` |

---

## Troubleshooting

**"Port is already allocated" / "address already in use" on 5432, 8000 or 3000.**
Another program is using that port. Port 5432 is often a PostgreSQL already installed on your machine. In `docker-compose.yml`, change the **left** number of that port mapping, for example `"5433:5432"` for Postgres. The backend talks to Postgres over Docker's internal network, so it doesn't need any other change.

**The backend exits at startup with `Fernet key must be 32 url-safe base64-encoded bytes`.**
`ENCRYPTION_KEY` is empty or invalid. Generate one with the command in [Configure `.env`](#configure-env-both-options).

**The backend can't connect to the database (without Docker).**
Check that PostgreSQL is running and that the user, password, host and database in `DATABASE_URL` match what you created in step 1.

**API calls fail with a CORS error in the browser.**
The backend only accepts browser calls from `http://localhost:3000`. Run the frontend on port 3000, or leave `NEXT_PUBLIC_API_URL` unset so the browser goes through the frontend's `/api` proxy. Otherwise, add your origin to `allow_origins` in `backend/app/main.py`.

**AI features say they aren't configured.**
Set `LLM_API_KEY` (and `LLM_PROVIDER` if you're not using Anthropic), then restart the backend.
