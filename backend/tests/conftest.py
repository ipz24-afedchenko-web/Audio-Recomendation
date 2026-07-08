"""
Pytest fixtures and configuration.

Strategy:
- All tests use a SQLite database (file-backed, in a temp dir) so the
  production ``app.database.SessionLocal`` (which the BackgroundTask
  runner uses) and the test fixtures share the SAME database — not two
  separate in-memory databases that cannot see each other.
- We pin the test engine to a StaticPool so multiple connections share
  the same file.  Schema is created once per session.
- An isolated, throwaway ``uploads/`` directory is created per test
  session so we never touch the developer's real files.
- ``GEMINI_API_KEY`` is patched to a dummy value so ``ai_tagger`` can
  construct without hitting the network.
"""

import os
import shutil
import tempfile
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# --- 1. Env must be set BEFORE importing the app -------------------------
_TEST_DB_PATH = os.path.join(
    tempfile.mkdtemp(prefix="mgc-test-db-"), "test.sqlite"
)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB_PATH}")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long!!")
os.environ.setdefault("UPLOAD_DIR", tempfile.mkdtemp(prefix="mgc-test-uploads-"))
os.environ.setdefault("MAX_UPLOAD_SIZE", "52428800")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-dummy")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DEBUG", "false")

from app import database as _app_database  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
import app.services.audio_analyzer as _audio_analyzer  # noqa: E402
import app.services.train_models as _train_models  # noqa: E402
import app.services.storage as _storage  # noqa: E402


@pytest.fixture(scope="session")
def engine():
    """The test engine — pinned to StaticPool so all connections share
    the same in-process file.  We mirror the schema onto the *file* the
    production ``app.database.engine`` was configured with, so the
    BackgroundTask runner (which calls ``SessionLocal()``) sees the
    same tables.
    """
    eng = create_engine(
        f"sqlite:///{_TEST_DB_PATH}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def testing_session_local(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _truncate_all(db_engine) -> None:
    """Wipe every table between tests.  Faster than dropping + recreating
    and keeps the schema stable across the session."""
    with db_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f"DELETE FROM {table.name}"))


@pytest.fixture()
def db_session(testing_session_local, engine) -> Generator:
    """A clean DB session per test (truncated, not rolled back)."""
    _truncate_all(engine)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _redirect_production_session_local(testing_session_local):
    """Make sure the BackgroundTask runner and train_models script
    see the same SessionLocal as the test fixtures.  Without this,
    ``app.services.audio_analyzer.run_analysis`` opens its own
    session bound to a DIFFERENT in-memory DB that has no tables.
    """
    saved = (
        _app_database.SessionLocal,
        _audio_analyzer.SessionLocal,
        _train_models.SessionLocal,
    )
    _app_database.SessionLocal = testing_session_local
    _audio_analyzer.SessionLocal = testing_session_local
    _train_models.SessionLocal = testing_session_local
    try:
        yield
    finally:
        _app_database.SessionLocal, _audio_analyzer.SessionLocal, _train_models.SessionLocal = saved


@pytest.fixture()
def client(db_session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with the DB dependency overridden."""

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass  # session lifecycle owned by the db_session fixture

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers(client) -> dict:
    """Register a user, log in, return Authorization headers."""
    creds = {
        "email": "test@example.com",
        "username": "testuser",
        "password": "supersecret123",
    }
    r = client.post("/api/auth/register", json=creds)
    assert r.status_code == 201, r.text
    r = client.post(
        "/api/auth/login",
        data={"username": creds["username"], "password": creds["password"]},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _reset_storage_for_testing():
    """Reset the storage singleton before each test so test isolation
    is maintained (a previous test may have set it to a different dir)."""
    _storage.reset_storage_for_testing()
    yield


@pytest.fixture(scope="session")
def uploads_dir():
    """Session-scoped temp dir — never deleted mid-session.

    Per-test cleanup happens via unique filenames (``uuid4()`` in the
    route), so we don't need a per-test dir.  The dir is removed at
    the end of the session by an ``atexit`` hook below.
    """
    d = os.environ["UPLOAD_DIR"]
    yield d

import atexit

# Best-effort cleanup of the SQLite file + uploads dir at session end.
_atexit_paths = [
    _TEST_DB_PATH,
    os.path.dirname(_TEST_DB_PATH),
    os.environ["UPLOAD_DIR"],
]
atexit.register(
    lambda: [shutil.rmtree(p, ignore_errors=True) for p in _atexit_paths]
)
