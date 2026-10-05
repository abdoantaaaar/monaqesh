from fastapi import HTTPException
from sqlalchemy import select

from app.core.access import require_enrolled, require_staff
from app.models import Course, Submission, Team, TeamMember, User
from app.services.common import not_found


def lock_course(db, course_id):
    """One course row lock serializes registration/team changes on PostgreSQL."""
    return not_found(
        db.scalar(
            select(Course)
            .where(Course.id == course_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ),
        "Course",
    )


def get_team(db, course_id, team_id):
    return not_found(
        db.scalar(select(Team).where(Team.id == team_id, Team.course_id == course_id)), "Team"
    )


def require_team_view(db, user, course_id, team_id, *, files=False):
    team = get_team(db, course_id, team_id)
    if user.role == "student":
        require_enrolled(db, user, course_id)
        member = db.get(TeamMember, (course_id, user.id))
        if not member or member.team_id != team_id:
            raise HTTPException(403, "You are not a member of this team")
    else:
        require_staff(db, user, course_id, "can_view_reports" if files else None)
    return team


def require_leader(db, user, course_id, team_id):
    team = require_team_view(db, user, course_id, team_id)
    if user.role != "student" or team.leader_id != user.id:
        raise HTTPException(403, "Only the team leader can perform this action")
    return team


def ensure_unlocked(db, team_id):
    if db.scalar(
        select(Submission.id)
        .where(Submission.team_id == team_id, Submission.is_final.is_(True))
        .limit(1)
    ):
        raise HTTPException(409, "The final submission has locked this team")


def team_data(db, team, user):
    members = db.execute(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.student_id)
        .where(TeamMember.team_id == team.id)
        .order_by(User.id)
    ).all()
    course = db.get(Course, team.course_id)
    return {
        "id": team.id,
        "course_id": team.course_id,
        "name": team.name,
        "leader_id": team.leader_id,
        "project_title": team.project_title,
        "project_description": team.project_description,
        "join_code": team.join_code if user.id == team.leader_id else None,
        "is_ready": len(members) >= course.min_team_size,
        "members": [
            {
                "id": u.id,
                "name": u.name,
                "university_id": u.university_id,
                "contribution": m.contribution,
            }
            for m, u in members
        ],
    }
