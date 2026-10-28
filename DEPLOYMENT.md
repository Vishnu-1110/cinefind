# CineFind online deployment

## Current state

The repository contains a React/Vite frontend and a FastAPI backend. The backend can use SQLite locally or PostgreSQL through `DATABASE_URL`; it keeps the SQLite database when that variable is not changed. This guide does not copy, delete, or migrate the local database.

Cloud services cannot be provisioned from this repository. Before deployment, check whether a CineFind Supabase project and Render Web Service already exist. Reuse an existing service only after checking its current settings and data.

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
- `FRONTEND_ORIGINS` = `https://vishnu-1110.github.io`
- `TMDB_BEARER_TOKEN` = the rotated TMDB read token, entered privately in Render

If the actual Pages origin differs, use that exact origin in `FRONTEND_ORIGINS` (scheme and host, no path). After deploy, check `https://<actual-render-host>/api/health` and `/docs`. Do not assume a service URL before Render shows it.

## GitHub Pages frontend

The repository has no existing Actions workflow for Vite, and the GitHub Pages publishing settings and exact Pages URL could not be read through the available GitHub connection. The current root HTML site is preserved. Do not switch its publishing source until the intended Pages URL is confirmed.

Once the backend is live and the Pages target is confirmed:

1. Set the GitHub Actions repository variable `VITE_API_BASE_URL` to the actual Render HTTPS origin, with no trailing slash. This is a public API address, not a secret.
2. Configure GitHub Pages to publish through GitHub Actions.
3. Build `frontend/` with `pnpm install --frozen-lockfile` and `pnpm run build`; publish `frontend/dist`.
4. Use the Vite base path that matches the confirmed URL. A repository Pages URL usually includes `/cinefind/`; a user-site URL uses `/`.

Never put database credentials or TMDB bearer tokens in `VITE_` variables. The frontend now refuses to send API requests to localhost in a production build if `VITE_API_BASE_URL` is missing.

## Local development

Keep `backend/.env` and `frontend/.env` private. For local backend development, retain the SQLite URL and local `FRONTEND_ORIGINS` from `.env.example`. See the root README for local start commands.

## Current limitations

- The account forms now call the existing FastAPI signup/login routes and use the backend's HttpOnly session cookie. Cross-site cookies require HTTPS and browser third-party cookie support; a custom domain that keeps the frontend and API same-site is more reliable.
- Watchlist, Likes, recommendation preferences, and feedback currently remain in browser `localStorage`. Although backend profile endpoints exist, those frontend features are not yet synchronized to the database across devices.
- Existing SQLite data is not copied to Supabase. No cloud database or Render service has been inspected or changed in this stage.
