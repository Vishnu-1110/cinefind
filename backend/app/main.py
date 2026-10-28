"""CineFind's local FastAPI application."""
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from urllib.error import HTTPError, URLError
from urllib.request import Request as URLRequest, urlopen
import re
from pathlib import Path
from sqlalchemy.exc import SQLAlchemyError
from .auth import router as auth_router
from .config import settings
from .database import check_database_connection, initialize_database
from .routes import router as profile_router
from .schemas import DiscoveryParseRequest, DiscoveryParseResponse, HealthResponse
from .discovery import parse_discovery_query

logger = logging.getLogger("cinefind.backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create missing tables, including account and session tables."""
    try:
        initialize_database()
    except SQLAlchemyError:
        logger.warning("Database initialization failed; health check will report the issue.")
    yield

app = FastAPI(
    title=settings.app_name,
    description="Local CineFind API for account sign-in, Watchlist, and preferences.",
    version="10.2.0",
    lifespan=lifespan,
)
app.include_router(auth_router)
app.include_router(profile_router)

# Restrict credentialed browser access to local development origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500", "http://localhost:5500",
        "http://127.0.0.1:5173", "http://localhost:5173",
    ],
    allow_origin_regex=r"^http://(127\.0\.0\.1|localhost)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
def health_check() -> HealthResponse:
    """Report API status and verify the configured database is reachable."""
    try:
        check_database_connection()
    except SQLAlchemyError:
        logger.warning("Database health check failed.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The backend is running, but the database is unavailable.",
        ) from None
    return HealthResponse(status="ok", database="connected", environment=settings.app_env)

@app.post("/api/discovery/parse", response_model=DiscoveryParseResponse, tags=["Discovery"])
def parse_discovery(payload: DiscoveryParseRequest) -> DiscoveryParseResponse:
    """Turn a natural-language discovery query into safe structured filters."""
    return parse_discovery_query(payload.query)


@app.get("/api/tmdb/{tmdb_path:path}", include_in_schema=False)
def proxy_tmdb(tmdb_path: str, request: Request) -> Response:
    """Forward allowed read-only TMDB requests without exposing its bearer token."""
    if not settings.tmdb_bearer_token:
        raise HTTPException(status_code=503, detail="TMDB is not configured on this local server.")
    if not re.fullmatch(r"[A-Za-z0-9_/-]+", tmdb_path) or ".." in tmdb_path:
        raise HTTPException(status_code=404, detail="TMDB endpoint not found.")
    allowed_prefixes = ("movie/", "tv/", "search/", "discover/", "trending/", "genre/", "watch/providers", "configuration/", "person/", "keyword/")
    if not tmdb_path.startswith(allowed_prefixes):
        raise HTTPException(status_code=404, detail="TMDB endpoint not found.")

    upstream_url = "https://api.themoviedb.org/3/" + tmdb_path
    if request.url.query:
        upstream_url += "?" + request.url.query
    upstream_request = URLRequest(
        upstream_url,
        headers={"Authorization": "Bearer " + settings.tmdb_bearer_token, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urlopen(upstream_request, timeout=20) as upstream:
            return Response(content=upstream.read(), status_code=upstream.status, media_type="application/json")
    except HTTPError as error:
        return Response(content=error.read(), status_code=error.code, media_type="application/json")
    except URLError:
        logger.warning("TMDB upstream request failed.")
        raise HTTPException(status_code=502, detail="TMDB is temporarily unavailable.") from None
# Serve only the existing website files; keep the database, .env, and backups private.
FRONTEND_DIR = Path(__file__).resolve().parents[2]
WEB_FILES = {"index.html", "mood.html", "style.css", "mood.css", "script.js", "mood.js", "profile-sync.js", "account-ui.js"}

@app.get("/", include_in_schema=False)
def serve_homepage():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/{file_name}", include_in_schema=False)
def serve_website_file(file_name: str):
    if file_name not in WEB_FILES:
        raise HTTPException(status_code=404, detail="Website file not found.")
    return FileResponse(FRONTEND_DIR / file_name)