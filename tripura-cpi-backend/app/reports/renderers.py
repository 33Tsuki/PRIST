"""Render a ReportPayload to PDF, DOCX, or XLSX bytes.

All renderers consume the same pre-projected payload (the service has
already narrowed each section's columns to the user's selection), so the
formats always agree on content. Rendering is synchronous and CPU-bound —
callers must run it off the event loop (anyio.to_thread.run_sync).

DOCX/XLSX accept a progress_cb(done_rows, total_rows) invoked from their
row-write loops (throttling is the caller's concern). PDF cannot report
progress: WeasyPrint's write_pdf() is a single opaque call.
"""

import base64
import datetime
import io
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.reports.base import ReportPayload

ProgressCb = Callable[[int, int], None]

_MODULE_DIR = Path(__file__).parent
_LOGO_PATH = _MODULE_DIR / "assets" / "logo.png"

_env = Environment(
    loader=FileSystemLoader(_MODULE_DIR / "templates"),
    autoescape=select_autoescape(["html"]),
)


def _fmt(value: Any) -> str:
    if value is None:
        return ""
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    if isinstance(value, datetime.datetime):
        return value.strftime("%d %b %Y %H:%M")
    if isinstance(value, datetime.date):
        return value.strftime("%d %b %Y")
    if isinstance(value, Decimal):
        return f"{value.normalize():f}"
    return str(value)


def section_view(section, limit: int | None = None) -> dict:
    """Renderer-neutral view of one section: labels plus positional rows of
    display strings. `limit` truncates the rows (used by the preview
    endpoint, which shows a sample formatted exactly like the document)."""
    keys = list(section.columns.keys())
    rows = section.rows if limit is None else section.rows[:limit]
    return {
        "heading": section.heading,
        "labels": [c.label for c in section.columns.values()],
        "rows": [[_fmt(row.get(k)) for k in keys] for row in rows],
    }


def _total_rows(payload: ReportPayload) -> int:
    return sum(len(s.rows) for s in payload.sections)


def render_pdf(payload: ReportPayload, title: str, description: str | None) -> bytes:
    from weasyprint import HTML  # slow import; keep it off app startup

    logo_uri = None
    if _LOGO_PATH.exists():
        b64 = base64.b64encode(_LOGO_PATH.read_bytes()).decode()
        logo_uri = f"data:image/png;base64,{b64}"

    html = _env.get_template("report.html").render(
        title=title,
        description=description,
        meta=payload.meta,
        sections=[section_view(s) for s in payload.sections],
        logo_uri=logo_uri,
    )
    return HTML(string=html).write_pdf()


def render_docx(
    payload: ReportPayload,
    title: str,
    description: str | None,
    progress_cb: ProgressCb | None = None,
) -> bytes:
    import docx
    from docx.enum.section import WD_ORIENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    doc = docx.Document()

    # A4 landscape to match the PDF's dynamic-width tables
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width

    if _LOGO_PATH.exists():
        logo_par = doc.add_paragraph()
        logo_par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        logo_par.add_run().add_picture(str(_LOGO_PATH), height=Pt(40))

    org = doc.add_paragraph("Government of Tripura — Consumer Price Index Survey")
    org.alignment = WD_ALIGN_PARAGRAPH.CENTER

    heading = doc.add_heading(title, level=1)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if description:
        desc = doc.add_paragraph(description)
        desc.alignment = WD_ALIGN_PARAGRAPH.CENTER

    if payload.meta:
        meta_table = doc.add_table(rows=0, cols=2)
        for label, value in payload.meta:
            cells = meta_table.add_row().cells
            cells[0].text = label
            cells[1].text = value
            cells[1].paragraphs[0].runs[0].bold = True

    total = _total_rows(payload)
    done = 0
    for sec in payload.sections:
        view = section_view(sec)
        if view["heading"]:
            doc.add_heading(view["heading"], level=2)
        if not view["rows"]:
            doc.add_paragraph("No data for the selected filters.")
            continue
        table = doc.add_table(rows=1, cols=len(view["labels"]))
        table.style = "Light Grid Accent 6"
        for i, label in enumerate(view["labels"]):
            cell = table.rows[0].cells[i]
            cell.text = label
            cell.paragraphs[0].runs[0].bold = True
        for row in view["rows"]:
            cells = table.add_row().cells
            for i, cell_text in enumerate(row):
                cells[i].text = cell_text
            done += 1
            if progress_cb:
                progress_cb(done, total)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _xlsx_value(value: Any) -> Any:
    """Native cell values so Excel keeps types sortable/filterable."""
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=None)  # Excel does not support timezones
    return value  # None/str/int/float/date pass through


def render_xlsx(
    payload: ReportPayload,
    title: str,
    description: str | None,
    progress_cb: ProgressCb | None = None,
) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    green_fill = PatternFill(
        start_color="2C5F2D", end_color="2C5F2D", fill_type="solid"
    )
    header_font = Font(bold=True, color="FFFFFF")
    title_font = Font(bold=True, size=14, color="2C5F2D")
    label_font = Font(color="666666")

    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    ws.append(["Government of Tripura — Consumer Price Index Survey"])
    ws.append([title])
    ws["A2"].font = title_font
    if description:
        ws.append([description])
    ws.append([])
    for label, value in payload.meta:
        ws.append([label, value])
        ws.cell(row=ws.max_row, column=1).font = label_font
        ws.cell(row=ws.max_row, column=2).font = Font(bold=True)
    ws.append([])

    total = _total_rows(payload)
    done = 0
    single_section = len(payload.sections) == 1
    for sec in payload.sections:
        labels = [c.label for c in sec.columns.values()]
        keys = list(sec.columns.keys())
        if sec.heading:
            ws.append([sec.heading])
            ws.cell(row=ws.max_row, column=1).font = Font(
                bold=True, size=12, color="2C5F2D"
            )
        if not sec.rows:
            ws.append(["No data for the selected filters."])
            continue
        ws.append(labels)
        header_row = ws.max_row
        for col in range(1, len(labels) + 1):
            cell = ws.cell(row=header_row, column=col)
            cell.fill = green_fill
            cell.font = header_font
            cell.alignment = Alignment(vertical="center")
        if single_section:
            ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
            ws.auto_filter.ref = (
                f"A{header_row}:{get_column_letter(len(labels))}"
                f"{header_row + len(sec.rows)}"
            )
        for row in sec.rows:
            ws.append([_xlsx_value(row.get(k)) for k in keys])
            done += 1
            if progress_cb:
                progress_cb(done, total)
        # width from header + first rows, keeps the sheet readable
        for i, key in enumerate(keys, start=1):
            sample = [str(row.get(key) or "") for row in sec.rows[:50]]
            width = max(len(labels[i - 1]), *map(len, sample), 8)
            ws.column_dimensions[get_column_letter(i)].width = min(width + 3, 42)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
