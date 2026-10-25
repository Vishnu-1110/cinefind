"""Local account, preference, and saved-title database models."""
from datetime import datetime
from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

class UserPreference(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (CheckConstraint("preferred_media_type IN ('movie', 'tv', 'both')", name="ck_user_preferences_media_type"),)
    profile_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    preferred_media_type: Mapped[str] = mapped_column(String(10), nullable=False, default="both", server_default="both")
    movie_genre_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    tv_genre_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    favorite_moods: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

class SavedTitle(Base):
    __tablename__ = "saved_titles"
    __table_args__ = (
        UniqueConstraint("profile_id", "media_type", "tmdb_id", name="uq_saved_titles_profile_media_tmdb"),
        CheckConstraint("media_type IN ('movie', 'tv')", name="ck_saved_titles_media_type"),
        CheckConstraint("rating IS NULL OR (rating >= 0 AND rating <= 10)", name="ck_saved_titles_rating"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[str] = mapped_column(String(64), ForeignKey("user_preferences.profile_id", ondelete="CASCADE"), nullable=False)
    media_type: Mapped[str] = mapped_column(String(10), nullable=False)
    tmdb_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    poster_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    release_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

class UserAccount(Base):
    __tablename__ = "user_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
