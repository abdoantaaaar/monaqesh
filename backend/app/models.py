"""Phase 1 tables. Roles are fixed values; permissions belong to a course."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def now_utc():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('professor','ta','student')"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    university_id: Mapped[str] = mapped_column(String(60), unique=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(default=True)
    failed_logins: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[int] = mapped_column(default=0)


class LoginSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[int] = mapped_column(Integer)
    revoked: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    used: Mapped[bool] = mapped_column(default=False)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (
        UniqueConstraint("code", "semester"),
        CheckConstraint(
            "min_team_size >= 1 AND max_team_size >= min_team_size AND max_team_size <= 20"
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    professor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    semester: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    is_published: Mapped[bool] = mapped_column(default=False)
    enrollment_open: Mapped[bool] = mapped_column(default=True)
    teams_open: Mapped[bool] = mapped_column(default=True)
    min_team_size: Mapped[int] = mapped_column(default=2)
    max_team_size: Mapped[int] = mapped_column(default=5)


class CourseTA(Base):
    __tablename__ = "course_tas"
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), primary_key=True)
    ta_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    can_manage_grades: Mapped[bool] = mapped_column(default=True)
    can_view_reports: Mapped[bool] = mapped_column(default=True)


class Enrollment(Base):
    __tablename__ = "enrollments"
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    can_create_team: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Assessment(Base):
    __tablename__ = "assessments"
    __table_args__ = (
        UniqueConstraint("course_id", "kind"),
        CheckConstraint("max_score > 0"),
        CheckConstraint("kind IN ('quiz1','quiz2','midterm','practical','project')"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(80))
    max_score: Mapped[Decimal] = mapped_column(Numeric(7, 2), default=100)


class Grade(Base):
    __tablename__ = "grades"
    __table_args__ = (
        UniqueConstraint("assessment_id", "student_id"),
        CheckConstraint("score >= 0"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    score: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    feedback: Mapped[str] = mapped_column(Text, default="")
    is_published: Mapped[bool] = mapped_column(default=False)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("id", "course_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    leader_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(100))
    project_title: Mapped[str] = mapped_column(String(160))
    project_description: Mapped[str] = mapped_column(Text, default="")
    join_code: Mapped[str] = mapped_column(String(30), unique=True)


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (
        ForeignKeyConstraint(
            ["team_id", "course_id"], ["teams.id", "teams.course_id"], ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["course_id", "student_id"], ["enrollments.course_id", "enrollments.student_id"]
        ),
        UniqueConstraint("team_id", "student_id"),
    )
    course_id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(Integer, index=True)
    contribution: Mapped[str] = mapped_column(Text, default="")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("team_id", "version"), CheckConstraint("version > 0"))
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    is_final: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class SubmissionFile(Base):
    __tablename__ = "submission_files"
    __table_args__ = (
        UniqueConstraint("submission_id", "kind"),
        CheckConstraint("kind IN ('source_code','documentation','presentation','readme')"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(80), unique=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)


class DiscussionReport(Base):
    """Immutable manual report for one student; automated discussion comes later."""

    __tablename__ = "discussion_reports"
    __table_args__ = (
        UniqueConstraint("team_id", "student_id", "version"),
        CheckConstraint("status IN ('completed','incomplete')"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"))
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))
    summary: Mapped[str] = mapped_column(Text)
    questions: Mapped[list] = mapped_column(JSON)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
