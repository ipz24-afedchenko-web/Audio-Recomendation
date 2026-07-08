import hashlib
import logging
import os
import tempfile
import uuid
from abc import ABC, abstractmethod
from typing import BinaryIO, Optional, Tuple

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024


class StorageBackend(ABC):

    @abstractmethod
    def save(self, file_obj: BinaryIO, filename: str, max_bytes: int) -> Tuple[str, str, int]:
        """
        Persist an uploaded file.

        Returns:
            (storage_path, sha256_hex, file_size)
        """

    @abstractmethod
    def delete(self, storage_path: str) -> None:
        """Remove a persisted file."""

    @abstractmethod
    def get_local_path(self, storage_path: str) -> str:
        """Return a path readable by librosa (may download to a temp dir)."""


class LocalStorage(StorageBackend):

    def __init__(self, upload_dir: str) -> None:
        self.upload_dir = upload_dir
        os.makedirs(upload_dir, exist_ok=True)

    def save(self, file_obj: BinaryIO, filename: str, max_bytes: int) -> Tuple[str, str, int]:
        ext = os.path.splitext(filename)[1].lower()
        unique = f"{uuid.uuid4()}{ext}"
        dest = os.path.join(self.upload_dir, unique)

        sha = hashlib.sha256()
        total = 0
        with open(dest, "wb") as f:
            while True:
                chunk = file_obj.read(CHUNK_SIZE)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    f.close()
                    os.remove(dest)
                    raise ValueError(f"Upload exceeds maximum size of {max_bytes} bytes")
                f.write(chunk)
                sha.update(chunk)

        return dest, sha.hexdigest(), total

    def delete(self, storage_path: str) -> None:
        if os.path.exists(storage_path):
            os.remove(storage_path)

    def get_local_path(self, storage_path: str) -> str:
        return storage_path


class S3Storage(StorageBackend):

    def __init__(self, bucket: str, region: str = "us-east-1", endpoint_url: Optional[str] = None) -> None:
        import boto3  # noqa: E402
        self.bucket = bucket
        self._s3 = boto3.client("s3", region_name=region, endpoint_url=endpoint_url)

    def save(self, file_obj: BinaryIO, filename: str, max_bytes: int) -> Tuple[str, str, int]:
        sha = hashlib.sha256()
        total = 0
        key = f"uploads/{uuid.uuid4()}_{filename}"

        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_name = tmp.name
            try:
                while True:
                    chunk = file_obj.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError(f"Upload exceeds maximum size of {max_bytes} bytes")
                    tmp.write(chunk)
                    sha.update(chunk)
                tmp.flush()

                self._s3.upload_file(tmp_name, self.bucket, key)
            finally:
                os.unlink(tmp_name)

        return f"s3://{self.bucket}/{key}", sha.hexdigest(), total

    def delete(self, storage_path: str) -> None:
        key = storage_path.split("/", 3)[-1]
        self._s3.delete_object(Bucket=self.bucket, Key=key)

    def get_local_path(self, storage_path: str) -> str:
        key = storage_path.split("/", 3)[-1]
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(key)[1])
        tmp_name = tmp.name
        tmp.close()
        self._s3.download_file(self.bucket, key, tmp_name)
        return tmp_name


_backend: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is not None:
        return _backend

    from app.database import get_settings  # noqa: E402
    s = get_settings()

    if s.storage_backend == "s3":
        _backend = S3Storage(
            bucket=s.s3_bucket,
            region=s.s3_region,
            endpoint_url=s.s3_endpoint,
        )
        logger.info("Using S3 storage backend (bucket=%s)", s.s3_bucket)
    else:
        _backend = LocalStorage(upload_dir=s.upload_dir)
        logger.info("Using local storage backend (dir=%s)", s.upload_dir)

    return _backend


def reset_storage_for_testing() -> None:
    global _backend
    _backend = None
