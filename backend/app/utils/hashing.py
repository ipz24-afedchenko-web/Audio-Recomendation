"""
Streaming file hashing utilities.

We need a SHA-256 hex digest of the uploaded audio bytes so the upload
route can deduplicate per user.  The whole point of these helpers is to
hash WHILE copying the file to disk — we never want to read the file
twice for a 50MB MP3.

Public surface:
    compute_file_hash_and_save(file_obj, dest_path, max_bytes) -> tuple[str, int]
"""

import hashlib
import os
from typing import BinaryIO, Tuple

# 64 KiB is a good balance: large enough that the syscall overhead is
# amortised, small enough to not balloon memory for tiny silent clips.
CHUNK_SIZE = 64 * 1024


def compute_file_hash_and_save(
    file_obj: BinaryIO,
    dest_path: str,
    max_bytes: int,
) -> Tuple[str, int]:
    """
    Read ``file_obj`` in 64 KiB chunks, write to ``dest_path`` and
    simultaneously update a SHA-256 hasher.  Aborts and cleans up the
    partial file if the upload would exceed ``max_bytes``.

    Returns ``(sha256_hex, total_bytes)``.

    Raises:
        ValueError: when the upload would exceed ``max_bytes`` — the
            partial file is removed before raising.
    """
    sha = hashlib.sha256()
    total = 0

    with open(dest_path, "wb") as dest:
        while True:
            chunk = file_obj.read(CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                # Over budget — close + delete the partial file, then
                # raise.  We don't want orphan 49.9MB chunks lying
                # around in the uploads/ directory.
                dest.close()
                try:
                    os.remove(dest_path)
                except OSError:
                    pass
                raise ValueError(
                    f"Upload exceeds maximum size of {max_bytes} bytes"
                )
            dest.write(chunk)
            sha.update(chunk)

    return sha.hexdigest(), total
