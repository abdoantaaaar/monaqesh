from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Score = Annotated[
    Decimal, Field(ge=0, le=99999, max_digits=7, decimal_places=2, allow_inf_nan=False)
]
FileKind = Literal["source_code", "documentation", "presentation", "readme"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(Output):
    id: int
    university_id: str
    email: str
    name: str
    role: str


class LoginIn(Input):
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class RefreshIn(Input):
    refresh_token: str = Field(min_length=20, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int


class PasswordIn(Input):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class CourseCreate(Input):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    semester: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: str = Field(default="", max_length=5000)
    min_team_size: int = Field(default=2, ge=1, le=20)
    max_team_size: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def valid_sizes(self):
        if self.min_team_size > self.max_team_size:
            raise ValueError("min_team_size must not exceed max_team_size")
        return self


class CoursePatch(Input):
    title: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
        | None
    ) = None
    description: str | None = Field(default=None, max_length=5000)
    is_published: bool | None = None
    enrollment_open: bool | None = None
    teams_open: bool | None = None
    min_team_size: int | None = Field(default=None, ge=1, le=20)
    max_team_size: int | None = Field(default=None, ge=1, le=20)

    @model_validator(mode="after")
    def no_explicit_null(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Omit unchanged fields instead of sending null")
        return self


class CourseOut(Output):
    id: int
    professor_id: int
    code: str
    semester: str
    title: str
    description: str
    is_published: bool
    enrollment_open: bool
    teams_open: bool
    min_team_size: int
    max_team_size: int


class TAIn(Input):
    identifier: str = Field(min_length=1, max_length=254)
    can_manage_grades: bool = True
    can_view_reports: bool = True


class TAPermissions(Input):
    can_manage_grades: bool
    can_view_reports: bool


class LeaderIn(Input):
    can_create_team: bool


class TeamCreate(Input):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    project_title: Name
    project_description: str = Field(default="", max_length=5000)


class TeamJoin(Input):
    code: str = Field(min_length=1, max_length=30)


class TeamPatch(TeamCreate):
    pass


class ContributionIn(Input):
    contribution: str = Field(min_length=1, max_length=2000)


class TransferIn(Input):
    student_id: int = Field(gt=0)


class AssessmentOut(Output):
    id: int
    course_id: int
    kind: str
    title: str
    max_score: Decimal


class AssessmentPatch(Input):
    max_score: Annotated[Decimal, Field(gt=0, le=99999, max_digits=7, decimal_places=2)]


class GradeIn(Input):
    score: Score
    feedback: str = Field(default="", max_length=3000)


class GradeOut(Output):
    id: int
    assessment_id: int
    student_id: int
    score: Decimal
    feedback: str
    is_published: bool


class PublishIn(Input):
    student_ids: list[int] = Field(min_length=1, max_length=500)


class ReportQuestion(Input):
    question: str = Field(min_length=1, max_length=3000)
    answer: str = Field(max_length=5000)
    result: Literal["correct", "partial", "incorrect", "not_answered"]
    feedback: str = Field(default="", max_length=3000)


class ReportIn(Input):
    student_id: int = Field(gt=0)
    submission_id: int = Field(gt=0)
    status: Literal["completed", "incomplete"]
    summary: str = Field(min_length=1, max_length=5000)
    questions: list[ReportQuestion] = Field(min_length=1, max_length=100)


class ReportOut(Output):
    id: int
    team_id: int
    student_id: int
    submission_id: int
    version: int
    status: str
    summary: str
    questions: list[ReportQuestion]
    created_at: datetime


class FileOut(Output):
    id: int
    submission_id: int
    kind: str
    original_name: str
    size_bytes: int
    sha256: str


class SubmissionOut(Output):
    id: int
    team_id: int
    version: int
    is_final: bool
    created_at: datetime
