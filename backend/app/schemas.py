"""Validated API response and local profile payload schemas."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class DiscoveryParseRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)

    @field_validator("query")
    @classmethod
    def query_must_not_be_blank(cls, value: str) -> str:
        query = value.strip()
        if not query:
            raise ValueError("Enter a search request.")
        return query


class DiscoveryFilters(BaseModel):
    content_type: Literal["all", "movie", "tv"] = "all"
    sort_by: Literal["relevance", "rating", "popularity", "release_date"] = "relevance"
    genres: list[str] = Field(default_factory=list, max_length=8)
    year_from: int | None = Field(default=None, ge=1870, le=2100)
    year_to: int | None = Field(default=None, ge=1870, le=2100)
    min_rating: float | None = Field(default=None, ge=0, le=10)
    rating_exclusive: bool = False
    max_rating: float | None = Field(default=None, ge=0, le=10)
    rating_max_exclusive: bool = False
    language: str | None = Field(default=None, pattern=r"^[a-z]{2,3}$")
    region: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    max_runtime_minutes: int | None = Field(default=None, ge=1, le=1000)
    runtime_exclusive: bool = False
    min_seasons: int | None = Field(default=None, ge=1, le=100)
    max_seasons: int | None = Field(default=None, ge=1, le=100)

    @model_validator(mode="after")
    def ranges_must_be_valid(self):
        if self.year_from and self.year_to and self.year_from > self.year_to:
            raise ValueError("The starting year must not be later than the ending year.")
        if self.min_rating is not None and self.max_rating is not None and self.min_rating > self.max_rating:
            raise ValueError("The minimum rating must not exceed the maximum rating.")
        if self.min_seasons and self.max_seasons and self.min_seasons > self.max_seasons:
            raise ValueError("The minimum season count must not exceed the maximum.")
        return self


class DiscoveryParseResponse(BaseModel):
    filters: DiscoveryFilters
    recognized_filters: list[str] = Field(default_factory=list)
    notices: list[str] = Field(default_factory=list)
    clarification: str | None = None
    keyword_query: str | None = None
