from fastapi import HTTPException
from sqlalchemy import or_, select

from app.models import AuditLog, User


def find_user(db, identifier: str):
    identifier = identifier.strip().lower()
    return db.scalar(
        select(User).where(or_(User.email == identifier, User.university_id == identifier))
    )


def audit(db, user, course_id, action, **details):
    db.add(AuditLog(actor_id=user.id, course_id=course_id, action=action, details=details))


def not_found(value, label):
    if value is None:
        raise HTTPException(404, f"{label} not found")
    return value
