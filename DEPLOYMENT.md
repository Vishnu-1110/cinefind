# CineFind online deployment

## Current state

The repository contains a React/Vite frontend and a FastAPI backend. The backend can use SQLite locally or PostgreSQL through `DATABASE_URL`; it keeps SQLite for local development. No local database was copied, deleted, or migrated.

The Render service is live at `https://cinefind-ruoi.onrender.com`. Its `/api/health` endpoint has been verified to return `status: ok`, `database: connected`, and `environment: production`. The TMDB proxy was still unconfigured at the last check; add the rotated token privately in Render before publishing the frontend.

## Supabase database

1. In Supabase, open the CineFind project and choose **Connect**.
2. For a persistent Render service on an IPv4 network, choose the **Session pooler** connection method and use its connection string. Supabase documents Session mode for IPv4-only persistent backends. Use the hostname, port, and username Supabase provides; do not construct the pooler address yourself.
3. In Render, save this as the private `DATABASE_URL` environment variable. Keep the URL's `sslmode=require` query setting. Percent-encode reserved characters in the database password if the URI requires it.
4. Do not paste the connection string into chat, frontend variables, or repository files.

The application creates missing tables on startup with SQLAlchemy `create_all`; it does not drop existing tables. The project currently has no Alembic migration history. Do not point it at a populated database until its schema and data have been inspected and any migration has been approved.

## Render FastAPI service

Create or inspect a **Web Service** connected to `Vishnu-1110/cinefind`, branch `main`:

- Root directory: `backend`
- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set these in the Render service's Environment settings:

- `APP_ENV` = `production`
- `DATABASE_URL` = the private Supabase Session pooler URL
- `FRONTEND_ORIGINS` = `https://vishnu-1110.github.io,http://127.0.0.1:5173,http://localhost:5173`
- `TMDB_BEARER_TOKEN` = the rotated TMDB read token, entered privately in Render

If the Pages origin differs, use its exact origin (scheme and host, no path) in `FRONTEND_ORIGINS`. The current API is `https://cinefind-ruoi.onrender.com`; its health endpoint and docs are `/api/health` and `/docs`.

## GitHub Pages frontend

The repository had no Pages workflow. The current project Pages URL was verified as `https://vishnu-1110.github.io/cinefind/`; the account-root URL returns 404. A manual workflow has now been added at `.github/workflows/deploy-pages.yml`, and Vite is configured with the `/cinefind/` base path. The existing root HTML files remain unchanged as a rollback copy.

After adding the rotated TMDB token in Render:

1. In repository **Settings → Pages**, set the build and deployment source to **GitHub Actions**.
2. In **Actions**, run **Deploy CineFind to GitHub Pages** using `main`.
3. The workflow builds `frontend/` with `pnpm install --frozen-lockfile` and `pnpm run build`, sets the public Render API origin as `VITE_API_BASE_URL`, and publishes `frontend/dist`.
4. Verify `https://vishnu-1110.github.io/cinefind/` after the workflow succeeds.

Never put database credentials or TMDB bearer tokens in `VITE_` variables. The frontend now refuses to send API requests to localhost in a production build if `VITE_API_BASE_URL` is missing.

## Local development

Keep `backend/.env` and `frontend/.env` private. For local backend development, retain the SQLite URL and local `FRONTEND_ORIGINS` from `.env.example`. See the root README for local start commands.

## Current limitations

- The account forms now call the existing FastAPI signup/login routes and use the backend's HttpOnly session cookie. Cross-site cookies require HTTPS and browser third-party cookie support; a custom domain that keeps the frontend and API same-site is more reliable.
- Watchlist, Likes, recommendation preferences, and feedback currently remain in browser `localStorage`. Although backend profile endpoints exist, those frontend features are not yet synchronized to the database across devices.
- Likes, Watchlist, recommendation preferences, and feedback remain browser-local and do not sync across devices.
- Existing SQLite data is not copied to Supabase.
