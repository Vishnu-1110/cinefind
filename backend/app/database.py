"""SQLAlchemy engine and initialization helpers."""
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import BACKEND_DIR, settings

class Base(DeclarativeBase):
    pass

def _database_url_for_local_use(raw_url: str) -> URL:
    """Select psycopg 3, require PostgreSQL SSL, and resolve local SQLite paths."""
    if raw_url.startswith("postgres://"):
        raw_url = "postgresql+psycopg://" + raw_url.removeprefix("postgres://")
    elif raw_url.startswith("postgresql://"):
        raw_url = "postgresql+psycopg://" + raw_url.removeprefix("postgresql://")
    url = make_url(raw_url)
    if url.get_backend_name() == "postgresql" and "sslmode" not in url.query:
        url = url.update_query_dict({"sslmode": "require"})
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        return url
    database_path = Path(url.database)
    if not database_path.is_absolute():
        database_path = (BACKEND_DIR / database_path).resolve()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    return url.set(database=database_path.as_posix())

database_url = _database_url_for_local_use(settings.database_url)
engine_options = {"pool_pre_ping": True}
if database_url.get_backend_name() == "sqlite":
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    engine_options.update({"pool_size": 3, "max_overflow": 2, "pool_timeout": 30})
engine = create_engine(database_url, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def initialize_database() -> None:
    """Create missing tables without dropping or resetting existing data."""
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

def check_database_connection() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
