"""
Tests for the SHA-256 streaming hasher.

We do not test the file-validation magic-byte code here — it has its
own file.  This file is dedicated to the copy + hash + size-cap path
because all three are interleaved and a regression on any of them
breaks the dedup guarantee.
"""

import io
import os
import tempfile

import pytest

from app.utils.hashing import CHUNK_SIZE, compute_file_hash_and_save


def _stream(data: bytes) -> io.BytesIO:
    return io.BytesIO(data)


def test_compute_hash_simple():
    """Known vector for 'abc' is well documented."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "x.mp3")
        h, size = compute_file_hash_and_save(_stream(b"abc"), path, max_bytes=1000)
        assert h == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        assert size == 3
        with open(path, "rb") as f:
            assert f.read() == b"abc"


def test_compute_hash_empty_file():
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "x.mp3")
        h, size = compute_file_hash_and_save(_stream(b""), path, max_bytes=1000)
        # SHA-256 of empty string
        assert h == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        assert size == 0


def test_compute_hash_cleans_up_on_size_exceeded():
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "x.mp3")
        with pytest.raises(ValueError, match="exceeds"):
            compute_file_hash_and_save(
                _stream(b"X" * 1000), path, max_bytes=100
            )
        # Partial file must have been removed.
        assert not os.path.exists(path)


def test_compute_hash_handles_large_chunk():
    """Multiple chunks should hash to the same value as one call."""
    data = b"Y" * (CHUNK_SIZE * 3 + 17)
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "x.mp3")
        h, size = compute_file_hash_and_save(_stream(data), path, max_bytes=10_000_000)
        assert size == len(data)
        # Sanity: SHA-256 hex is 64 chars.
        assert len(h) == 64
        # Recompute via hashlib in one shot — must match.
        import hashlib
        assert h == hashlib.sha256(data).hexdigest()
