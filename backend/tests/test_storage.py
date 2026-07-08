import io
import os
import tempfile
from unittest.mock import patch

import pytest

from app.services.storage import (
    LocalStorage,
    get_storage,
    reset_storage_for_testing,
)


def test_local_storage_save_and_delete():
    with tempfile.TemporaryDirectory() as tmpdir:
        ls = LocalStorage(upload_dir=tmpdir)
        data = b"hello, storage test"
        bio = io.BytesIO(data)
        path, sha, size = ls.save(bio, "test.txt", max_bytes=10_000)
        assert size == len(data)
        assert os.path.exists(path)
        assert path.startswith(tmpdir)
        with open(path, "rb") as f:
            assert f.read() == data
        ls.delete(path)
        assert not os.path.exists(path)


def test_local_storage_save_exceeds_max():
    with tempfile.TemporaryDirectory() as tmpdir:
        ls = LocalStorage(upload_dir=tmpdir)
        data = b"x" * 200
        bio = io.BytesIO(data)
        with pytest.raises(ValueError, match="exceeds maximum size"):
            ls.save(bio, "big.txt", max_bytes=100)
        # no orphan file
        assert len(os.listdir(tmpdir)) == 0


def test_local_storage_delete_nonexistent():
    with tempfile.TemporaryDirectory() as tmpdir:
        ls = LocalStorage(upload_dir=tmpdir)
        ls.delete(os.path.join(tmpdir, "nonexistent.txt"))  # should not crash


def test_local_storage_get_local_path():
    with tempfile.TemporaryDirectory() as tmpdir:
        ls = LocalStorage(upload_dir=tmpdir)
        assert ls.get_local_path("/some/path") == "/some/path"


def test_get_storage_singleton():
    reset_storage_for_testing()
    s1 = get_storage()
    s2 = get_storage()
    assert s1 is s2


def test_get_storage_local_backend():
    reset_storage_for_testing()
    with patch("app.database.get_settings") as mock_settings:
        mock_settings.return_value.storage_backend = "local"
        mock_settings.return_value.upload_dir = tempfile.mkdtemp()
        mock_settings.return_value.s3_bucket = ""
        mock_settings.return_value.s3_region = ""
        mock_settings.return_value.s3_endpoint = ""
        storage = get_storage()
        assert isinstance(storage, LocalStorage)


def test_reset_storage_for_testing():
    reset_storage_for_testing()
    s1 = get_storage()
    reset_storage_for_testing()
    s2 = get_storage()
    assert s1 is not s2
