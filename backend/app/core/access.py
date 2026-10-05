"""Every check is made on the server, including course ownership and enrollment."""

import time
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.models import Course, CourseTA, Enrollment, LoginSession, User

Db = Annotated[Session, Depends(get_db)]
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def unauthorized():
    return HTTPException(401, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"})


def current_user(db: Db, token: Annotated[str, Depends(oauth2)]) -> User:
    try:
        claims = jwt.decode(
            token,
            get_settings().secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "sid", "type"]},
        )
        if claims["type"] != "access":
            raise unauthorized()
        session = db.get(LoginSession, claims["sid"])
        user = db.get(User, int(claims["sub"]))
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise unauthorized()
    if (
        not session
        or session.revoked
        or session.expires_at <= time.time()
        or not user
        or not user.is_active
        or session.user_id != user.id
    ):
        raise unauthorized()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_role(user: User, *roles: str):
    if user.role not in roles:
        raise HTTPException(403, "Your role cannot perform this action")


def get_course(db, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return course


def require_owner(db, user: User, course_id: int) -> Course:
    course = get_course(db, course_id)
    if user.role != "professor" or course.professor_id != user.id:
        raise HTTPException(403, "Only the owning professor can perform this action")
    return course


def require_staff(db, user: User, course_id: int, permission: str | None = None) -> Course:
    course = get_course(db, course_id)
    if user.role == "professor" and course.professor_id == user.id:
        return course
    assignment = db.get(CourseTA, (course_id, user.id)) if user.role == "ta" else None
    if not assignment or (permission and not getattr(assignment, permission)):
        raise HTTPException(403, "You do not have this permission in this course")
    return course


def require_enrolled(db, user: User, course_id: int) -> Enrollment:
    require_role(user, "student")
    course = get_course(db, course_id)
    enrollment = db.get(Enrollment, (course_id, user.id))
    if not course.is_published or not enrollment:
        raise HTTPException(403, "You are not enrolled in this published course")
    return enrollment


def require_course_view(db, user: User, course_id: int) -> Course:
    if user.role == "student":
        require_enrolled(db, user, course_id)
        return get_course(db, course_id)
    return require_staff(db, user, course_id)
