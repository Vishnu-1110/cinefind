# CineFind

CineFind is a movie and TV discovery website with a small FastAPI backend for local account, Watchlist, preferences, and TMDB proxy requests.

## Run locally

1. Open a terminal in this project folder.
2. Install the backend requirements and create `backend/.env` from `backend/.env.example`.
3. Set `TMDB_BEARER_TOKEN` in `backend/.env` to your TMDB v4 read access token. Keep `.env` private and never commit it.
4. Start FastAPI from the `backend` folder with `python -m uvicorn app.main:app --reload`.
5. Open `http://127.0.0.1:8000/` for CineFind or `/docs` for the API documentation.

The backend serves only the website files listed in its allow-list. TMDB requests are forwarded server-side so the bearer token is not embedded in browser JavaScript.

## Local account and data note

Accounts, Watchlist items, and supported preferences are stored in the local SQLite database. Login cookies and account routes are intended for local learning only. Before exposing this API to the internet, add production authentication controls, HTTPS, rate limits, and security review. `.env`, SQLite databases, virtual environments, and local backups are excluded from Git.
