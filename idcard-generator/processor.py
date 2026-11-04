"""
Logika inti ID Card Generator (tanpa GUI, bisa diuji terpisah).

Alur:
  1. scan()     : OCR area "Nama" di setiap kartu depan -> daftar Entry
                  (setiap Entry menyimpan nama file asli sebagai label pengingat)
  2. order()    : INTI.png, INTI (2).png ... dulu (urutan file),
                  lalu anggota lain diurutkan A-Z menurut nama hasil OCR
  3. assign()   : beri kode PIKR_0001-26, PIKR_0002-26, ...
  4. (pengguna memeriksa / mengoreksi nama di GUI)
  5. generate() : Success/NAMA LENGKAP.png            depan + barcode batang (kode)
                  Success/Back/back_NAMA LENGKAP.png  belakang + QR kotak (link profil lengkap)
                  Failed/<file asli>                  nama kosong / belum diisi
                  Success/data_anggota.csv & .json    daftar kode-nama-link untuk diimpor ke website
"""
from __future__ import annotations

import csv
import difflib
import json
import re
import shutil
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path

from PIL import Image

import code128
import excel_io
from excel_io import RosterRow

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


# ─── Konfigurasi ────────────────────────────────────────────────────────────

@dataclass
class Box:
    """Kotak dalam koordinat relatif 0..1 terhadap ukuran gambar."""
    x: float
    y: float
    w: float
    h: float

    def to_px(self, size: tuple[int, int]) -> tuple[int, int, int, int]:
        W, H = size
        return round(self.x * W), round(self.y * H), round(self.w * W), round(self.h * H)


# Posisi default diukur dari desain ID Card PIK-R 2026/2027 (591 x 1004 px)
@dataclass
class Config:
    input_dir: str = ""
    back_image: str = ""
    roster_path: str = ""  # Excel daftar anggota (opsional); bila ada, kode/nama/link diambil dari sini
    name_box: Box = field(default_factory=lambda: Box(0.0, 0.785, 1.0, 0.052))
    front_barcode: Box = field(default_factory=lambda: Box(0.290, 0.848, 0.505, 0.075))
    back_qr: Box = field(default_factory=lambda: Box(0.412, 0.630, 0.395, 0.232))
    code_prefix: str = "PIKR_"
    code_suffix: str = "-26"
    code_digits: int = 4
    code_start: int = 1
    url_template: str = "https://pikr-manseku.my.id/@{handle}"
    inti_prefix: str = "INTI"
    # Hasil disimpan N kali ukuran asli supaya garis barcode tetap tajam saat dicetak
    output_scale: int = 3

    @classmethod
    def load(cls, path: Path) -> "Config":
        cfg = cls()
        if not path.exists():
            return cfg
        try:
            raw = json.loads(path.read_text("utf-8"))
        except (OSError, ValueError):
            return cfg
        for k, v in raw.items():
            if k in ("name_box", "front_barcode", "back_qr") and isinstance(v, dict):
                v = Box(**v)
            if hasattr(cfg, k):
                setattr(cfg, k, v)
        return cfg

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(asdict(self), indent=2), "utf-8")


# ─── Nama, kode & link ──────────────────────────────────────────────────────

def clean_name(text: str) -> str:
    """Rapikan hasil OCR jadi NAMA LENGKAP (huruf kapital, tanpa simbol nyasar)."""
    s = unicodedata.normalize("NFKC", text or "").upper()
    s = s.replace("0", "O").replace("1", "I").replace("|", "I").replace("5", "S")
    s = re.sub(r"[^A-Z.' ]+", " ", s)
    s = s.replace("'", "")                         # "NUR 'AINI" -> "NUR AINI"
    s = re.sub(r"\.(?=[A-Z])", ". ", s)            # "M.VANHOLEN" -> "M. VANHOLEN"
    words = [w.lstrip(".") for w in s.split()]
    words = [w for w in words if w]
    # Buang potongan 1 huruf di depan yang berasal dari dekorasi (garis/strip).
    # Inisial bertitik seperti "M." dipertahankan karena itu bagian nama asli.
    while words and len(words[0]) == 1:
        words.pop(0)
    return " ".join(words)


def make_handle(name: str) -> str:
    """'Kenzie Favian Mahardika' -> 'kenziefavianmahardika' (dipakai di link profil)."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s) or "anggota"


def make_code(cfg: Config, n: int) -> str:
    return f"{cfg.code_prefix}{n:0{cfg.code_digits}d}{cfg.code_suffix}"


def safe_filename(name: str) -> str:
    # Hapus karakter terlarang Windows
    s = re.sub(r'[<>:"/\\|?*]+', "", name).strip().upper()
    # Hapus tanda titik yang berada di paling akhir nama sebelum ekstensi
    s = s.rstrip('.')
    return s


# ─── Data per kartu ─────────────────────────────────────────────────────────

@dataclass
class Entry:
    file: str            # nama file asli, label pengingat (mis. "A (9).png")
    group: str           # "INTI" | "ANGGOTA"
    ocr: str = ""        # teks mentah hasil OCR
    name: str = ""       # nama final (bisa dikoreksi di GUI)
    confidence: float = 0.0
    code: str = ""
    handle: str = ""
    url: str = ""
    # Mode daftar Excel
    list_name: str = ""   # nama di daftar yang cocok dengan foto ini
    roster_idx: int = -1
    match: str = ""       # "" (tanpa daftar) | exact | approx | fail | dobel | problem
    reason: str = ""


def natural_key(name: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def list_inputs(folder: Path, exclude: Path | None = None) -> list[Path]:
    files = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT]
    if exclude:
        files = [p for p in files if p.resolve() != exclude.resolve()]
    return sorted(files, key=lambda p: file_order_key(p.name))


def file_order_key(path_name: str):
    """INTI.png = urutan 1, INTI (2).png = 2, ..., INTI (10).png = 10 (bukan urutan huruf)."""
    stem = Path(path_name).stem
    m = re.match(r"^(.*?)(?: \((\d+)\))?$", stem)
    return (natural_key(m.group(1)), int(m.group(2) or 1))


# ─── OCR ────────────────────────────────────────────────────────────────────

_ocr_engine = None


def ocr_text(img: Image.Image) -> tuple[str, float]:
    """OCR offline dengan RapidOCR. Mengembalikan (teks, keyakinan rata-rata 0..1)."""
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr_engine = RapidOCR()
    import numpy as np
    # Perbesar supaya huruf kecil lebih jelas terbaca
    scale = max(1.0, 96 / max(img.height, 1))
    if scale > 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)
    result, _ = _ocr_engine(np.array(img.convert("RGB")))
    if not result:
        return "", 0.0
    pieces = sorted(result, key=lambda r: r[0][0][0])  # kiri ke kanan
    text = " ".join(p[1] for p in pieces)
    conf = sum(float(p[2]) for p in pieces) / len(pieces)
    return text, conf


def crop_box(img: Image.Image, box: Box) -> Image.Image:
    x, y, w, h = box.to_px(img.size)
    return img.crop((x, y, x + w, y + h))


# ─── Langkah 1-3: scan, urutkan, beri kode ──────────────────────────────────

def scan(cfg: Config, progress=None, stop=lambda: False, ocr=None,
         roster: list[RosterRow] | None = None) -> list[Entry]:
    ocr = ocr or ocr_text
    folder = Path(cfg.input_dir)
    files = list_inputs(folder, Path(cfg.back_image) if cfg.back_image else None)
    entries = []
    for i, path in enumerate(files):
        if stop():
            break
        group = "INTI" if path.stem.upper().startswith(cfg.inti_prefix.upper()) else "ANGGOTA"
        try:
            raw, conf = ocr(crop_box(Image.open(path), cfg.name_box))
        except Exception as e:  # satu file rusak tidak menghentikan yang lain
            raw, conf = f"(error: {e})", 0.0
        e = Entry(file=path.name, group=group, ocr=raw, name=clean_name(raw), confidence=conf)
        entries.append(e)
        if progress:
            progress(i + 1, len(files), e)
    if roster is not None:
        return arrange(cfg, entries, roster)
    return assign(cfg, order(entries))


def order(entries: list[Entry]) -> list[Entry]:
    inti = sorted((e for e in entries if e.group == "INTI"), key=lambda e: file_order_key(e.file))
    # Anggota A-Z menurut nama; yang namanya belum terbaca ditaruh paling akhir
    rest = sorted((e for e in entries if e.group != "INTI"),
                  key=lambda e: (not e.name, e.name, file_order_key(e.file)))
    return inti + rest


def assign(cfg: Config, entries: list[Entry]) -> list[Entry]:
    """Beri kode berurutan + handle/link unik. Dipanggil ulang setiap nama dikoreksi."""
    seen: dict[str, int] = {}
    for i, e in enumerate(entries):
        e.code = make_code(cfg, cfg.code_start + i)
        base = make_handle(e.name) if e.name else ""
        if base:
            seen[base] = seen.get(base, 0) + 1
            e.handle = base if seen[base] == 1 else f"{base}{seen[base]}"
            e.url = cfg.url_template.format(handle=e.handle, code=e.code)
        else:
            e.handle = e.url = ""
    return entries


def duplicate_names(entries: list[Entry]) -> set[str]:
    names = [e.name for e in entries if e.name]
    return {n for n in names if names.count(n) > 1}


# ─── Mode daftar Excel ──────────────────────────────────────────────────────

OK_STATES = ("exact", "approx")
KIND_LABEL = {"fail": "FOTO TANPA DAFTAR", "dobel": "FOTO DOBEL", "problem": "DATA TIDAK LENGKAP"}


def name_words(s: str) -> list[str]:
    """'Ahmad  Abdallah, S.Pd' -> ['AHMAD', 'ABDALLAH', 'S', 'PD'] (huruf besar, tanpa aksen & simbol)."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z]+", " ", s).split()


def handle_of(link: str) -> str:
    return link.rsplit("/@", 1)[-1].strip().lower() if "/@" in (link or "") else ""


def prepare_roster(cfg: Config, rows: list[RosterRow]) -> list[RosterRow]:
    """Tentukan kode & link FINAL tiap baris daftar (mengubah baris di tempat).

    - baris berkode memakai kodenya; baris tanpa kode diberi nomor setelah kode tertinggi,
      mengikuti urutan baris Excel, tanpa bentrok
    - link kosong dibuat dari url_template + nama DAFTAR (bukan nama OCR)
    - baris tanpa nama / kode tak bisa jadi barcode / kode atau link dobel -> row.problem terisi
    """
    pat = re.compile(re.escape(cfg.code_prefix) + r"(\d+)", re.I)
    max_n = 0
    for r in rows:
        r.problem = ""
        r.kode = r.kode.strip()
        r.link = r.link.strip()
        m = pat.match(r.kode)
        if m:
            max_n = max(max_n, int(m.group(1)))

    seen: set[str] = set()
    for r in rows:
        if not r.nama.strip():
            r.problem = "nama kosong"
        elif r.kode:
            try:
                code128.encode(r.kode)
            except ValueError:
                r.problem = f"kode tidak bisa dijadikan barcode: {r.kode}"
            else:
                if r.kode.upper() in seen:
                    r.problem = f"kode dobel di daftar: {r.kode}"
                else:
                    seen.add(r.kode.upper())

    n = max_n
    for r in rows:
        if r.problem or r.kode:
            continue
        n += 1
        while make_code(cfg, n).upper() in seen:
            n += 1
        r.kode = make_code(cfg, n)
        seen.add(r.kode.upper())

    taken = {handle_of(r.link) for r in rows if r.link and not r.problem} - {""}
    links: set[str] = set()
    for r in rows:
        if r.problem:
            continue
        if r.link:
            if r.link.lower() in links:
                r.problem = f"link dobel di daftar: {r.link}"
            links.add(r.link.lower())
            continue
        base = make_handle(r.nama)
        h, k = base, 2
        while h in taken:
            h, k = f"{base}{k}", k + 1
        taken.add(h)
        r.link = cfg.url_template.format(handle=h, code=r.kode)
    return rows


def load_roster(cfg: Config) -> list[RosterRow] | None:
    """None bila roster_path kosong. Galat file dilempar ke pemanggil (GUI menampilkannya)."""
    if not cfg.roster_path:
        return None
    return prepare_roster(cfg, excel_io.load_roster(cfg.roster_path))


def _subsequence_prefix(card: list[str], db: list[str]) -> bool:
    """Tiap kata kartu = AWALAN satu kata daftar, berurutan (kata daftar boleh dilewati)."""
    j = 0
    for w in card:
        while j < len(db) and not db[j].startswith(w):
            j += 1
        if j == len(db):
            return False
        j += 1
    return True


def _flat_words_match(flat: str, db: list[str]) -> bool:
    """Huruf kartu (tanpa spasi) = rangkaian kata dari daftar secara berurutan (boleh melewati kata).

    - kata daftar dicocokkan penuh;
    - inisial di daftar ("M. Dzakwan Raziq") mewakili satu potongan 3-12 huruf di kartu ("MUHAMMAD");
    - sisa di ujung boleh berupa awalan kata daftar ("DZAKWANR" -> Dzakwan + R...), tetapi satu huruf
      lepas hanya diterima bila kata sebelumnya dicocokkan PENUH ("berjangkar"). Tanpa syarat ini
      "MUHAMMADYUNUS" lolos ke "M. Arzal Sya'bani" (M=MUHAMMADYUNU, S=awalan SYA).
    """
    n, m = len(flat), len(db)
    memo: dict[tuple[int, int, bool], bool] = {}

    def go(i: int, j: int, anchored: bool) -> bool:
        if i == n:
            return True
        key = (i, j, anchored)
        if key in memo:
            return memo[key]
        ok = False
        for k in range(j, m):
            w = db[k]
            if flat.startswith(w, i) and len(w) > 1 and go(i + len(w), k + 1, True):
                ok = True
                break
            if len(w) == 1 and k + 1 < m and flat[i] == w:
                if any(go(i + L, k + 1, False) for L in range(3, min(12, n - i - 1) + 1)):
                    ok = True
                    break
            if len(w) > 1 and w.startswith(flat[i:]) and (n - i >= 2 or anchored):
                ok = True
                break
        memo[key] = ok
        return ok

    return go(0, 0, False)


def _initial_match(cw: list[str], db: list[str]) -> bool:
    """Kartu diawali inisial ("M. AMIRULAMIN"): inisial = huruf pertama sebuah kata daftar
    ("Muhammad"), sisanya dicocokkan tanpa spasi dengan kata-kata sesudahnya."""
    if len(cw) < 2 or len(cw[0]) != 1:
        return False
    rest = "".join(cw[1:])
    return any(w.startswith(cw[0]) and _flat_words_match(rest, db[k + 1:]) for k, w in enumerate(db[:-1]))


def match_name(card_name: str, roster: list[RosterRow], min_ratio: float = 0.88,
               margin: float = 0.05) -> tuple[int | None, str, str]:
    """Cocokkan nama di foto ke daftar -> (indeks | None, 'exact'|'approx'|'fail', alasan).

    1) kata-kata sama persis  2) kata kartu = awalan kata daftar secara berurutan
    ("ABDALLAH RAFIQI" -> "Ahmad Abdallah Rafiqi", "MAIRA H" -> "Maira Harizon")
    3) cadangan: difflib >= min_ratio dan unggul jelas dari kandidat kedua.
    Hanya diterima bila tepat 1 kandidat.
    """
    cw = name_words(card_name)
    if not cw:
        return None, "fail", "nama di foto kosong / tidak terbaca"
    dbw = [name_words(r.nama) for r in roster]
    flat = "".join(cw)

    # Spasi hasil OCR tidak bisa dipercaya (teks kartu sering dirapatkan: "ADRINNEANANDYAARSYA"),
    # jadi huruf-hurufnya dibandingkan tanpa spasi; nama berspasi diambil dari daftar.
    exact = [i for i, w in enumerate(dbw) if w and w == cw]
    if len(exact) == 1:
        return exact[0], "exact", ""
    if len(exact) > 1:
        return None, "fail", "nama kembar di daftar: " + ", ".join(roster[i].nama for i in exact[:4])

    same = [i for i, w in enumerate(dbw) if w and "".join(w) == flat]
    if len(same) == 1:
        return same[0], "exact", "spasi nama diambil dari daftar"
    if len(same) > 1:
        return None, "fail", "nama kembar di daftar: " + ", ".join(roster[i].nama for i in same[:4])

    if len(flat) < 3:
        return None, "fail", "nama terlalu pendek untuk dicocokkan"
    cand = [i for i, w in enumerate(dbw) if w and (_subsequence_prefix(cw, w) or _flat_words_match(flat, w)
                                                  or _initial_match(cw, w))]
    if len(cand) == 1:
        return cand[0], "approx", "nama singkatan / sebagian cocok dengan daftar"
    if len(cand) > 1:
        return None, "fail", "cocok ke lebih dari 1 nama di daftar: " + ", ".join(roster[i].nama for i in cand[:4])

    scored = sorted(((difflib.SequenceMatcher(None, flat, "".join(w)).ratio(), i)
                     for i, w in enumerate(dbw) if w), reverse=True)
    if scored and scored[0][0] >= min_ratio and (len(scored) == 1 or scored[0][0] - scored[1][0] >= margin):
        return scored[0][1], "approx", f"mirip {scored[0][0]:.0%}"
    hint = f" (terdekat: {roster[scored[0][1]].nama}, {scored[0][0]:.0%})" if scored and scored[0][0] >= 0.6 else ""
    return None, "fail", "nama tidak ditemukan di daftar" + hint


def arrange(cfg: Config, entries: list[Entry], roster: list[RosterRow]) -> list[Entry]:
    """Cocokkan semua foto ke daftar, isi kode/link dari daftar, urutkan menurut baris Excel.

    Yang cocok di depan (urut baris daftar), yang gagal di belakang (urut nama file).
    Dipanggil ulang setiap nama dikoreksi di GUI.
    """
    for e in entries:
        idx, kind, reason = match_name(e.name, roster)
        e.roster_idx = idx if idx is not None else -1
        e.match, e.reason = kind, reason
        e.list_name = e.code = e.handle = e.url = ""

    by_row: dict[int, list[Entry]] = {}
    for e in entries:
        if e.roster_idx >= 0:
            by_row.setdefault(e.roster_idx, []).append(e)
    for group in by_row.values():
        group.sort(key=lambda e: (e.match != "exact", -e.confidence, file_order_key(e.file)))
        for loser in group[1:]:
            loser.match = "dobel"
            loser.reason = f"baris daftar ini sudah dipakai foto {group[0].file}"

    for e in entries:
        if e.roster_idx < 0:
            continue
        r = roster[e.roster_idx]
        e.list_name = r.nama
        if e.match in OK_STATES:
            if r.problem:
                e.match, e.reason = "problem", r.problem
            else:
                e.code, e.url, e.handle = r.kode, r.link, handle_of(r.link)

    ok = sorted((e for e in entries if e.match in OK_STATES), key=lambda e: e.roster_idx)
    rest = sorted((e for e in entries if e.match not in OK_STATES), key=lambda e: file_order_key(e.file))
    return ok + rest


def failed_item(e: Entry, roster: list[RosterRow], jenis: str | None = None, note: str | None = None) -> dict:
    row = roster[e.roster_idx] if e.roster_idx >= 0 else None
    return {"jenis": jenis or KIND_LABEL.get(e.match, "GALAT PEMROSESAN"), "file": e.file,
            "ocr": e.name or e.ocr, "nama": row.nama if row else "", "kode": row.kode if row else "",
            "keterangan": note if note is not None else e.reason}


def missing_items(entries: list[Entry], roster: list[RosterRow]) -> list[dict]:
    """Baris daftar yang tidak punya foto (atau datanya tidak lengkap)."""
    used = {e.roster_idx for e in entries if e.roster_idx >= 0}
    out = []
    for i, r in enumerate(roster):
        if i in used:
            continue
        if r.problem:
            out.append({"jenis": "DATA TIDAK LENGKAP", "file": "", "ocr": "", "nama": r.nama,
                        "kode": r.kode, "keterangan": r.problem})
        else:
            out.append({"jenis": "DAFTAR TANPA FOTO", "file": "", "ocr": "", "nama": r.nama,
                        "kode": r.kode, "keterangan": "tidak ada foto kartu yang cocok dengan nama ini"})
    return out


def roster_summary(entries: list[Entry], roster: list[RosterRow]) -> dict:
    missing = missing_items(entries, roster)
    return {
        "cocok": sum(e.match in OK_STATES for e in entries),
        "foto_tanpa_daftar": sum(e.match == "fail" for e in entries),
        "dobel": sum(e.match == "dobel" for e in entries),
        "tidak_lengkap": sum(e.match == "problem" for e in entries)
                         + sum(m["jenis"] == "DATA TIDAK LENGKAP" for m in missing),
        "daftar_tanpa_foto": sum(m["jenis"] == "DAFTAR TANPA FOTO" for m in missing),
    }


# ─── Render ─────────────────────────────────────────────────────────────────

def upscale(img: Image.Image, scale: int) -> Image.Image:
    img = img.convert("RGBA")
    return img if scale <= 1 else img.resize((img.width * scale, img.height * scale), Image.Resampling.LANCZOS)


def paste_barcode(img: Image.Image, box: Box, text: str, quiet: int = 4) -> tuple[Image.Image, int]:
    """Tempel barcode batang Code 128 di area box. Mengembalikan (gambar baru, lebar modul px)."""
    out = img.convert("RGBA").copy()
    x, y, w, h = box.to_px(out.size)
    bar, module_px = code128.render(text, max(w, 1), max(h, 1), quiet=quiet)
    out.paste(bar.convert("RGBA"), (x, y))
    return out, module_px


def render_qr(text: str, size: int) -> tuple[Image.Image, int]:
    """QR persegi size x size dengan modul bilangan bulat piksel (tajam saat dicetak)."""
    import qrcode
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2, box_size=1)
    qr.add_data(text)
    qr.make(fit=True)
    modules = qr.modules_count + 2 * qr.border
    module_px = max(1, size // modules)
    img = qr.make_image(fill_color="black", back_color="white").get_image().convert("RGB")
    img = img.resize((modules * module_px, modules * module_px), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (size, size), "white")
    off = (size - img.width) // 2
    canvas.paste(img, (off, off))
    return canvas, module_px


def paste_qr(img: Image.Image, box: Box, text: str) -> tuple[Image.Image, int]:
    """Tempel QR di tengah area box (pakai sisi terpendek box)."""
    out = img.convert("RGBA").copy()
    x, y, w, h = box.to_px(out.size)
    side = max(min(w, h), 1)
    qr, module_px = render_qr(text, side)
    out.paste(qr.convert("RGBA"), (x + (w - side) // 2, y + (h - side) // 2))
    return out, module_px


def render_front(cfg: Config, path: Path, code: str) -> tuple[Image.Image, int]:
    return paste_barcode(upscale(Image.open(path), cfg.output_scale), cfg.front_barcode, code)


def render_back(cfg: Config, back: Image.Image, url: str) -> tuple[Image.Image, int]:
    return paste_qr(upscale(back, cfg.output_scale), cfg.back_qr, url)


# ─── Langkah 5: generate ────────────────────────────────────────────────────

@dataclass
class Result:
    file: str
    ok: bool
    name: str = ""
    code: str = ""
    output: str = ""
    module_px: int = 0
    reason: str = ""


def generate(cfg: Config, entries: list[Entry], progress=None, stop=lambda: False,
             roster: list[RosterRow] | None = None) -> list[Result]:
    folder = Path(cfg.input_dir)
    success, failed = folder / "Success", folder / "Failed"
    back_dir = success / "Back"
    for d in (success, back_dir, failed):
        d.mkdir(parents=True, exist_ok=True)
    back_img = Image.open(cfg.back_image)
    used_names: dict[str, int] = {}
    results = []
    fails: list[dict] = []  # bahan failed-list.xlsx (mode daftar)

    for i, e in enumerate(entries):
        if stop():
            break
        src = folder / e.file
        try:
            usable = e.match in OK_STATES if roster is not None else bool(e.name and e.url)
            if not usable:
                shutil.copy2(src, failed / e.file)
                res = Result(e.file, False, e.list_name, e.code, reason=e.reason or "nama kosong")
                if roster is not None:
                    fails.append(failed_item(e, roster))
            else:
                shown = e.list_name or e.name
                base = safe_filename(shown)
                used_names[base] = used_names.get(base, 0) + 1
                fname = base if used_names[base] == 1 else f"{base} ({used_names[base]})"
                front, mod_front = render_front(cfg, src, e.code)
                back, _ = render_back(cfg, back_img, e.url)
                front.save(success / f"{fname}.png")
                back.save(back_dir / f"back_{fname}.png")
                res = Result(e.file, True, shown, e.code, f"{fname}.png", mod_front)
        except Exception as ex:
            shutil.copy2(src, failed / e.file)
            res = Result(e.file, False, e.name, e.code, reason=f"error: {ex}")
            if roster is not None:
                fails.append(failed_item(e, roster, "GALAT PEMROSESAN", f"error: {ex}"))
        results.append(res)
        if progress:
            progress(i + 1, len(entries), res)

    ok_files = {r.file for r in results if r.ok}
    export_data(success, entries, results, ok_only=roster is not None)
    if roster is not None:
        fails += missing_items(entries, roster)
        excel_io.write_failed_list(failed / "failed-list.xlsx", fails)
        excel_io.write_data_xlsx(success / "data_anggota.xlsx",
                                 [roster[e.roster_idx] for e in entries if e.file in ok_files])
    else:
        excel_io.write_data_xlsx(success / "data_anggota.xlsx",
                                 [RosterRow(kode=e.code, nama=e.name, link=e.url) for e in entries if e.file in ok_files])
    return results


def export_data(success: Path, entries: list[Entry], results: list[Result], ok_only: bool = False) -> None:
    """data_anggota.csv/json: dipakai untuk mengimpor kode & link ke website."""
    out_by_file = {r.file: r for r in results}
    if ok_only:  # mode daftar: foto yang gagal tidak punya kode/link final
        entries = [e for e in entries if out_by_file.get(e.file, Result(e.file, False)).ok]
    rows = [{
        "no": i + 1,
        "kode": e.code,
        "nama": e.list_name or e.name,
        "grup": e.group,
        "handle": e.handle,
        "link": e.url,
        "file_asli": e.file,
        "file_hasil": out_by_file.get(e.file, Result(e.file, False)).output,
    } for i, e in enumerate(entries)]
    (success / "data_anggota.json").write_text(json.dumps(rows, indent=2, ensure_ascii=False), "utf-8")
    with open(success / "data_anggota.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["kode"], delimiter=";")
        w.writeheader()
        w.writerows(rows)
