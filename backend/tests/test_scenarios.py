import io
import zipfile

from sqlalchemy import select

from app.models import User
from tests.conftest import PASSWORD


class Scenario:
    def __init__(self, setup):
        self.client = setup["client"]
        self.ids = setup["users"]
        self.headers = {}

    def h(self, name):
        if name not in self.headers:
            response = self.client.post(
                "/api/auth/login", json={"identifier": name, "password": PASSWORD}
            )
            assert response.status_code == 200, response.text
            self.headers[name] = {"Authorization": "Bearer " + response.json()["access_token"]}
        return self.headers[name]

    def course(self, code="AI101", max_size=5):
        r = self.client.post(
            "/api/courses",
            headers=self.h("p1"),
            json={
                "code": code,
                "semester": "2026-Fall",
                "title": "Artificial Intelligence",
                "min_team_size": 2,
                "max_team_size": max_size,
            },
        )
        assert r.status_code == 201, r.text
        course = r.json()["id"]
        self.client.patch(
            f"/api/courses/{course}", headers=self.h("p1"), json={"is_published": True}
        )
        return course

    def enroll(self, course, *names):
        for name in names:
            r = self.client.post(f"/api/courses/{course}/enroll", headers=self.h(name))
            assert r.status_code == 201, r.text

    def team(self, course, leader="s1"):
        r = self.client.patch(
            f"/api/courses/{course}/students/{self.ids[leader]}/leader",
            headers=self.h("p1"),
            json={"can_create_team": True},
        )
        assert r.status_code == 200, r.text
        r = self.client.post(
            f"/api/courses/{course}/teams",
            headers=self.h(leader),
            json={"name": "Smart Team", "project_title": "Monaqesh"},
        )
        assert r.status_code == 201, r.text
        return r.json()

    def assessment(self, course, kind):
        r = self.client.get(f"/api/courses/{course}/assessments", headers=self.h("p1"))
        return next(a["id"] for a in r.json() if a["kind"] == kind)

    def assign_ta(self, course, **permissions):
        r = self.client.post(
            f"/api/courses/{course}/tas",
            headers=self.h("p1"),
            json={"identifier": "ta1", **permissions},
        )
        assert r.status_code == 201, r.text

    def final_submission(self, course, team):
        prefix = f"/api/courses/{course}/teams/{team['id']}/submissions"
        r = self.client.post(prefix, headers=self.h("s1"))
        assert r.status_code == 201, r.text
        submission = r.json()["id"]
        source = io.BytesIO()
        with zipfile.ZipFile(source, "w") as archive:
            archive.writestr("app.py", "print('hello')")
        for kind, name, content in [
            ("source_code", "source.zip", source.getvalue()),
            ("documentation", "report.pdf", b"%PDF-1.4\n%%EOF"),
            ("readme", "README.md", b"# Project"),
        ]:
            r = self.client.put(
                f"{prefix}/{submission}/files/{kind}",
                headers=self.h("s1"),
                files={"file": (name, content)},
            )
            assert r.status_code == 200, r.text
        r = self.client.post(f"{prefix}/{submission}/finalize", headers=self.h("s1"))
        assert r.status_code == 200, r.text
        return submission


def test_existing_accounts_only_and_session_revocation(setup):
    client = setup["client"]
    assert client.post("/api/auth/register", json={}).status_code == 404
    assert client.get("/api/courses").status_code == 401
    r = client.post(
        "/api/auth/login", json={"identifier": " P1@EXAMPLE.EDU ", "password": PASSWORD}
    )
    assert r.status_code == 200
    tokens = r.json()
    headers = {"Authorization": "Bearer " + tokens["access_token"]}
    me = client.get("/api/auth/me", headers=headers)
    assert me.json()["role"] == "professor"
    assert "password_hash" not in me.json()
    rotated = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert rotated.status_code == 200
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": rotated.json()["refresh_token"]}
        ).status_code
        == 401
    )


def test_lockout_is_persistent_and_cannot_be_bypassed_by_email(setup):
    client = setup["client"]
    for _ in range(5):
        assert (
            client.post(
                "/api/auth/login", json={"identifier": "s1", "password": "wrong"}
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/auth/login", json={"identifier": "s1@example.edu", "password": PASSWORD}
        ).status_code
        == 401
    )
    with setup["sessions"]() as db:
        assert db.get(User, setup["users"]["s1"]).locked_until > 0


def test_password_change_revokes_all_existing_sessions(setup):
    client = setup["client"]
    tokens = [
        client.post("/api/auth/login", json={"identifier": "s1", "password": PASSWORD}).json()
        for _ in range(2)
    ]
    headers = {"Authorization": "Bearer " + tokens[0]["access_token"]}
    r = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": PASSWORD, "new_password": "ChangedPassword@2026"},
    )
    assert r.status_code == 204
    for token in tokens:
        assert (
            client.get(
                "/api/auth/me", headers={"Authorization": "Bearer " + token["access_token"]}
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/auth/login", json={"identifier": "s1", "password": "ChangedPassword@2026"}
        ).status_code
        == 200
    )


def test_course_catalog_registration_and_ownership(setup):
    s = Scenario(setup)
    course = s.course()
    assert len(s.client.get("/api/courses/catalog", headers=s.h("s1")).json()) == 1
    assert s.client.get(f"/api/courses/{course}", headers=s.h("s1")).status_code == 403
    s.enroll(course, "s1")
    details = s.client.get(f"/api/courses/{course}", headers=s.h("s1")).json()
    assert len(details["assessments"]) == 5
    assert details["professor"]["id"] == s.ids["p1"]
    assert s.client.get("/api/courses/catalog", headers=s.h("s1")).json() == []
    assert s.client.get("/api/courses", headers=s.h("s1")).json()[0]["id"] == course
    assert (
        s.client.patch(
            f"/api/courses/{course}", headers=s.h("p2"), json={"title": "Unauthorized"}
        ).status_code
        == 403
    )
    assert (
        s.client.post(
            "/api/courses", headers=s.h("s1"), json={"code": "X", "semester": "S", "title": "X"}
        ).status_code
        == 403
    )
    assert s.client.post(f"/api/courses/{course}/enroll", headers=s.h("s1")).status_code == 409
    assert s.client.delete(f"/api/courses/{course}/enroll", headers=s.h("s1")).status_code == 204


def test_course_scoped_ta_permissions_and_grade_privacy(setup):
    s = Scenario(setup)
    course, other = s.course(), s.course("OTHER")
    s.enroll(course, "s1", "s2")
    s.assign_ta(course)
    assessment = s.assessment(course, "quiz1")
    base = f"/api/courses/{course}/assessments/{assessment}"
    assert (
        s.client.put(
            f"{base}/grades/{s.ids['s1']}", headers=s.h("ta1"), json={"score": 85}
        ).status_code
        == 200
    )
    assert s.client.get(f"/api/courses/{other}/students", headers=s.h("ta1")).status_code == 403
    assert s.client.get(f"/api/courses/{course}/students", headers=s.h("s1")).status_code == 403
    assert s.client.get(f"{base}/grades", headers=s.h("s1")).status_code == 403
    assert all(
        row["grade"] is None
        for row in s.client.get(f"/api/courses/{course}/my-grades", headers=s.h("s1")).json()
    )
    assert (
        s.client.post(
            f"{base}/publish", headers=s.h("ta1"), json={"student_ids": [s.ids["s1"]]}
        ).status_code
        == 403
    )
    assert (
        s.client.post(
            f"{base}/publish", headers=s.h("p1"), json={"student_ids": [s.ids["s1"]]}
        ).status_code
        == 200
    )
    assert any(
        row["grade"]
        for row in s.client.get(f"/api/courses/{course}/my-grades", headers=s.h("s1")).json()
    )
    assert all(
        row["grade"] is None
        for row in s.client.get(f"/api/courses/{course}/my-grades", headers=s.h("s2")).json()
    )
    assert (
        s.client.put(f"{base}/grades/{s.ids['s1']}", headers=s.h("ta1"), json={"score": 90}).json()[
            "is_published"
        ]
        is False
    )
    stats = s.client.get(f"{base}/grades", headers=s.h("p1")).json()
    assert float(stats["average"]) == 90 and stats["graded_count"] == 1
    assert (
        s.client.put(
            f"{base}/grades/{s.ids['s2']}", headers=s.h("ta1"), json={"score": 101}
        ).status_code
        == 422
    )
    s.client.patch(
        f"/api/courses/{course}/tas/{s.ids['ta1']}",
        headers=s.h("p1"),
        json={"can_manage_grades": False, "can_view_reports": False},
    )
    assert (
        s.client.put(
            f"{base}/grades/{s.ids['s2']}", headers=s.h("ta1"), json={"score": 50}
        ).status_code
        == 403
    )


def test_leader_selection_codes_capacity_and_one_team_per_course(setup):
    s = Scenario(setup)
    course = s.course(max_size=2)
    s.enroll(course, "s1", "s2", "s3")
    data = {"name": "Team", "project_title": "App"}
    assert (
        s.client.post(f"/api/courses/{course}/teams", headers=s.h("s1"), json=data).status_code
        == 403
    )
    team = s.team(course)
    assert len(team["join_code"]) >= 12
    assert (
        s.client.get(f"/api/courses/{course}/teams/{team['id']}", headers=s.h("s2")).status_code
        == 403
    )
    join = f"/api/courses/{course}/teams/join"
    assert s.client.post(join, headers=s.h("s2"), json={"code": "wrong"}).status_code == 404
    r = s.client.post(join, headers=s.h("s2"), json={"code": team["join_code"]})
    assert r.status_code == 200 and r.json()["is_ready"] is True and r.json()["join_code"] is None
    assert (
        s.client.post(join, headers=s.h("s2"), json={"code": team["join_code"]}).status_code == 409
    )
    assert (
        s.client.post(join, headers=s.h("s3"), json={"code": team["join_code"]}).status_code == 409
    )
    assert s.client.delete(f"/api/courses/{course}/enroll", headers=s.h("s2")).status_code == 409
    other = s.course("OTHER")
    s.enroll(other, "s2")
    assert (
        s.client.post(
            f"/api/courses/{other}/teams/join", headers=s.h("s2"), json={"code": team["join_code"]}
        ).status_code
        == 404
    )
    assert s.team(other, "s2")["id"] != team["id"]


def test_upload_final_lock_report_versions_and_project_publication(setup):
    s = Scenario(setup)
    course = s.course()
    s.enroll(course, "s1", "s2", "s3")
    s.assign_ta(course)
    team = s.team(course)
    s.client.post(
        f"/api/courses/{course}/teams/join", headers=s.h("s2"), json={"code": team["join_code"]}
    )
    submission = s.final_submission(course, team)
    base = f"/api/courses/{course}/teams/{team['id']}"
    upload = f"{base}/submissions/{submission}/files/readme"
    assert (
        s.client.put(
            upload, headers=s.h("s1"), files={"file": ("README.md", b"changed")}
        ).status_code
        == 409
    )
    assert (
        s.client.put(
            upload, headers=s.h("s2"), files={"file": ("README.md", b"changed")}
        ).status_code
        == 403
    )
    assert s.client.post(f"{base}/leave", headers=s.h("s2")).status_code == 409
    assert (
        s.client.post(
            f"/api/courses/{course}/teams/join", headers=s.h("s3"), json={"code": team["join_code"]}
        ).status_code
        == 409
    )
    files = s.client.get(f"{base}/submissions", headers=s.h("s2")).json()[0]["files"]
    file_id = files[0]["id"]
    url = f"{base}/submissions/{submission}/files/{file_id}/download"
    assert s.client.get(url, headers=s.h("s2")).status_code == 200
    assert s.client.get(url, headers=s.h("s3")).status_code == 403
    assert (
        s.client.get(
            url.replace(f"/{submission}/files", "/999/files"), headers=s.h("s2")
        ).status_code
        == 404
    )
    assessment = s.assessment(course, "project")
    grades = f"/api/courses/{course}/assessments/{assessment}"
    for name in ["s1", "s2"]:
        s.client.put(f"{grades}/grades/{s.ids[name]}", headers=s.h("ta1"), json={"score": 80})
    assert (
        s.client.post(
            f"{grades}/publish", headers=s.h("p1"), json={"student_ids": [s.ids["s1"]]}
        ).status_code
        == 409
    )
    for name in ["s1", "s2"]:
        body = {
            "student_id": s.ids[name],
            "submission_id": submission,
            "status": "completed",
            "summary": "Understands the project",
            "questions": [
                {"question": "Why FastAPI?", "answer": "Validation and APIs", "result": "correct"}
            ],
        }
        r = s.client.post(f"{base}/reports", headers=s.h("ta1"), json=body)
        assert r.status_code == 201 and r.json()["version"] == 1
    assert s.client.get(f"{base}/reports", headers=s.h("s1")).json() == []
    assert (
        s.client.post(
            f"{grades}/publish", headers=s.h("p1"), json={"student_ids": [s.ids["s1"], s.ids["s2"]]}
        ).status_code
        == 200
    )
    own = s.client.get(f"{base}/reports", headers=s.h("s1")).json()
    assert len(own) == 1 and own[0]["student_id"] == s.ids["s1"]
    body["student_id"] = s.ids["s1"]
    body["status"] = "incomplete"
    assert s.client.post(f"{base}/reports", headers=s.h("p1"), json=body).json()["version"] == 2
    assert s.client.get(f"{base}/reports", headers=s.h("s1")).json() == []
    assert (
        s.client.post(
            f"{grades}/publish", headers=s.h("p1"), json={"student_ids": [s.ids["s1"]]}
        ).status_code
        == 409
    )
    assert len(s.client.get(f"{base}/reports", headers=s.h("p1")).json()) == 3


def test_invalid_and_oversized_files_do_not_create_records(setup):
    s = Scenario(setup)
    course = s.course()
    s.enroll(course, "s1")
    team = s.team(course)
    prefix = f"/api/courses/{course}/teams/{team['id']}/submissions"
    submission = s.client.post(prefix, headers=s.h("s1")).json()["id"]
    source = io.BytesIO()
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("../../escape.py", "bad")
    for kind, name, content, status in [
        ("source_code", "evil.zip", source.getvalue(), 422),
        ("source_code", "broken.zip", b"not a zip", 422),
        ("documentation", "fake.pdf", b"not a PDF", 422),
        ("readme", "README.md", b"x" * (1024 * 1024 + 1), 413),
        ("readme", "README.md", b"", 422),
    ]:
        r = s.client.put(
            f"{prefix}/{submission}/files/{kind}",
            headers=s.h("s1"),
            files={"file": (name, content)},
        )
        assert r.status_code == status, r.text
    assert s.client.get(prefix, headers=s.h("s1")).json()[0]["files"] == []
    assert s.client.post(f"{prefix}/{submission}/finalize", headers=s.h("s1")).status_code == 422


def test_closed_registration_and_unpublished_courses(setup):
    s = Scenario(setup)
    course = s.course()
    s.client.patch(f"/api/courses/{course}", headers=s.h("p1"), json={"enrollment_open": False})
    assert s.client.post(f"/api/courses/{course}/enroll", headers=s.h("s1")).status_code == 403
    s.client.patch(f"/api/courses/{course}", headers=s.h("p1"), json={"enrollment_open": True})
    s.enroll(course, "s1")
    s.client.patch(f"/api/courses/{course}", headers=s.h("p1"), json={"is_published": False})
    assert s.client.get("/api/courses", headers=s.h("s1")).json() == []
    assert s.client.get(f"/api/courses/{course}", headers=s.h("s1")).status_code == 403


def test_logout_immediately_revokes_access_and_refresh(setup):
    client = setup["client"]
    tokens = client.post("/api/auth/login", json={"identifier": "s1", "password": PASSWORD}).json()
    headers = {"Authorization": "Bearer " + tokens["access_token"]}
    assert (
        client.post(
            "/api/auth/logout", headers=headers, json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )


def test_swagger_login_input_validation_and_streamed_request_limit(setup):
    client = setup["client"]
    r = client.post("/api/auth/token", data={"username": "s1", "password": PASSWORD})
    assert r.status_code == 200
    headers = {"Authorization": "Bearer " + r.json()["access_token"]}
    assert (
        client.post(
            "/api/courses",
            headers=headers,
            json={"code": "A", "semester": "S", "title": "X", "professor_id": 1},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/auth/login",
            content=iter([b"x" * (3 * 1024 * 1024)]),
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )


def test_user_import_hashes_and_never_overwrites_existing_passwords(setup):
    from app.cli import add_user

    with setup["sessions"]() as db:
        assert add_user(db, "new1", "new@example.edu", "New", "student", PASSWORD) is True
        db.commit()
        saved = db.scalar(select(User).where(User.university_id == "new1"))
        assert saved.password_hash.startswith("$argon2") and PASSWORD not in saved.password_hash
        old_hash = saved.password_hash
        assert (
            add_user(db, "new1", "new@example.edu", "New", "student", "DifferentPassword@123")
            is False
        )
        assert saved.password_hash == old_hash


def test_frontend_course_contract_exposes_scoped_leaders_and_ta_permissions(setup):
    s = Scenario(setup)
    course = s.course()
    s.enroll(course, "s1")
    r = s.client.post(
        f"/api/courses/{course}/tas",
        headers=s.h("p1"),
        json={"identifier": "ta1", "can_manage_grades": False, "can_view_reports": True},
    )
    assert r.status_code == 201
    r = s.client.patch(
        f"/api/courses/{course}/students/{s.ids['s1']}/leader",
        headers=s.h("p1"),
        json={"can_create_team": True},
    )
    assert r.status_code == 200
    detail = s.client.get(f"/api/courses/{course}", headers=s.h("p1")).json()
    assert detail["student_count"] == 1
    assert detail["teaching_assistants"][0]["email"] == "ta1@example.edu"
    assert detail["ta_permissions"][str(s.ids["ta1"])] == {
        "can_manage_grades": False,
        "can_view_reports": True,
    }
    students = s.client.get(f"/api/courses/{course}/students", headers=s.h("p1")).json()
    assert students[0]["can_create_team"] is True
    assert s.client.get(f"/api/courses/{course}/students", headers=s.h("s1")).status_code == 403
