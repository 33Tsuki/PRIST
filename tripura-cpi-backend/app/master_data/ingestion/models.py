from typing import Literal

from pydantic import BaseModel


class BulkRecordResult(BaseModel):
    row: int
    # "updated"/"unchanged" only occur in an upsert; a create-only upload still
    # reports exactly created/duplicate/skipped/error.
    status: Literal["created", "updated", "unchanged", "duplicate", "skipped", "error"]
    id: int | None = None
    identifier: str | None = None
    detail: str | None = None
    warning: str | None = None
    market_id: int | None = None
    changes: list[str] = []  # "unit_of_sale: 'kg' -> 'Kg'", for diff previews


class BulkUploadResponse(BaseModel):
    entity: str
    total: int
    created: int
    duplicates: int
    errors: int
    warnings: int
    dry_run: bool
    results: list[BulkRecordResult]
    updated: int = 0
    unchanged: int = 0
    mode: str = "create"


class FileUploadResult(BaseModel):
    """Outcome of one file within a bulk (multi-file / zip) upload.

    status="error" means the file failed as a whole (bad zip, parse failure,
    unknown market); per-row outcomes live in `results` when status="processed".
    """

    filename: str
    status: Literal["processed", "error"]
    detail: str | None = None
    total: int = 0
    created: int = 0
    duplicates: int = 0
    errors: int = 0
    warnings: int = 0
    results: list[BulkRecordResult] = []
    updated: int = 0
    unchanged: int = 0


class BulkBundleResponse(BaseModel):
    entity: str
    dry_run: bool
    file_count: int
    total: int
    created: int
    duplicates: int
    errors: int
    warnings: int
    files: list[FileUploadResult]
    updated: int = 0
    unchanged: int = 0
    mode: str = "create"
