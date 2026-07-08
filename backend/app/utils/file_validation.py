"""
Audio file validation utilities.

Provides:
- ALLOWED_EXTENSIONS: accepted upload extensions
- AUDIO_MAGIC_BYTES: prefix signatures for common audio formats
- validate_audio_file(): rejects uploads with wrong extension AND/OR
  wrong magic bytes
"""

import os
from typing import Final

ALLOWED_EXTENSIONS: Final = frozenset({".mp3", ".wav", ".flac", ".ogg"})

# Each entry maps to a list of acceptable magic-byte prefixes (first N bytes
# of the file).  Hex literals, not bytes objects, to keep the table readable.
AUDIO_MAGIC_BYTES: Final = {
    ".mp3": [
        b"ID3",                  # ID3v2 tag
        b"\xff\xfb",             # MPEG-1 Layer 3
        b"\xff\xf3",             # MPEG-1 Layer 3 (alternative sync)
        b"\xff\xf2",             # MPEG-1 Layer 2
        b"\xff\xe3",             # MPEG-2 Layer 3
    ],
    ".wav": [b"RIFF"],            # RIFF/WAVE — second 4 bytes are "WAVE"
    ".flac": [b"fLaC"],
    ".ogg": [b"OggS"],
}

# How many bytes we need to read to cover the longest known signature.
# 4 bytes is enough for every format above; bump if a new format is added.
PREFIX_READ_BYTES: Final = 12


def _read_magic(file_obj, n: int) -> bytes:
    """Read up to ``n`` bytes from the start of ``file_obj`` without
    consuming the rest of the stream.  Works for both regular files and
    SpooledTemporaryFile (used by FastAPI's UploadFile)."""
    pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
    try:
        if hasattr(file_obj, "seek"):
            file_obj.seek(0)
        return file_obj.read(n)
    finally:
        if hasattr(file_obj, "seek"):
            file_obj.seek(pos)


def detect_audio_format(filename: str, header: bytes) -> str | None:
    """
    Return the canonical extension (e.g. ``".mp3"``) if ``header`` matches
    one of the known audio formats AND the filename's extension is in the
    same family.  Returns ``None`` if no match.

    Both checks are required so that an attacker who renames a
    ``recording.wav`` to ``recording.mp3`` is rejected: magic bytes say
    WAVE, extension says MP3 → mismatch → None.
    """
    file_ext = os.path.splitext(filename or "")[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return None
    for ext, signatures in AUDIO_MAGIC_BYTES.items():
        for sig in signatures:
            if header.startswith(sig):
                # Content matches ``ext`` — only accept if the filename
                # agrees on the format family.
                return ext if ext == file_ext else None
    return None


def validate_audio_file(file_obj, filename: str) -> tuple[bool, str | None]:
    """
    Validate that ``file_obj`` is a supported audio upload.

    Returns ``(True, None)`` on success or ``(False, reason)`` on failure.
    The original ``file_obj`` is rewound to byte 0 before returning so the
    caller can re-read it.

    The check is intentionally conservative: a valid extension alone is
    not enough; the magic bytes must also match.
    """
    if not filename:
        return False, "Empty filename"

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, (
            f"File extension '{ext}' not allowed. "
            f"Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    header = _read_magic(file_obj, PREFIX_READ_BYTES)
    detected = detect_audio_format(filename, header)
    if detected is None:
        return False, (
            "File content does not match any supported audio format "
            f"(checked magic bytes for {', '.join(sorted(ALLOWED_EXTENSIONS))})"
        )

    # If we got here the extension and content agree on a known format.
    return True, None
