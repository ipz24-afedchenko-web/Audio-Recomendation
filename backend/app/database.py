from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings
from functools import lru_cache
import os
import sys


# Default secret is intentionally weak — it MUST be replaced in any
# non-development environment.  Hard-coded so we can detect it in the
# validator below.
_DEFAULT_INSECURE_SECRET = "your-secret-key-here-change-in-production"


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    # Off by default — SQL echo leaks parameters (incl. uploaded filenames
    # and tokens) into logs.  Enable locally only.
    debug: bool = False
    upload_dir: str = "uploads"
    max_upload_size: int = 52428800  # 50MB

    # Storage backend
    storage_backend: str = "local"  # "local" or "s3"
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_endpoint: Optional[str] = None

    # Spotify Web API (free tier).  Client Credentials flow.  NOTE: the
    # free Spotify Web API now requires a Premium subscription on the app
    # owner's account, so this is typically left disabled.  Set
    # SPOTIFY_ENABLED=true only when usable; otherwise the catalog tab is
    # hidden on the frontend.  ``spotify_enabled`` is derived True only
    # when explicitly enabled AND both credentials are present.
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_enabled: bool = False

    # OAuth callback for the global player feature.  The frontend opens
    # the Spotify authorization URL and the redirect lands here.
    spotify_redirect_uri: str = "http://127.0.0.1:3000/callback"

    # Custom-file lifecycle.  When True (default), a locally uploaded file
    # is deleted from storage as soon as librosa analysis completes — the
    # app keeps only the extracted features (free-hosting friendly).  Dev
    # can set False to retain files for debugging.
    delete_local_after_analyze: bool = False

    # Used by validators — never expose this in /api/health.
    environment: str = "development"

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }

    @field_validator("secret_key")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        """Reject missing/short/default secret keys in non-dev environments."""
        env = os.getenv("ENVIRONMENT", "development").lower()
        if not v or len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters long. "
                "Generate one with: python -c \"import secrets;print(secrets.token_urlsafe(48))\""
            )
        if v == _DEFAULT_INSECURE_SECRET and env in ("production", "staging"):
            raise ValueError(
                "SECRET_KEY is still the placeholder from .env.example — "
                "this is forbidden in production/staging."
            )
        return v

    @field_validator("debug")
    @classmethod
    def _debug_only_in_dev(cls, v: bool) -> bool:
        if v and os.getenv("ENVIRONMENT", "development").lower() in ("production", "staging"):
            print(
                "[settings] WARNING: DEBUG=True in production — disabling.",
                file=sys.stderr,
            )
            return False
        return v

    @field_validator("spotify_enabled", mode="before")
    @classmethod
    def _derive_spotify_enabled(cls, v):
        # Allow explicit override from env, otherwise derive from credentials.
        if isinstance(v, str):
            return v.lower() in ("1", "true", "yes", "on")
        return v

    def model_post_init(self, __context) -> None:
        # The free Spotify Web API now requires a Premium owner account, so
        # we do NOT auto-enable from credentials alone.  Enable only when
        # SPOTIFY_ENABLED is explicitly true AND both credentials exist.
        if isinstance(self.spotify_enabled, bool) and self.spotify_enabled:
            self.spotify_enabled = bool(
                self.spotify_client_id and self.spotify_client_secret
            )
        else:
            self.spotify_enabled = False


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()

# Create SQLAlchemy engine
# Note: pool_size / max_overflow are PostgreSQL/MySQL concepts; passing
# them to SQLite raises TypeError.  Branch on the URL so tests can use
# sqlite:///:memory: without special-casing every call site.
_engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 1800,
    "echo": settings.debug,
}
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs.update({"pool_size": 10, "max_overflow": 20})
engine = create_engine(settings.database_url, **_engine_kwargs)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
