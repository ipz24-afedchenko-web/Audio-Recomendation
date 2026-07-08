"""
Tests for the audio file validation utility.
"""

import io

import pytest

from app.utils.file_validation import (
    ALLOWED_EXTENSIONS,
    detect_audio_format,
    validate_audio_file,
)


class _FakeFile:
    """Minimal seekable file-like for validate_audio_file()."""

    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)

    def read(self, n: int = -1) -> bytes:
        return self._buf.read(n)

    def seek(self, pos: int) -> int:
        return self._buf.seek(pos)

    def tell(self) -> int:
        return self._buf.tell()


# Minimal valid headers
MP3_HEADER = b"ID3\x04\x00\x00\x00\x00\x00\x00"  # ID3v2.4 tag
WAV_HEADER = b"RIFF$\x00\x00\x00WAVEfmt "
FLAC_HEADER = b"fLaC\x00\x00\x00\x22"
OGG_HEADER = b"OggS\x00\x02\x00\x00\x00\x00"
PLAINTEXT = b"hello world, not audio"


@pytest.mark.parametrize(
    "filename,header,expected",
    [
        ("track.mp3", MP3_HEADER, ".mp3"),
        ("track.wav", WAV_HEADER, ".wav"),
        ("track.flac", FLAC_HEADER, ".flac"),
        ("track.ogg", OGG_HEADER, ".ogg"),
        ("track.mp3", PLAINTEXT, None),
        ("track.mp3", WAV_HEADER, None),  # wrong content
    ],
)
def test_detect_audio_format(filename, header, expected):
    assert detect_audio_format(filename, header) == expected


def test_allowed_extensions_complete():
    """The set should cover the four formats we ship with."""
    assert ALLOWED_EXTENSIONS == frozenset({".mp3", ".wav", ".flac", ".ogg"})


def test_validate_rejects_wrong_extension():
    f = _FakeFile(PLAINTEXT)
    ok, reason = validate_audio_file(f, "song.txt")
    assert ok is False
    assert "not allowed" in reason


def test_validate_rejects_wrong_magic_bytes():
    f = _FakeFile(PLAINTEXT)
    ok, reason = validate_audio_file(f, "song.mp3")
    assert ok is False
    assert "magic bytes" in reason


def test_validate_rejects_empty_filename():
    f = _FakeFile(MP3_HEADER)
    ok, reason = validate_audio_file(f, "")
    assert ok is False


def test_validate_accepts_valid_mp3_and_rewinds():
    f = _FakeFile(MP3_HEADER)
    ok, reason = validate_audio_file(f, "song.mp3")
    assert ok is True
    assert reason is None
    # The file pointer must be rewound so the caller can re-read it.
    assert f.tell() == 0


def test_validate_accepts_valid_wav():
    f = _FakeFile(WAV_HEADER)
    ok, _ = validate_audio_file(f, "song.wav")
    assert ok is True
