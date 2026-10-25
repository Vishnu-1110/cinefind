"""Validated payloads and responses for local account authentication."""
import re
from pydantic import BaseModel, ConfigDict, Field, field_validator

class AccountCredentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        email = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ValueError("Enter a valid email address.")
        return email

class AccountResponse(BaseModel):
    profile_id: str
    email: str

class AccountCreate(AccountCredentials):
    pass

class AccountLogin(AccountCredentials):
    pass
