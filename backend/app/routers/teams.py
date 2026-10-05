import secrets

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import delete, func, select

from app.core.access import CurrentUser, Db, require_enrolled, require_staff
from app.models import Submission, Team, TeamMember
from app.schemas import ContributionIn, TeamCreate, TeamJoin, TeamPatch, TransferIn
from app.services.common import audit
from app.services.teams import (
    ensure_unlocked,
    lock_course,
    require_leader,
    require_team_view,
    team_data,
)

router = APIRouter(prefix="/courses/{course_id}", tags=["Project teams"])


@router.get("/project")
def project_context(course_id: int, db: Db, user: CurrentUser):
    enrollment = require_enrolled(db, user, course_id)
    course = lock_course(db, course_id)
    member = db.get(TeamMember, (course_id, user.id))
    team = db.get(Team, member.team_id) if member else None
    return {
        "can_create_team": bool(course.teams_open and enrollment.can_create_team and not member),
        "can_join_team": bool(course.teams_open and not member),
        "is_team_leader": bool(team and team.leader_id == user.id),
        "team": team_data(db, team, user) if team else None,
    }


@router.get("/teams")
def list_teams(course_id: int, db: Db, user: CurrentUser):
    require_staff(db, user, course_id)
    return [
        team_data(db, team, user)
        for team in db.scalars(select(Team).where(Team.course_id == course_id).order_by(Team.id))
    ]


@router.post("/teams", status_code=201)
def create_team(course_id: int, body: TeamCreate, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    enrollment = require_enrolled(db, user, course_id)
    if not course.teams_open or not enrollment.can_create_team:
        raise HTTPException(
            403, "Team creation is closed or you have not been designated as a leader"
        )
    if db.get(TeamMember, (course_id, user.id)):
        raise HTTPException(409, "You already belong to a team in this course")
    team = Team(
        course_id=course_id,
        leader_id=user.id,
        join_code=secrets.token_urlsafe(9),
        **body.model_dump(),
    )
    db.add(team)
    db.flush()
    db.add(TeamMember(course_id=course_id, student_id=user.id, team_id=team.id))
    audit(db, user, course_id, "team.created", team_id=team.id)
    db.commit()
    return team_data(db, team, user)


@router.post("/teams/join")
def join_team(course_id: int, body: TeamJoin, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    require_enrolled(db, user, course_id)
    if not course.teams_open:
        raise HTTPException(403, "Team formation is closed")
    if db.get(TeamMember, (course_id, user.id)):
        raise HTTPException(409, "You already belong to a team in this course")
    team = db.scalar(
        select(Team).where(Team.course_id == course_id, Team.join_code == body.code.strip())
    )
    if not team:
        raise HTTPException(404, "Invalid team code for this course")
    ensure_unlocked(db, team.id)
    size = db.scalar(
        select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team.id)
    )
    if size >= course.max_team_size:
        raise HTTPException(409, "Team is full")
    db.add(TeamMember(course_id=course_id, student_id=user.id, team_id=team.id))
    audit(db, user, course_id, "team.joined", team_id=team.id)
    db.commit()
    return team_data(db, team, user)


@router.get("/teams/{team_id}")
def team_details(course_id: int, team_id: int, db: Db, user: CurrentUser):
    team = require_team_view(db, user, course_id, team_id)
    return team_data(db, team, user)


@router.patch("/teams/{team_id}")
def edit_team(course_id: int, team_id: int, body: TeamPatch, db: Db, user: CurrentUser):
    lock_course(db, course_id)
    team = require_leader(db, user, course_id, team_id)
    ensure_unlocked(db, team_id)
    for key, value in body.model_dump().items():
        setattr(team, key, value)
    audit(db, user, course_id, "team.updated", team_id=team_id)
    db.commit()
    return team_data(db, team, user)


@router.patch("/teams/{team_id}/my-contribution")
def contribution(course_id: int, team_id: int, body: ContributionIn, db: Db, user: CurrentUser):
    lock_course(db, course_id)
    require_enrolled(db, user, course_id)
    require_team_view(db, user, course_id, team_id)
    ensure_unlocked(db, team_id)
    member = db.get(TeamMember, (course_id, user.id))
    member.contribution = body.contribution
    audit(db, user, course_id, "team.contribution_updated", team_id=team_id)
    db.commit()
    return {"contribution": member.contribution}


@router.post("/teams/{team_id}/transfer-leadership")
def transfer(course_id: int, team_id: int, body: TransferIn, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    team = require_leader(db, user, course_id, team_id)
    ensure_unlocked(db, team_id)
    if not course.teams_open:
        raise HTTPException(403, "Team formation is closed")
    member = db.get(TeamMember, (course_id, body.student_id))
    if not member or member.team_id != team_id:
        raise HTTPException(422, "The new leader must already belong to this team")
    team.leader_id = body.student_id
    team.join_code = secrets.token_urlsafe(9)
    audit(
        db,
        user,
        course_id,
        "team.leadership_transferred",
        team_id=team_id,
        new_leader_id=body.student_id,
    )
    db.commit()
    return team_data(db, team, user)


@router.post("/teams/{team_id}/leave", status_code=204)
def leave(course_id: int, team_id: int, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    require_enrolled(db, user, course_id)
    team = require_team_view(db, user, course_id, team_id)
    ensure_unlocked(db, team_id)
    if not course.teams_open:
        raise HTTPException(403, "Team formation is closed")
    if team.leader_id == user.id:
        raise HTTPException(409, "Transfer leadership before leaving, or delete your empty team")
    db.delete(db.get(TeamMember, (course_id, user.id)))
    audit(db, user, course_id, "team.left", team_id=team_id)
    db.commit()
    return Response(status_code=204)


@router.delete("/teams/{team_id}", status_code=204)
def delete_empty_team(course_id: int, team_id: int, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    team = require_leader(db, user, course_id, team_id)
    if not course.teams_open:
        raise HTTPException(403, "Team formation is closed")
    size = db.scalar(
        select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team_id)
    )
    if size != 1 or db.scalar(select(Submission.id).where(Submission.team_id == team_id).limit(1)):
        raise HTTPException(
            409, "Only a team with no other members and no submissions can be deleted"
        )
    db.execute(delete(TeamMember).where(TeamMember.team_id == team_id))
    db.delete(team)
    audit(db, user, course_id, "team.deleted", team_id=team_id)
    db.commit()
    return Response(status_code=204)
