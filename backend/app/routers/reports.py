from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.core.access import CurrentUser, Db, require_enrolled, require_staff
from app.models import Assessment, DiscussionReport, Grade, Submission, TeamMember
from app.schemas import ReportIn, ReportOut
from app.services.common import audit, not_found
from app.services.teams import lock_course, require_team_view

router = APIRouter(
    prefix="/courses/{course_id}/teams/{team_id}/reports", tags=["Manual discussion reports"]
)


@router.post("", response_model=ReportOut, status_code=201)
def create_report(course_id: int, team_id: int, body: ReportIn, db: Db, user: CurrentUser):
    lock_course(db, course_id)
    require_staff(db, user, course_id, "can_view_reports")
    require_staff(db, user, course_id, "can_manage_grades")
    require_team_view(db, user, course_id, team_id, files=True)
    member = db.get(TeamMember, (course_id, body.student_id))
    if not member or member.team_id != team_id:
        raise HTTPException(422, "Student must be a member of this team")
    submission = not_found(db.get(Submission, body.submission_id), "Submission")
    if submission.team_id != team_id or not submission.is_final:
        raise HTTPException(422, "Report must reference this team's final submission")
    latest_version = (
        db.scalar(
            select(func.max(DiscussionReport.version)).where(
                DiscussionReport.team_id == team_id, DiscussionReport.student_id == body.student_id
            )
        )
        or 0
    )
    report = DiscussionReport(
        team_id=team_id,
        student_id=body.student_id,
        submission_id=body.submission_id,
        version=latest_version + 1,
        status=body.status,
        summary=body.summary,
        questions=[q.model_dump() for q in body.questions],
        created_by=user.id,
    )
    db.add(report)
    # A corrected report needs a new academic approval before students see it.
    project = db.scalar(
        select(Assessment).where(Assessment.course_id == course_id, Assessment.kind == "project")
    )
    grade = db.scalar(
        select(Grade).where(Grade.assessment_id == project.id, Grade.student_id == body.student_id)
    )
    if grade:
        grade.is_published = False
    audit(
        db,
        user,
        course_id,
        "report.created",
        team_id=team_id,
        student_id=body.student_id,
        version=report.version,
        status=body.status,
    )
    db.commit()
    return report


@router.get("", response_model=list[ReportOut])
def reports(course_id: int, team_id: int, db: Db, user: CurrentUser):
    require_team_view(db, user, course_id, team_id, files=True)
    query = select(DiscussionReport).where(DiscussionReport.team_id == team_id)
    if user.role == "student":
        require_enrolled(db, user, course_id)
        grade = db.scalar(
            select(Grade)
            .join(Assessment)
            .where(
                Assessment.course_id == course_id,
                Assessment.kind == "project",
                Grade.student_id == user.id,
                Grade.is_published.is_(True),
            )
        )
        if not grade:
            return []
        query = (
            query.where(DiscussionReport.student_id == user.id)
            .order_by(DiscussionReport.version.desc())
            .limit(1)
        )
    else:
        query = query.order_by(DiscussionReport.student_id, DiscussionReport.version.desc())
    return db.scalars(query).all()
