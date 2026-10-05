from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.core.access import CurrentUser, Db
from app.core.config import get_settings
from app.models import Submission, SubmissionFile, TeamMember
from app.schemas import FileKind, FileOut, SubmissionOut
from app.services.common import audit, not_found
from app.services.files import save_upload
from app.services.teams import ensure_unlocked, lock_course, require_leader, require_team_view

router = APIRouter(
    prefix="/courses/{course_id}/teams/{team_id}/submissions", tags=["Project submissions"]
)


def get_submission(db, team_id, submission_id):
    return not_found(
        db.scalar(
            select(Submission).where(Submission.id == submission_id, Submission.team_id == team_id)
        ),
        "Submission",
    )


@router.post("", response_model=SubmissionOut, status_code=201)
def draft(course_id: int, team_id: int, db: Db, user: CurrentUser):
    lock_course(db, course_id)
    require_leader(db, user, course_id, team_id)
    ensure_unlocked(db, team_id)
    existing = db.scalar(
        select(Submission).where(Submission.team_id == team_id, Submission.is_final.is_(False))
    )
    if existing:
        raise HTTPException(409, "A draft already exists; continue uploading to it")
    submission = Submission(team_id=team_id, version=1)
    db.add(submission)
    audit(db, user, course_id, "submission.draft_created", team_id=team_id)
    db.commit()
    return submission


@router.get("")
def submissions(course_id: int, team_id: int, db: Db, user: CurrentUser):
    require_team_view(db, user, course_id, team_id, files=True)
    return [
        {
            "submission": SubmissionOut.model_validate(s),
            "files": [
                FileOut.model_validate(f)
                for f in db.scalars(
                    select(SubmissionFile)
                    .where(SubmissionFile.submission_id == s.id)
                    .order_by(SubmissionFile.id)
                )
            ],
        }
        for s in db.scalars(
            select(Submission).where(Submission.team_id == team_id).order_by(Submission.version)
        )
    ]


@router.put("/{submission_id}/files/{kind}", response_model=FileOut)
def upload_file(
    course_id: int,
    team_id: int,
    submission_id: int,
    kind: FileKind,
    db: Db,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
):
    lock_course(db, course_id)
    require_leader(db, user, course_id, team_id)
    submission = get_submission(db, team_id, submission_id)
    if submission.is_final:
        raise HTTPException(409, "This submission is final and cannot be edited")
    values = save_upload(file, kind)
    stored = db.scalar(
        select(SubmissionFile).where(
            SubmissionFile.submission_id == submission_id, SubmissionFile.kind == kind
        )
    )
    old_name = stored.stored_name if stored else None
    if not stored:
        stored = SubmissionFile(submission_id=submission_id, kind=kind)
        db.add(stored)
    try:
        for key, value in values.items():
            setattr(stored, key, value)
        audit(
            db,
            user,
            course_id,
            "submission.file_uploaded",
            submission_id=submission_id,
            kind=kind,
            sha256=values["sha256"],
        )
        db.commit()
    except Exception:
        (get_settings().upload_dir / values["stored_name"]).unlink(missing_ok=True)
        raise
    if old_name:
        (get_settings().upload_dir / old_name).unlink(missing_ok=True)
    return stored


@router.post("/{submission_id}/finalize", response_model=SubmissionOut)
def finalize(course_id: int, team_id: int, submission_id: int, db: Db, user: CurrentUser):
    course = lock_course(db, course_id)
    require_leader(db, user, course_id, team_id)
    submission = get_submission(db, team_id, submission_id)
    if submission.is_final:
        raise HTTPException(409, "Already finalized")
    kinds = set(
        db.scalars(select(SubmissionFile.kind).where(SubmissionFile.submission_id == submission_id))
    )
    missing = {"source_code", "documentation", "readme"} - kinds
    if missing:
        raise HTTPException(422, f"Missing required files: {', '.join(sorted(missing))}")
    count = db.scalar(
        select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team_id)
    )
    if count < course.min_team_size:
        raise HTTPException(409, "Team has not reached the minimum size")
    submission.is_final = True
    audit(db, user, course_id, "submission.finalized", team_id=team_id, submission_id=submission_id)
    db.commit()
    return submission


@router.get("/{submission_id}/files/{file_id}/download")
def download(
    course_id: int, team_id: int, submission_id: int, file_id: int, db: Db, user: CurrentUser
):
    require_team_view(db, user, course_id, team_id, files=True)
    get_submission(db, team_id, submission_id)
    stored = not_found(
        db.scalar(
            select(SubmissionFile).where(
                SubmissionFile.id == file_id, SubmissionFile.submission_id == submission_id
            )
        ),
        "File",
    )
    path = get_settings().upload_dir / stored.stored_name
    if not path.is_file():
        raise HTTPException(404, "Stored file is unavailable")
    return FileResponse(
        path,
        filename=stored.original_name,
        media_type="application/octet-stream",
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"},
    )
