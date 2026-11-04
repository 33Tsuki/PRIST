"""Hardened expansion of bulk uploads into individual spreadsheet payloads.

A bulk request may contain CSV/XLSX files directly and/or zip archives bundling
many of them. Zips are attacker-controllable, so expansion defends against
zip bombs (tiny archive -> gigabytes decompressed), archive floods (huge entry
counts), path traversal, nested/encrypted archives, and disallowed content.

`expand_file` turns one uploaded file into a list of `(display_name, bytes)`
spreadsheet payloads. A zip is expanded atomically: any structural/bomb problem
raises, so the whole archive fails as a single slot rather than half-importing.
"""

import io
import zipfile

from fastapi import HTTPException, UploadFile

from app.config import settings

_SPREADSHEET_EXTS = ("csv", "xlsx")


def _ext(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


async def _read_bounded(file: UploadFile, max_bytes: int, label: str) -> bytes:
    """Read an UploadFile fully but reject anything over max_bytes."""
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            413, f"{label} too large (max {max_bytes // (1024 * 1024)} MB)"
        )
    return data


async def expand_file(file: UploadFile) -> list[tuple[str, bytes]]:
    """Expand one uploaded file into spreadsheet payloads.

    CSV/XLSX -> a single payload. ZIP -> one payload per member (validated).
    Raises HTTPException on any size/format/security violation.
    """
    fname = file.filename or "unnamed"
    ext = _ext(fname)
    per_cap = settings.max_bulk_file_mb * 1024 * 1024

    if ext in _SPREADSHEET_EXTS:
        return [(fname, await _read_bounded(file, per_cap, f"'{fname}'"))]

    if ext == "zip":
        raw = await _read_bounded(
            file, settings.max_bulk_decompressed_mb * 1024 * 1024, f"Zip '{fname}'"
        )
        return _expand_zip(fname, raw)

    raise HTTPException(
        400, f"Unsupported file type: '{fname}' (expected .csv, .xlsx, or .zip)"
    )


def _expand_zip(archive_name: str, raw: bytes) -> list[tuple[str, bytes]]:
    """Validate and decompress a zip into spreadsheet payloads, atomically."""
    per_cap = settings.max_bulk_file_mb * 1024 * 1024
    total_cap = settings.max_bulk_decompressed_mb * 1024 * 1024

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(400, f"'{archive_name}' is not a valid zip file")

    members: list[tuple[str, bytes]] = []
    cumulative = 0

    with zf:
        infos = zf.infolist()
        if len(infos) > settings.max_zip_entries:
            raise HTTPException(
                400,
                f"Zip '{archive_name}' has too many entries "
                f"(max {settings.max_zip_entries})",
            )

        for info in infos:
            name = info.filename

            # Skip directories and macOS metadata junk.
            if info.is_dir() or name.endswith("/"):
                continue
            base = name.rsplit("/", 1)[-1]
            if not base or name.startswith("__MACOSX/") or base.startswith("._"):
                continue

            # Zip-slip defense: reject absolute paths and parent traversal.
            if name.startswith("/") or ".." in name.split("/"):
                raise HTTPException(400, f"Unsafe path in zip: '{name}'")

            ext = _ext(base)
            if ext == "zip":
                raise HTTPException(400, f"Nested zip not supported: '{name}'")
            if ext not in _SPREADSHEET_EXTS:
                raise HTTPException(
                    400, f"Unsupported file type in zip: '{name}' (only .csv/.xlsx)"
                )

            # Encrypted entries (general-purpose bit 0) cannot be read.
            if info.flag_bits & 0x1:
                raise HTTPException(400, f"Encrypted zip entry not supported: '{name}'")

            # Cheap pre-checks from the (untrusted) central directory.
            ratio = info.file_size / max(info.compress_size, 1)
            if ratio > settings.max_compression_ratio:
                raise HTTPException(
                    400, f"Suspicious compression ratio for '{name}' in zip"
                )
            if info.file_size > per_cap:
                raise HTTPException(
                    413,
                    f"Zip member '{name}' too large "
                    f"(max {settings.max_bulk_file_mb} MB)",
                )

            # The real defense: bounded decompression. Never trust file_size.
            with zf.open(info) as member:
                data = member.read(per_cap + 1)
            if len(data) > per_cap:
                raise HTTPException(
                    413,
                    f"Zip member '{name}' too large "
                    f"(max {settings.max_bulk_file_mb} MB)",
                )

            cumulative += len(data)
            if cumulative > total_cap:
                raise HTTPException(
                    413,
                    f"Zip '{archive_name}' decompresses to too much data "
                    f"(max {settings.max_bulk_decompressed_mb} MB)",
                )

            members.append((f"{archive_name}/{base}", data))

    if not members:
        raise HTTPException(400, f"Zip '{archive_name}' has no .csv/.xlsx files")

    return members


def build_zip(members: list[tuple[str, bytes]]) -> bytes:
    """Bundle `(filename, content)` pairs into a zip, the inverse of `_expand_zip`.

    Members are already-generated spreadsheets, so the output is deliberately flat
    (no directories) and re-expands cleanly through the bulk upload endpoint.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in members:
            zf.writestr(name.rsplit("/", 1)[-1], content)
    return buf.getvalue()
