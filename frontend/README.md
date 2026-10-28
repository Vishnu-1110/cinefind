# CineFind React frontend

This is the Vite + React frontend for CineFind. The original HTML/CSS/JavaScript files remain in the project root as a rollback copy while this migration is checked.

## Requirements

Install Node.js 20.19 or newer (or 22.12 or newer) so Node and npm are available in PowerShell.

## Local development

Open two PowerShell terminals.

### Terminal 1: React and Vite

    cd "C:\Users\LENOVO T495\Documents\Codex\2026-10-25\referenced-chatgpt-conversation-this-is-an\frontend"
    npm install
    npm run dev

Vite serves the website at http://127.0.0.1:5173 and the Mood Discovery page at http://127.0.0.1:5173/mood.html.

The frontend API address is read from VITE_API_BASE_URL. The example and local ignored .env file point to http://127.0.0.1:8001 for the current backend setup. Keep secrets out of all VITE_ variables.

### Terminal 2: FastAPI

    cd "C:\Users\LENOVO T495\Documents\Codex\2026-10-25\referenced-chatgpt-conversation-this-is-an\backend"
    .\.venv\Scripts\Activate.ps1
    python -m uvicorn app.main:app --reload --port 8001

FastAPI docs are at http://127.0.0.1:8001/docs. Its health check is http://127.0.0.1:8001/api/health.

If PowerShell blocks virtual-environment activation, use this for the current terminal only, then activate again:

    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\.venv\Scripts\Activate.ps1

## TMDB credentials

The React code calls the local FastAPI TMDB proxy. The existing read-only bearer token is kept in the ignored backend/.env file and is not included in the Vite frontend environment or browser request source. Never add TMDB tokens or database credentials to a VITE_ variable.

## Saved data and accounts

Likes, Watchlist, and recommendation preferences continue to use this browser's localStorage, matching the existing site's behavior. They are not synced across devices and are not currently written to the backend database. Login and Sign Up remain validation-only UI; no authentication service is configured.

## Build

    npm run build

The production files are written to frontend/dist. The root project .gitignore excludes local environments, local database files, node_modules, and build output.
