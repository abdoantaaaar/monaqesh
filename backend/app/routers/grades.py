from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.core.access import (
    CurrentUser,
    Db,
    require_course_view,
    require_enrolled,
    require_owner,
    require_staff,
)
from app.models import Assessment, DiscussionReport, Enrollment, Grade, TeamMember, now_utc
from app.schemas import AssessmentOut, AssessmentPatch, GradeIn, GradeOut, PublishIn
from app.services.common import audit, not_found
from app.services.teams import lock_course

router = APIRouter(prefix="/courses/{course_id}", tags=["Grades"])


def get_assessment(db, course_id, assessment_id):
    return not_found(
        db.scalar(
            select(Assessment).where(
                Assessment.id == assessment_id, Assessment.course_id == course_id
            )
        ),
        "Assessment",
    )


@router.get("/assessments", response_model=list[AssessmentOut])
def assessments(course_id: int, db: Db, user: CurrentUser):
    require_course_view(db, user, course_id)
    return db.scalars(
        select(Assessment).where(Assessment.course_id == course_id).order_by(Assessment.id)
    ).all()


@router.patch("/assessments/{assessment_id}", response_model=AssessmentOut)
def set_max_score(
    course_id: int, assessment_id: int, body: AssessmentPatch, db: Db, user: CurrentUser
):
    lock_course(db, course_id)
    require_owner(db, user, course_id)
    assessment = get_assessment(db, course_id, assessment_id)
    if db.scalar(select(Grade.id).where(Grade.assessment_id == assessment_id).limit(1)):
        raise HTTPException(409, "Set the maximum score before entering any grades")
    assessment.max_score = body.max_score
    audit(
        db,
        user,
        course_id,
        "assessment.maximum_changed",
        assessment_id=assessment_id,
        maximum=str(body.max_score),
    )
    db.commit()
    return assessment


@router.put("/assessments/{assessment_id}/grades/{student_id}", response_model=GradeOut)
def enter_grade(
    course_id: int, assessment_id: int, student_id: int, body: GradeIn, db: Db, user: CurrentUser
):
    lock_course(db, course_id)
    require_staff(db, user, course_id, "can_manage_grades")
    assessment = get_assessment(db, course_id, assessment_id)
    not_found(db.get(Enrollment, (course_id, student_id)), "Student enrollment")
    if body.score > assessment.max_score:
        raise HTTPException(422, "Score cannot exceed the assessment maximum")
    grade = db.scalar(
        select(Grade).where(Grade.assessment_id == assessment_id, Grade.student_id == student_id)
    )
    before = str(grade.score) if grade else None
    if not grade:
        grade = Grade(assessment_id=assessment_id, student_id=student_id, updated_by=user.id)
        db.add(grade)
    grade.score = body.score
    grade.feedback = body.feedback
    grade.updated_by = user.id
    grade.updated_at = now_utc()
    # Every edit requires the professor to publish again.
    grade.is_published = False
    audit(
        db,
        user,
        course_id,
        "grade.entered",
        assessment_id=assessment_id,
        student_id=student_id,
        before=before,
        after=str(body.score),
    )
    db.commit()
    return grade


@router.get("/assessments/{assessment_id}/grades")
def staff_grades(course_id: int, assessment_id: int, db: Db, user: CurrentUser):
    require_staff(db, user, course_id)
    assessment = get_assessment(db, course_id, assessment_id)
    grades = db.scalars(
        select(Grade).where(Grade.assessment_id == assessment_id).order_by(Grade.student_id)
    ).all()
    average = sum(g.score for g in grades) / len(grades) if grades else None
    return {
        "assessment": AssessmentOut.model_validate(assessment),
        "graded_count": len(grades),
        "enrolled_count": db.scalar(
            select(func.count()).select_from(Enrollment).where(Enrollment.course_id == course_id)
        ),
        "average": average,
        "grades": [GradeOut.model_validate(g) for g in grades],
    }


@router.post("/assessments/{assessment_id}/publish")
def publish_grades(course_id: int, assessment_id: int, body: PublishIn, db: Db, user: CurrentUser):
    lock_course(db, course_id)
    require_owner(db, user, course_id)
    assessment = get_assessment(db, course_id, assessment_id)
    ids = set(body.student_ids)
    grades = db.scalars(
        select(Grade).where(Grade.assessment_id == assessment_id, Grade.student_id.in_(ids))
    ).all()
    if len(grades) != len(ids):
        raise HTTPException(422, "Every selected student must have a recorded grade")
    if assessment.kind == "project":
        for grade in grades:
            member = db.get(TeamMember, (course_id, grade.student_id))
            latest = (
                db.scalar(
                    select(DiscussionReport)
                    .where(
                        DiscussionReport.team_id == member.team_id,
                        DiscussionReport.student_id == grade.student_id,
                    )
                    .order_by(DiscussionReport.version.desc())
                    .limit(1)
                )
                if member
                else None
            )
            if not latest or latest.status != "completed":
                raise HTTPException(
                    409, "A completed discussion report is required for every project grade"
                )
    for grade in grades:
        grade.is_published = True
    audit(
        db,
        user,
        course_id,
        "grades.published",
        assessment_id=assessment_id,
        student_ids=sorted(ids),
    )
    db.commit()
    return {"published_count": len(grades)}


@router.get("/my-grades")
def my_grades(course_id: int, db: Db, user: CurrentUser):
    require_enrolled(db, user, course_id)
    items = []
    for assessment in db.scalars(
        select(Assessment).where(Assessment.course_id == course_id).order_by(Assessment.id)
    ):
        grade = db.scalar(
            select(Grade).where(
                Grade.assessment_id == assessment.id,
                Grade.student_id == user.id,
                Grade.is_published.is_(True),
            )
        )
        items.append(
            {
                "assessment": AssessmentOut.model_validate(assessment),
                "grade": GradeOut.model_validate(grade) if grade else None,
            }
        )
    return items
