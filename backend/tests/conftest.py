import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

# Tests do not connect to the application's DATABASE_URL, including your Neon DB.
os.environ.setdefault("DATABASE_URL", "sqlite:///./unused_test_connection.db")
os.environ.setdefault("SECRET_KEY", "local-tests-only-secret-key-never-use-in-production-123456")

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PASSWORD = "MonaqeshTestPassword@2026"


@pytest.fixture
def setup(tmp_path):
    test_url = os.getenv("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    if not test_url.startswith("sqlite") and not (make_url(test_url).database or "").endswith(
        "_test"
    ):
        raise RuntimeError("TEST_DATABASE_URL must refer to a disposable database ending in _test")
    engine = create_engine(test_url)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def foreign_keys(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    encoded = hash_password(PASSWORD)
    users = {}
    with sessions() as db:
        for identifier, role in [
            ("p1", "professor"),
            ("p2", "professor"),
            ("ta1", "ta"),
            ("ta2", "ta"),
            *[(f"s{i}", "student") for i in range(1, 8)],
        ]:
            user = User(
                university_id=identifier,
                email=f"{identifier}@example.edu",
                name=identifier,
                role=role,
                password_hash=encoded,
            )
            db.add(user)
            db.flush()
            users[identifier] = user.id
        db.commit()

    def override():
        with sessions() as db:
            try:
                yield db
            except Exception:
                db.rollback()
                raise

    app.dependency_overrides[get_db] = override
    app.state.rate_limits.clear()
    settings = get_settings()
    old_dir, old_max = settings.upload_dir, settings.max_upload_mb
    settings.upload_dir = tmp_path / "uploads"
    settings.max_upload_mb = 1
    with TestClient(app) as client:
        yield {"client": client, "users": users, "sessions": sessions, "engine": engine}
    settings.upload_dir, settings.max_upload_mb = old_dir, old_max
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
