import csv
import io
from typing import Any

from fastapi import HTTPException, UploadFile

from app.config import settings


async def parse_upload(file: UploadFile) -> list[dict[str, str]]:
    """Parse a CSV or XLSX upload into a list of dicts with lowercase keys."""
    if not file.filename:
        raise HTTPException(400, "Filename is required")

    content = await file.read()

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(413, f"File too large (max {settings.max_upload_mb} MB)")

    return parse_content(file.filename, content)


def parse_content(filename: str, content: bytes) -> list[dict[str, str]]:
    """Parse already-read CSV/XLSX bytes into a list of lowercase-keyed dicts.

    Shared by parse_upload and the bulk expander (which reads bytes itself, applying
    its own size limits). Performs no size check — callers bound the byte length.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("csv", "xlsx"):
        raise HTTPException(400, "Only .csv and .xlsx files are accepted")

    if not content:
        raise HTTPException(400, "File is empty")

    if ext == "xlsx" and content[:4] != b"PK\x03\x04":
        raise HTTPException(400, "File content does not match .xlsx format")

    if ext == "csv":
        return _parse_csv(content)
    return _parse_xlsx(content)


def _parse_csv(content: bytes) -> list[dict[str, str]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "File is empty or has no headers")
    rows: list[dict[str, str]] = []
    for raw in reader:
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw.items()}
        rows.append(row)
    if not rows:
        raise HTTPException(400, "File contains no data rows")
    return rows


def _parse_xlsx(content: bytes) -> list[dict[str, str]]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    if ws is None:
        raise HTTPException(400, "Workbook has no active sheet")

    row_iter = ws.iter_rows(values_only=True)
    header_row = next(row_iter, None)
    if not header_row:
        raise HTTPException(400, "File is empty or has no headers")

    headers = [str(h).strip().lower() if h is not None else "" for h in header_row]

    rows: list[dict[str, str]] = []
    for raw in row_iter:
        values = [str(v).strip() if v is not None else "" for v in raw]
        row = dict(zip(headers, values, strict=False))
        if any(v for v in row.values()):
            rows.append(row)

    wb.close()

    if not rows:
        raise HTTPException(400, "File contains no data rows")
    return rows


ColumnDef = dict[str, Any]


def generate_template_csv(columns: list[ColumnDef]) -> str:
    """Generate a CSV template string with headers and one example row."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([c["name"] for c in columns])
    writer.writerow([c.get("example", "") for c in columns])
    return output.getvalue()


# Header colour by column role. A sheet meant to be edited by hand has to say which
# columns identify a row and which are decorative; columns without a role (every
# master-data template) keep the original blue.
_ROLE_FILLS = {
    None: "4472C4",  # editable — the default
    "identity": "ED7D31",
    "ignored": "A6A6A6",
}

_IDENTITY_NOTE = (
    "This column identifies the row.\n"
    "Changing it adds a NEW entry rather than renaming the existing one.\n"
    "See the Instructions tab."
)


def _write_header(ws, columns: list[ColumnDef]) -> None:
    """Write a styled header row and seed each column's width from its title."""
    from openpyxl.comments import Comment
    from openpyxl.styles import Alignment, Font, PatternFill

    header_font = Font(bold=True, color="FFFFFF")
    header_align = Alignment(horizontal="center")

    for col_idx, col_def in enumerate(columns, start=1):
        name = col_def["name"]
        role = col_def.get("role")
        cell = ws.cell(row=1, column=col_idx, value=name)
        cell.font = header_font
        colour = _ROLE_FILLS.get(role, _ROLE_FILLS[None])
        cell.fill = PatternFill(start_color=colour, end_color=colour, fill_type="solid")
        cell.alignment = header_align
        if role == "identity":
            cell.comment = Comment(_IDENTITY_NOTE, "CPI Tripura", height=90, width=280)
        ws.column_dimensions[cell.column_letter].width = len(name) + 4


def generate_template_xlsx(columns: list[ColumnDef]) -> bytes:
    """Generate an XLSX template with headers, an example row, and formatting."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    _write_header(ws, columns)

    for col_idx, col_def in enumerate(columns, start=1):
        example = col_def.get("example", "")
        ws.cell(row=2, column=col_idx, value=example)

        # Auto-width based on longest of header/example + padding
        width = max(len(col_def["name"]), len(str(example))) + 4
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = width

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# Column width is sampled rather than measured over every row — long free-text
# fields would otherwise stretch a column past what Excel can usefully show.
_MAX_COL_WIDTH = 50
_WIDTH_SAMPLE_ROWS = 200


def generate_data_xlsx(
    columns: list[ColumnDef],
    rows: list[dict],
    *,
    sheet_name: str = "Data",
    extra_sheets: list[tuple[str, list[str], list[list]]] | None = None,
) -> bytes:
    """Render data rows into the same styled layout `generate_template_xlsx` produces.

    `rows` are keyed by column name (missing keys render blank). `extra_sheets` are
    informational tabs of `(title, headers, rows)`; the data sheet stays first so
    `_parse_xlsx` — which reads `wb.active` — round-trips the file unchanged.
    """
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    headers = [c["name"] for c in columns]
    _write_header(ws, columns)

    for row_idx, row in enumerate(rows, start=2):
        for col_idx, name in enumerate(headers, start=1):
            value = row.get(name)
            ws.cell(row=row_idx, column=col_idx, value="" if value is None else value)

    for col_idx, name in enumerate(headers, start=1):
        widest = max(
            (len(str(r.get(name) or "")) for r in rows[:_WIDTH_SAMPLE_ROWS]),
            default=0,
        )
        width = min(max(len(name), widest) + 4, _MAX_COL_WIDTH)
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = width

    for title, extra_headers, extra_rows in extra_sheets or []:
        sheet = wb.create_sheet(title=title[:31])
        _write_header(sheet, [{"name": h} for h in extra_headers])
        for row_idx, values in enumerate(extra_rows, start=2):
            for col_idx, value in enumerate(values, start=1):
                sheet.cell(
                    row=row_idx, column=col_idx, value="" if value is None else value
                )

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
