"""Local profile routes; account profiles require their matching login session."""
from collections.abc import Generator
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .auth import account_from_request
from .dependencies import DatabaseSession
from .models import SavedTitle, UserAccount, UserPreference
from .schemas import PreferenceResponse, PreferenceUpdate, SavedTitleCreate, SavedTitleResponse

router = APIRouter(prefix="/api/profiles", tags=["Local profile data"])
ProfileId = Annotated[str, Path(min_length=1, max_length=64)]


def check_profile_access(profile_id: str, request: Request, session: Session) -> None:
    """Keep legacy anonymous browser profiles usable and protect account profiles."""
    owner = session.get(UserAccount, profile_id)
    if owner is None:
        return
    current = account_from_request(request, session)
    if current is None:
        raise HTTPException(status_code=401, detail="Please log in to access this account data.")
    if current.id != owner.id:
        raise HTTPException(status_code=403, detail="You cannot access another account's data.")


@router.get("/{profile_id}/preferences", response_model=PreferenceResponse)
def get_preferences(profile_id: ProfileId, request: Request, session: DatabaseSession):
    check_profile_access(profile_id, request, session)
    preferences = session.get(UserPreference, profile_id)
    if preferences is None:
        raise HTTPException(status_code=404, detail="Preferences were not found.")
    return preferences


@router.put("/{profile_id}/preferences", response_model=PreferenceResponse)
def save_preferences(profile_id: ProfileId, payload: PreferenceUpdate, request: Request, session: DatabaseSession):
    check_profile_access(profile_id, request, session)
    preferences = session.get(UserPreference, profile_id)
    if preferences is None:
        preferences = UserPreference(profile_id=profile_id)
    preferences.preferred_media_type = payload.preferred_media_type
    preferences.movie_genre_ids = payload.movie_genre_ids
    preferences.tv_genre_ids = payload.tv_genre_ids
    preferences.favorite_moods = payload.favorite_moods
    session.add(preferences)
    session.commit()
    session.refresh(preferences)
    return preferences


@router.get("/{profile_id}/saved-titles", response_model=list[SavedTitleResponse])
def list_saved_titles(profile_id: ProfileId, request: Request, session: DatabaseSession):
    check_profile_access(profile_id, request, session)
    query = select(SavedTitle).where(SavedTitle.profile_id == profile_id).order_by(SavedTitle.saved_at.desc(), SavedTitle.id.desc())
    return list(session.scalars(query))


@router.post("/{profile_id}/saved-titles", response_model=SavedTitleResponse, status_code=status.HTTP_201_CREATED)
def add_saved_title(profile_id: ProfileId, payload: SavedTitleCreate, request: Request, session: DatabaseSession):
    check_profile_access(profile_id, request, session)
    duplicate = session.scalar(select(SavedTitle).where(
        SavedTitle.profile_id == profile_id,
        SavedTitle.media_type == payload.media_type,
        SavedTitle.tmdb_id == payload.tmdb_id,
    ))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="This title is already saved.")
    if session.get(UserPreference, profile_id) is None:
        session.add(UserPreference(profile_id=profile_id))
    saved = SavedTitle(profile_id=profile_id, **payload.model_dump())
    session.add(saved)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="This title could not be saved.") from None
    session.refresh(saved)
    return saved


@router.delete("/{profile_id}/saved-titles/{media_type}/{tmdb_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_title(profile_id: ProfileId, media_type: str, tmdb_id: Annotated[int, Path(gt=0)], request: Request, session: DatabaseSession) -> None:
    check_profile_access(profile_id, request, session)
    if media_type not in {"movie", "tv"}:
        raise HTTPException(status_code=422, detail="Media type must be movie or tv.")
    saved = session.scalar(select(SavedTitle).where(
        SavedTitle.profile_id == profile_id,
        SavedTitle.media_type == media_type,
        SavedTitle.tmdb_id == tmdb_id,
    ))
    if saved is None:
        raise HTTPException(status_code=404, detail="Saved title was not found.")
    session.delete(saved)
    session.commit()
