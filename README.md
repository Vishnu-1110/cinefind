# CineFind

CineFind is a movie and TV discovery project. The current React application is in `frontend/`; the FastAPI service and its SQLite development configuration are in `backend/`.

## Run the React frontend locally

From the repository folder, open a terminal and run:

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm run dev
```

Vite prints the local website address, normally `http://127.0.0.1:5173/`.

## Run the FastAPI backend locally

In a second terminal:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set `TMDB_BEARER_TOKEN` in the private `backend/.env` file. Do not commit `.env` or put the token in a `VITE_` variable. Start the service on port 8001, which matches `frontend/.env.example`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

The health endpoint is `http://127.0.0.1:8001/api/health`; API documentation is at `/docs`.

## GitHub Pages and backend hosting

The root HTML files remain in place as a rollback copy. The React/Vite frontend is deployed from `frontend/` to the repository Pages path by `.github/workflows/deploy-pages.yml`. GitHub Pages cannot run FastAPI or host a persistent SQLite database; the API runs separately on Render and PostgreSQL is hosted by Supabase.

The local SQLite database, virtual environments, build output, dependencies, backups, and private environment files are excluded by `.gitignore`. Example environment files contain placeholders only.

For the Supabase, Render, and GitHub Pages setup, see [DEPLOYMENT.md](DEPLOYMENT.md). The Pages workflow is manual so it can be run after configuring GitHub Pages to use GitHub Actions.
