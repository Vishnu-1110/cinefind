"""Validated API response and local profile payload schemas."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

PositiveGenreId = Annotated[int, Field(gt=0)]

class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["connected"]
    environment: str

class PreferenceUpdate(BaseModel):
    preferred_media_type: Literal["movie", "tv", "both"] = "both"
    movie_genre_ids: list[PositiveGenreId] = Field(default_factory=list, max_length=30)
    tv_genre_ids: list[PositiveGenreId] = Field(default_factory=list, max_length=30)
    favorite_moods: list[str] = Field(default_factory=list, max_length=20)

class PreferenceResponse(PreferenceUpdate):
    model_config = ConfigDict(from_attributes=True)
    profile_id: str

class SavedTitleCreate(BaseModel):
    media_type: Literal["movie", "tv"]
    tmdb_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=300)
    poster_path: str | None = Field(default=None, max_length=512)
    release_date: str | None = Field(default=None, max_length=10)
    rating: float | None = Field(default=None, ge=0, le=10)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Title must contain at least one non-space character.")
        return title

class SavedTitleResponse(SavedTitleCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    profile_id: str
