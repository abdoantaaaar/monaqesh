import hashlib
import secrets
import time
from uuid import uuid4

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings
from app.models import LoginSession, RefreshToken

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return passwords.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return passwords.verify(password, encoded)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_tokens(db, session: LoginSession) -> dict:
    settings = get_settings()
    now = int(time.time())
    access = jwt.encode(
        {
            "sub": str(session.user_id),
            "sid": session.id,
            "iat": now,
            "exp": now + settings.access_token_minutes * 60,
            "type": "access",
            "jti": str(uuid4()),
        },
        settings.secret_key,
        algorithm="HS256",
    )
    refresh = secrets.token_urlsafe(48)
    db.add(RefreshToken(token_hash=token_hash(refresh), session_id=session.id))
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.access_token_minutes * 60,
    }
