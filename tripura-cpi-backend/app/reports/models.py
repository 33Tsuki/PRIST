from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class GenerateReportRequest(BaseModel):
    report_type: str
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    file_format: Literal["pdf", "docx", "xlsx"] = "pdf"
    # Validated against the report type's params_model / column catalog
    params: dict[str, Any] = Field(default_factory=dict)
    columns: list[str] | None = None  # None -> the report type's defaults
    # Row counts above REPORT_WARN_ROWS are rejected with 409
    # {requires_confirmation: true} until re-submitted with confirm=true
    confirm: bool = False


class UpdateReportRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)


class GeneratedReportOut(BaseModel):
    generated_report_id: int
    report_type: str
    title: str
    description: str | None = None
    file_format: str
    params: dict[str, Any]
    status: str  # PENDING | READY | FAILED — poll GET /reports while PENDING
    progress: int  # 0-100; real for docx/xlsx, stage-based for pdf
    error: str | None = None
    completed_at: datetime | None = None
    generated_by_user_id: int
    generated_by_username: str | None = None
    district_id: int | None = None
    created_at: datetime | None = None


class PreviewReportRequest(BaseModel):
    """Dry run of a report: same report_type/params/columns as generation,
    minus everything about the output document."""

    report_type: str
    params: dict[str, Any] = Field(default_factory=dict)
    columns: list[str] | None = None  # None -> the report type's defaults
    limit: int = Field(default=100, ge=1, le=500)  # rows returned, not fetched


class PreviewColumn(BaseModel):
    key: str
    label: str


class ReportPreviewSection(BaseModel):
    heading: str | None = None
    columns: list[PreviewColumn]
    rows: list[list[str]]  # positional, aligned to columns; document-formatted
    total_rows: int  # rows in this section before truncation


class ReportLimits(BaseModel):
    warn_rows: int
    max_rows_pdf_docx: int
    max_rows_xlsx: int


class ReportPreviewOut(BaseModel):
    report_type: str
    report_title: str
    meta: list[tuple[str, str]]  # the header block the document would carry
    sections: list[ReportPreviewSection]
    total_rows: int
    returned_rows: int
    truncated: bool
    limits: ReportLimits
    exceeds_warn_threshold: bool  # generation will need confirm=true
    allowed_formats: list[str]  # formats whose hard cap total_rows fits under


class ReportColumnOut(BaseModel):
    key: str
    label: str
    default: bool
    # Param keys that force this column into the report. While any of them is
    # set the column is always rendered, so a client should show it as locked.
    implied_by: list[str] = Field(default_factory=list)


class ReportTypeOut(BaseModel):
    key: str
    sequence: int  # 1-based display order; the list is returned sorted by it
    title: str
    description: str
    columns: list[ReportColumnOut]
    params_schema: dict[str, Any]  # JSON Schema of the params model
