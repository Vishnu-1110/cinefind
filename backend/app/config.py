"""Environment-based application settings."""
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]

class Settings(BaseSettings):
    app_name: str = "CineFind API"
    app_env: str = "development"
    database_url: str = "sqlite:///./cinefind.db"
    tmdb_bearer_token: str = ""
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
