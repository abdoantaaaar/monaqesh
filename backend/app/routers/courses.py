from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select

from app.core.access import (
    CurrentUser,
    Db,
    get_course,
    require_course_view,
    require_enrolled,
    require_owner,
    require_role,
    require_staff,
)
from app.models import (
    Assessment,
    AuditLog,
    Course,
    CourseTA,
    Enrollment,
    Grade,
    Team,
    TeamMember,
    User,
)
from app.schemas import (
    AssessmentOut,
    CourseCreate,
    CourseOut,
    CoursePatch,
    LeaderIn,
    TAIn,
    TAPermissions,
    UserOut,
)
from app.services.common import audit, find_user, not_found
from app.services.teams import lock_course

router = APIRouter(prefix="/courses", tags=["Courses and enrollment"])


@router.get("", response_model=list[CourseOut])
def my_courses(db: Db, user: CurrentUser):
    query = select(Course)
    if user.role == "professor":
        query = query.where(Course.professor_id == user.id)
    elif user.role == "ta":
        query = query.join(CourseTA).where(CourseTA.ta_id == user.id)
    else:
        query = query.join(Enrollment).where(
            Enrollment.student_id == user.id, Course.is_published.is_(True)
        )
    return db.scalars(query.order_by(Course.id)).all()


@router.get("/catalog", response_model=list[CourseOut])
def available_courses(db: Db, user: CurrentUser):
    require_role(user, "student")
    enrolled = select(Enrollment.course_id).where(Enrollment.student_id == user.id)
    return db.scalars(
        select(Course)
        .where(
            Course.is_published.is_(True),
            Course.enrollment_open.is_(True),
            Course.id.not_in(enrolled),
        )
        .order_by(Course.id)
    ).all()


@router.get("/ta-candidates", response_model=list[UserOut])
def ta_candidates(db: Db, user: CurrentUser, q: str = Query(min_length=2, max_length=100)):
    require_role(user, "professor")
    pattern = "%" + q.strip().replace("%", "\\%").replace("_", "\\_") + "%"
    return db.scalars(
        select(User)
        .where(
            User.role == "ta",
            User.is_active.is_(True),
            (
                User.name.ilike(pattern, escape="\\")
                | User.email.ilike(pattern, escape="\\")
                | User.university_id.ilike(pattern, escape="\\")
            ),
        )
        .limit(20)
    ).all()


@router.post("", response_model=CourseOut, status_code=201)
def create_course(body: CourseCreate, db: Db, user: CurrentUser):
    require_role(user, "professor")
    values = body.model_dump()
    values["code"] = values["code"].upper()
    course = Course(professor_id=user.id, **values)
    db.add(course)
    db.flush()
    for kind, title in [
        ("quiz1", "Quiz 1"),
        ("quiz2", "Quiz 2"),
        ("midterm", "Midterm"),
        ("practical", "Practical"),
        ("project", "Project"),
    ]:
        db.add(Assessment(course_id=course.id, kind=kind, title=title, max_score=100))
    audit(db, user, course.id, "course.created")
    db.commit()
    return course


@router.get("/{course_id}")
def course_details(course_id: int, db: Db, user: CurrentUser):
    course = require_course_view(db, user, course_id)
    tas = db.execute(
        select(CourseTA, User)
        .join(User, CourseTA.ta_id == User.id)
        .where(CourseTA.course_id == course_id)
    ).all()
    professor = db.get(User, course.professor_id)
    enrollment = db.get(Enrollment, (course_id, user.id)) if user.role == "student" else None
    return {
        "course": CourseOut.model_validate(course),
        "student_count": db.scalar(
            select(func.count()).select_from(Enrollment).where(Enrollment.course_id == course_id)
        ),
        "professor": {"id": professor.id, "name": professor.name},
        "teaching_assistants": [UserOut.model_validate(ta) for _, ta in tas],
        "ta_permissions": {
            str(assignment.ta_id): {
                "can_manage_grades": assignment.can_manage_grades,
                "can_view_reports": assignment.can_view_reports,
            }
            for assignment, _ in tas
        }
        if user.role == "professor"
        else {},
        "assessments": [
            AssessmentOut.model_validate(a)
            for a in db.scalars(
                select(Assessment).where(Assessment.course_id == course_id).order_by(Assessment.id)
            )
        ],
        "can_create_team": bool(enrollment and enrollment.can_create_team),
        "permissions": (
            {"can_manage_grades": True, "can_view_reports": True, "can_publish": True}
            if user.role == "professor"
            else {
                "can_manage_grades": db.get(CourseTA, (course_id, user.id)).can_manage_grades,
                "can_view_reports": db.get(CourseTA, (course_id, user.id)).can_view_reports,
                "can_publish": False,
            }
            if user.role == "ta"
            else {}
        ),
    }


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(course_id: int, body: CoursePatch, db: Db, user: CurrentUser):
    require_owner(db, user, course_id)
    course = lock_course(db, course_id)
    changes = body.model_dump(exclude_unset=True)
    minimum = changes.get("min_team_size", course.min_team_size)
    maximum = changes.get("max_team_size", course.max_team_size)
    if minimum > maximum:
        raise HTTPException(422, "min_team_size must not exceed max_team_size")
    # Size rules are frozen once teams exist, to avoid invalidating existing teams.
    if (minimum != course.min_team_size or maximum != course.max_team_size) and db.scalar(
        select(Team.id).where(Team.course_id == course_id).limit(1)
    ):
        raise HTTPException(409, "Team size rules cannot change after teams have been created")
    for key, value in changes.items():
        setattr(course, key, value)
    audit(db, user, course_id, "course.updated", changes=changes)
    db.commit()
    return course


@router.post("/{course_id}/tas", status_code=201)
def assign_ta(course_id: int, body: TAIn, db: Db, user: CurrentUser):
    require_owner(db, user, course_id)
    ta = not_found(find_user(db, body.identifier), "TA")
    if ta.role != "ta" or not ta.is_active:
        raise HTTPException(422, "Choose an active teaching assistant")
    db.add(
        CourseTA(
            course_id=course_id,
            ta_id=ta.id,
            can_manage_grades=body.can_manage_grades,
            can_view_reports=body.can_view_reports,
        )
    )
    audit(db, user, course_id, "ta.assigned", ta_id=ta.id)
    db.commit()
    return {
        "ta": UserOut.model_validate(ta),
        "can_manage_grades": body.can_manage_grades,
        "can_view_reports": body.can_view_reports,
    }


@router.patch("/{course_id}/tas/{ta_id}")
def ta_permissions(course_id: int, ta_id: int, body: TAPermissions, db: Db, user: CurrentUser):
    require_owner(db, user, course_id)
    assignment = not_found(db.get(CourseTA, (course_id, ta_id)), "TA assignment")
    for key, value in body.model_dump().items():
        setattr(assignment, key, value)
    audit(db, user, course_id, "ta.permissions_changed", ta_id=ta_id, **body.model_dump())
    db.commit()
    return {"ta_id": ta_id, **body.model_dump()}


@router.delete("/{course_id}/tas/{ta_id}", status_code=204)
def remove_ta(course_id: int, ta_id: int, db: Db, user: CurrentUser):
    require_owner(db, user, course_id)
    assignment = not_found(db.get(CourseTA, (course_id, ta_id)), "TA assignment")
    db.delete(assignment)
    audit(db, user, course_id, "ta.removed", ta_id=ta_id)
    db.commit()
    return Response(status_code=204)


@router.post("/{course_id}/enroll", status_code=201)
def enroll(course_id: int, db: Db, user: CurrentUser):
    require_role(user, "student")
    course = get_course(db, course_id)
    course = lock_course(db, course_id)
    if not course.is_published or not course.enrollment_open:
        raise HTTPException(403, "Enrollment is closed")
    if db.get(Enrollment, (course_id, user.id)):
        raise HTTPException(409, "Already enrolled")
    db.add(Enrollment(course_id=course_id, student_id=user.id))
    audit(db, user, course_id, "student.enrolled")
    db.commit()
    return {"message": "Enrolled successfully"}


@router.delete("/{course_id}/enroll", status_code=204)
def drop(course_id: int, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    enrollment = require_enrolled(db, user, course_id)
    if not course.enrollment_open:
        raise HTTPException(403, "Course registration and dropping are closed")
    if db.get(TeamMember, (course_id, user.id)):
        raise HTTPException(409, "Leave or delete your team before dropping this course")
    if db.scalar(
        select(Grade.id)
        .join(Assessment)
        .where(Assessment.course_id == course_id, Grade.student_id == user.id)
        .limit(1)
    ):
        raise HTTPException(409, "Cannot drop a course after grades have been recorded")
    db.delete(enrollment)
    audit(db, user, course_id, "student.dropped")
    db.commit()
    return Response(status_code=204)


@router.get("/{course_id}/students")
def students(course_id: int, db: Db, user: CurrentUser):
    require_staff(db, user, course_id)
    rows = db.execute(
        select(User, Enrollment.can_create_team)
        .join(Enrollment, User.id == Enrollment.student_id)
        .where(Enrollment.course_id == course_id)
        .order_by(User.name)
    ).all()
    return [
        {**UserOut.model_validate(u).model_dump(), "can_create_team": allowed}
        for u, allowed in rows
    ]


@router.patch("/{course_id}/students/{student_id}/leader")
def allow_team_creation(course_id: int, student_id: int, body: LeaderIn, db: Db, user: CurrentUser):
    lock_course(db, course_id)
    require_owner(db, user, course_id)
    enrollment = not_found(db.get(Enrollment, (course_id, student_id)), "Student enrollment")
    enrollment.can_create_team = body.can_create_team
    audit(
        db,
        user,
        course_id,
        "student.leader_permission",
        student_id=student_id,
        allowed=body.can_create_team,
    )
    db.commit()
    return {"student_id": student_id, "can_create_team": enrollment.can_create_team}


@router.get("/{course_id}/audit")
def audit_history(
    course_id: int,
    db: Db,
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    require_owner(db, user, course_id)
    return [
        {
            "id": a.id,
            "actor_id": a.actor_id,
            "action": a.action,
            "details": a.details,
            "created_at": a.created_at,
        }
        for a in db.scalars(
            select(AuditLog)
            .where(AuditLog.course_id == course_id)
            .order_by(AuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ]
