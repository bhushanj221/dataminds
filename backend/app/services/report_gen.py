"""Report file generation. Turns a query result (columns + rows) into a
downloadable file in the requested format.

Slice 1 supports CSV and Excel — both fully covered by stdlib + openpyxl,
which are already in the image. PDF/dashboard-snapshot are a later slice.
"""
import csv
import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

FORMATS = {"csv", "excel"}

_EXT = {"csv": "csv", "excel": "xlsx"}
_MIME = {"csv": "csv", "excel": "vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


def filename_for(report_name: str, fmt: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in report_name).strip().replace(" ", "_")
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M")
    return f"{safe or 'report'}_{stamp}.{_EXT.get(fmt, 'txt')}"


def mime_subtype(fmt: str) -> str:
    return _MIME.get(fmt, "octet-stream")


def generate(columns: list[str], rows: list[list], fmt: str) -> bytes:
    if fmt == "csv":
        return _csv(columns, rows)
    if fmt == "excel":
        return _excel(columns, rows)
    raise ValueError(f"Unsupported report format: {fmt}")


def _csv(columns: list[str], rows: list[list]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    for r in rows:
        writer.writerow(["" if v is None else v for v in r])
    return buf.getvalue().encode("utf-8-sig")  # BOM so Excel opens UTF-8 cleanly


def _excel(columns: list[str], rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2563EB")
    ws.append(columns)
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill

    for r in rows:
        ws.append(["" if v is None else v for v in r])

    # auto-ish column widths (cap to keep it sane)
    for i, col in enumerate(columns, start=1):
        width = len(str(col))
        for r in rows[:200]:
            if i - 1 < len(r) and r[i - 1] is not None:
                width = max(width, len(str(r[i - 1])))
        ws.column_dimensions[get_column_letter(i)].width = min(max(width + 2, 10), 50)
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
