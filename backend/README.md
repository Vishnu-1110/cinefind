# CineFind local backend (Versions 10.0 and 10.1)

This folder contains the local FastAPI backend and SQLite database used by CineFind. It supports email account registration and login, account-scoped Watchlists, and supported recommendation preferences.

## Requirements

- Windows 10 or 11
- Python 3.10 or newer (check with py --version in PowerShell)
- Internet access for first-time dependency installation

## Start locally with PowerShell

Open PowerShell in the CineFind project folder, then run:

    cd backend
    py -m venv .venv
    .\.venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
    if (-not (Test-Path .env)) { Copy-Item .env.example .env } else { Write-Host '.env already exists; leaving it unchanged.' }
    python -m uvicorn app.main:app --reload

The virtual environment keeps packages separate. The .env copy is local and ignored by Git. If .env already exists, do not overwrite it; compare it with .env.example and add missing settings manually.
Set TMDB_BEARER_TOKEN in backend/.env to your TMDB v4 read access token. The website sends TMDB requests through this local API; the token stays in the ignored .env file and is never sent to the browser. Never commit backend/.env.

If PowerShell blocks activation, allow it only for the current terminal session and try activation again:

    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\.venv\Scripts\Activate.ps1

The server listens at http://127.0.0.1:8000.
Open the CineFind website at http://127.0.0.1:8000/; the same FastAPI server serves the existing HTML, CSS, and JavaScript files. The API docs remain at http://127.0.0.1:8000/docs.

## Check the API and database

- Interactive API docs: http://127.0.0.1:8000/docs
- Health endpoint: http://127.0.0.1:8000/api/health

A working setup returns JSON like:

    {"status":"ok","database":"connected","environment":"development"}

## Local data routes

These routes use a caller-provided profile ID to group preferences and saved titles. They have no authentication and should only be used while the API is bound to localhost for local development. Do not deploy or expose these routes publicly until real authentication and authorization are implemented.

- Register: POST /api/auth/signup
- Sign in: POST /api/auth/login
- Current account: GET /api/auth/me
- Sign out: POST /api/auth/logout
- Save preferences: PUT /api/profiles/{profile_id}/preferences
- Read preferences: GET /api/profiles/{profile_id}/preferences
- List saved movie/TV titles: GET /api/profiles/{profile_id}/saved-titles
- Add a saved title: POST /api/profiles/{profile_id}/saved-titles
- Remove a title: DELETE /api/profiles/{profile_id}/saved-titles/{movie-or-tv}/{tmdb_id}

FastAPI validates request bodies with Pydantic. Invalid values return HTTP 422; saving a duplicate title returns HTTP 409.

## Database and future PostgreSQL switch

The supplied V11 database is backend/cinefind.db and is preserved. The local .env and example configuration point to that file. SQLAlchemy create_all creates missing tables only; it does not drop or reset data.

The database holds accounts, expiring login sessions, preferences, and minimal movie or TV metadata for the Watchlist. Passwords are stored as salted scrypt hashes; session tokens are stored as hashes and delivered to the browser in HttpOnly cookies. No TMDB token or full TMDB catalogue is stored.

SQLite is selected by DATABASE_URL in backend/.env. The PostgreSQL driver is included for later. When deploying, set DATABASE_URL to a PostgreSQL SQLAlchemy URL such as postgresql+psycopg://... in the hosting provider's secret environment settings. Keep credentials out of source control. The frontend sends Watchlist titles and supported recommendation preferences to the local account profile after login. Likes, recommendation feedback, duration choices, and password reset remain browser-only or unavailable. These local accounts are not cloud accounts and do not sync across devices.

## Local CORS

The API allows only VS Code Live Server's usual origins on port 5500: localhost and 127.0.0.1. If Live Server uses another port, update the exact origin in app/main.py.


## Local account security

Use this account system only for local development on your own computer. It uses salted scrypt password hashes and 14-day HttpOnly session cookies. There is no email verification, password reset, login rate limiting, or production deployment security review. Do not expose this API to the internet. For a hosted launch, move accounts to a managed authentication provider or complete a production security review and enforce HTTPS.
