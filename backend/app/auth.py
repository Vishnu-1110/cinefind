"""Local-development account registration and cookie sessions."""
from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import secrets
import uuid
from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .auth_schemas import AccountCreate, AccountLogin, AccountResponse
from .dependencies import DatabaseSession
from .models import AuthSession, UserAccount, UserPreference
from .config import settings

router = APIRouter(prefix="/api/auth", tags=["Account"])
SESSION_COOKIE = "cinefind_session"
SESSION_DAYS = 14
SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1


def hash_password(password: str) -> str:
    """Store a salted, deliberately expensive scrypt hash, never the password."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=64, maxmem=64 * 1024 * 1024)
    return "scrypt${}${}${}${}${}".format(
        SCRYPT_N, SCRYPT_R, SCRYPT_P,
        base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
        base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_text, digest_text = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected), maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, MemoryError):
        return False



DUMMY_PASSWORD_HASH = hash_password("non-account-login-timing-value")

def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def account_from_request(request: Request, session: Session) -> UserAccount | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    row = session.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
    if row is None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= datetime.now(timezone.utc):
        session.delete(row)
        session.commit()
        return None
    return session.get(UserAccount, row.account_id)


def set_session_cookie(response: Response, account: UserAccount, session: Session) -> None:
    token = secrets.token_urlsafe(32)
    session.add(AuthSession(
        account_id=account.id,
        token_hash=token_digest(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
    ))
    session.commit()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="none" if settings.app_env == "production" else "lax",
        path="/",
    )


def account_response(account: UserAccount) -> AccountResponse:
    return AccountResponse(profile_id=account.id, email=account.email)


def _issue_account_session(account: UserAccount, response: Response, session: Session) -> AccountResponse:
    set_session_cookie(response, account, session)
    return account_response(account)


@router.post("/signup", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: AccountCreate, response: Response, session: DatabaseSession) -> AccountResponse:
    account = UserAccount(id=str(uuid.uuid4()), email=payload.email, password_hash=hash_password(payload.password))
    session.add(account)
    session.add(UserPreference(profile_id=account.id))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    session.refresh(account)
    return _issue_account_session(account, response, session)


@router.post("/login", response_model=AccountResponse)
def login(payload: AccountLogin, response: Response, session: DatabaseSession) -> AccountResponse:
    account = session.scalar(select(UserAccount).where(UserAccount.email == payload.email))
    stored_hash = account.password_hash if account is not None else DUMMY_PASSWORD_HASH
    password_matches = verify_password(payload.password, stored_hash)
    if account is None or not password_matches:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return _issue_account_session(account, response, session)


@router.get("/me", response_model=AccountResponse)
def current_account(request: Request, session: DatabaseSession) -> AccountResponse:
    account = account_from_request(request, session)
    if account is None:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    return account_response(account)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, session: DatabaseSession) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = session.scalar(select(AuthSession).where(AuthSession.token_hash == token_digest(token)))
        if row is not None:
            session.delete(row)
            session.commit()
    response.delete_cookie(key=SESSION_COOKIE, path="/", httponly=True, secure=settings.app_env == "production", samesite="none" if settings.app_env == "production" else "lax")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

