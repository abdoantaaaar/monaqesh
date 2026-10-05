import time
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update

from app.core.access import CurrentUser, Db, unauthorized
from app.core.config import get_settings
from app.core.security import DUMMY_HASH, hash_password, issue_tokens, token_hash, verify_password
from app.models import LoginSession, RefreshToken, User
from app.schemas import LoginIn, PasswordIn, RefreshIn, TokenOut, UserOut
from app.services.common import find_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


def login(db, identifier, password):
    user = find_user(db, identifier)
    if user:
        user = db.scalar(
            select(User)
            .where(User.id == user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    # Unknown accounts still do an Argon2 verification.
    valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
    now = int(time.time())
    if not user or not user.is_active or user.locked_until > now:
        raise HTTPException(401, "Invalid credentials or account temporarily unavailable")
    if not valid:
        user.failed_logins += 1
        if user.failed_logins >= 5:
            user.locked_until = now + 15 * 60
            user.failed_logins = 0
        db.commit()
        raise HTTPException(401, "Invalid credentials or account temporarily unavailable")
    user.failed_logins = 0
    user.locked_until = 0
    session = LoginSession(
        id=str(uuid4()), user_id=user.id, expires_at=now + get_settings().session_days * 86400
    )
    db.add(session)
    db.flush()
    result = issue_tokens(db, session)
    db.commit()
    return result


@router.post("/login", response_model=TokenOut)
def login_json(body: LoginIn, db: Db):
    return login(db, body.identifier, body.password)


@router.post("/token", response_model=TokenOut)
def swagger_login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Db):
    if len(form.username) > 254 or len(form.password) > 256:
        raise HTTPException(401, "Invalid credentials")
    return login(db, form.username, form.password)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Db):
    saved = db.get(RefreshToken, token_hash(body.refresh_token))
    if not saved:
        raise unauthorized()
    session = db.scalar(
        select(LoginSession).where(LoginSession.id == saved.session_id).with_for_update()
    )
    # Reload after acquiring the session lock; a parallel refresh may have consumed it.
    db.refresh(saved)
    if saved.used:
        session.revoked = True
        db.commit()
        raise unauthorized()
    user = db.get(User, session.user_id)
    if session.revoked or session.expires_at <= time.time() or not user.is_active:
        raise unauthorized()
    saved.used = True
    result = issue_tokens(db, session)
    db.commit()
    return result


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=204)
def logout(db: Db, user: CurrentUser, body: RefreshIn):
    saved = db.get(RefreshToken, token_hash(body.refresh_token))
    if not saved:
        raise unauthorized()
    session = db.get(LoginSession, saved.session_id)
    if session.user_id != user.id:
        raise unauthorized()
    session.revoked = True
    db.commit()
    return Response(status_code=204)


@router.post("/logout-all", status_code=204)
def logout_all(db: Db, user: CurrentUser):
    db.execute(update(LoginSession).where(LoginSession.user_id == user.id).values(revoked=True))
    db.commit()
    return Response(status_code=204)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordIn, db: Db, user: CurrentUser):
    locked = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not verify_password(body.current_password, locked.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    locked.password_hash = hash_password(body.new_password)
    db.execute(update(LoginSession).where(LoginSession.user_id == user.id).values(revoked=True))
    db.commit()
    return Response(status_code=204)
