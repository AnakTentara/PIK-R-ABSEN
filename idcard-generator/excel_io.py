"""
Baca/tulis Excel daftar anggota (kontrak sama dengan ekspor dashboard).

Kolom (dicocokkan lewat judul, urutan & huruf besar/kecil bebas):
No | Kode ID Card | Nama Lengkap | NISN | Email | No. WhatsApp | Jenis Kelamin | Kelas | Link Profil
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

# (atribut RosterRow, judul kolom keluaran, lebar)
COLUMNS = [
    ("no", "No", 6),
    ("kode", "Kode ID Card", 16),
    ("nama", "Nama Lengkap", 34),
    ("nisn", "NISN", 14),
    ("email", "Email", 28),
    ("whatsapp", "No. WhatsApp", 16),
    ("gender", "Jenis Kelamin", 14),
    ("kelas", "Kelas", 10),
    ("link", "Link Profil", 46),
]
ALIASES = {
    "no": ["no", "nomor"],
    "kode": ["kode id card", "kode id", "kode", "id card", "id pik-r", "id pikr"],
    "nama": ["nama lengkap", "nama"],
    "nisn": ["nisn", "nik"],
    "email": ["email", "e-mail"],
    "whatsapp": ["no. whatsapp", "no whatsapp", "whatsapp", "no. wa", "no wa", "no. telepon", "telepon", "hp"],
    "gender": ["jenis kelamin", "gender", "jk"],
    "kelas": ["kelas"],
    "link": ["link profil", "link", "url"],
}

FAILED_HEADERS = ["Jenis", "File foto", "Nama terbaca (OCR)", "Nama di daftar", "Kode ID", "Keterangan"]
HEAD_FILL = PatternFill("solid", fgColor="F97316")
HEAD_FONT = Font(bold=True, color="FFFFFF")


@dataclass
class RosterRow:
    row: int = 0          # nomor baris di Excel (untuk pesan galat)
    no: str = ""
    kode: str = ""
    nama: str = ""
    nisn: str = ""
    email: str = ""
    whatsapp: str = ""
    gender: str = ""
    kelas: str = ""
    link: str = ""
    problem: str = ""     # diisi processor.prepare_roster bila baris tidak bisa dibuatkan kartu


def _text(v) -> str:
    """Sel -> teks. Angka bulat tidak boleh menjadi '123.0' (NISN, WA tersimpan sebagai angka)."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def load_roster(path: str | Path) -> list[RosterRow]:
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows_iter = ws.iter_rows(values_only=True)
    header = next(rows_iter, None)
    if not header:
        raise ValueError("Sheet pertama kosong")
    titles = [_text(h).lower().replace("*", "").strip() for h in header]
    col: dict[str, int] = {}
    for key, names in ALIASES.items():
        for name in names:
            if name in titles:
                col[key] = titles.index(name)
                break
    if "nama" not in col:
        raise ValueError('Kolom "Nama Lengkap" tidak ditemukan di baris pertama')

    out: list[RosterRow] = []
    for n, vals in enumerate(rows_iter, start=2):
        def get(key: str) -> str:
            i = col.get(key)
            return _text(vals[i]) if i is not None and i < len(vals) else ""
        r = RosterRow(row=n, **{k: get(k) for k in ("no", "kode", "nama", "nisn", "email", "whatsapp", "gender", "kelas", "link")})
        if not any((r.nama, r.kode, r.nisn, r.email, r.whatsapp, r.link)):
            continue  # baris kosong
        out.append(r)
    wb.close()
    return out


def _style_header(ws, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        c = ws.cell(row=1, column=i)
        c.font, c.fill = HEAD_FONT, HEAD_FILL
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"


def write_data_xlsx(path: str | Path, rows: list[RosterRow]) -> None:
    """Daftar akhir (Kode & Link sudah final) dengan kolom sama seperti kontrak, siap diimpor ke dashboard."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Anggota"
    ws.append([h for _, h, _ in COLUMNS])
    for i, r in enumerate(rows, start=1):
        ws.append([str(i)] + [getattr(r, k) for k, _, _ in COLUMNS[1:]])
    _style_header(ws, [w for _, _, w in COLUMNS])
    # NISN & WA sebagai teks supaya angka 0 di depan tidak hilang
    for letter in ("D", "F"):
        for cell in ws[letter][1:]:
            cell.number_format = "@"
    wb.save(path)


def write_failed_list(path: str | Path, items: list[dict]) -> None:
    """items: dict berkunci jenis, file, ocr, nama, kode, keterangan."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Failed"
    ws.append(FAILED_HEADERS)
    for it in items:
        ws.append([it.get("jenis", ""), it.get("file", ""), it.get("ocr", ""),
                   it.get("nama", ""), it.get("kode", ""), it.get("keterangan", "")])
    _style_header(ws, [22, 28, 30, 34, 16, 60])
    wb.save(path)


def read_sheet(path: str | Path) -> list[list[str]]:
    """Baca seluruh sheet pertama sebagai teks (dipakai tes)."""
    wb = load_workbook(path, read_only=True, data_only=True)
    out = [[_text(c) for c in row] for row in wb.worksheets[0].iter_rows(values_only=True)]
    wb.close()
    return out
