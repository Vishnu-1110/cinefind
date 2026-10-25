"""Shared SQLAlchemy session dependency for API routes."""
from collections.abc import Generator
from typing import Annotated
from fastapi import Depends
from sqlalchemy.orm import Session
from .database import SessionLocal

def get_database_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

DatabaseSession = Annotated[Session, Depends(get_database_session)]
