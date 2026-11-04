"""Tes logika inti (tanpa GUI & tanpa OCR asli). Jalankan: python test_core.py"""
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

import code128
import excel_io
import processor as P

# Konsol Windows (cp1252) tidak bisa mencetak tanda centang; paksa UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

passed = 0


def check(name, cond):
    global passed
    assert cond, name
    passed += 1
    print(f"  ✓ {name}")


def read_bars(img, x, y, w, h):
    """Baca ulang garis barcode dari gambar -> teks (validasi hasil render)."""
    row = [img.getpixel((xx, y + h // 2))[0] < 128 for xx in range(x, x + w)]
    runs, cur, n = [], row[0], 0
    for v in row:
        if v == cur:
            n += 1
        else:
            runs.append((cur, n))
            cur, n = v, 1
    runs.append((cur, n))
    inner = runs[1:-1]
    mod = min(n for _, n in inner)
    return code128.decode_widths([n // mod for _, n in inner])


# ── Code 128 ────────────────────────────────────────────
for text in ["PIKR_0001-26", "PIKR_0076-26", "2026-001"]:
    check(f"encode/decode Code128 '{text}'", code128.decode_widths(code128.encode(text)) == text)
img, px = code128.render("PIKR_0001-26", 900, 80, quiet=4)
check("render: modul >= 3px di lebar 900", px >= 3)
check("render: gambar terbaca balik", read_bars(img, 0, 0, 900, 80) == "PIKR_0001-26")

# ── Nama, kode, link ────────────────────────────────────
cfg = P.Config()
check("kode PIKR_0001-26", P.make_code(cfg, 1) == "PIKR_0001-26")
check("kode PIKR_0076-26", P.make_code(cfg, 76) == "PIKR_0076-26")
check("clean_name: OCR 0/1 -> O/I, simbol dibuang", P.clean_name("y1ara ria rahen ma1ra h ") == "YIARA RIA RAHEN MAIRA H")
check("clean_name: strip dekorasi 1 huruf di depan", P.clean_name("| AHZA SHOLAQURDELIA") == "AHZA SHOLAQURDELIA")
check("clean_name: M. dipertahankan", P.clean_name("m. aziz") == "M. AZIZ")
check("handle tanpa spasi huruf kecil", P.make_handle("Kenzie Favian Mahardika") == "kenziefavianmahardika")
check("link lengkap", cfg.url_template.format(handle="abc", code="x") == "https://pikr-manseku.my.id/@abc")
check("urutan file INTI.png, (2) ... (10), (12)",
      sorted(["INTI (10).png", "INTI (2).png", "INTI.png", "INTI (12).png"], key=P.file_order_key)
      == ["INTI.png", "INTI (2).png", "INTI (10).png", "INTI (12).png"])

# ── Urutan & penomoran ──────────────────────────────────
E = P.Entry
entries = [
    E("A (2).png", "ANGGOTA", name="BUDI SANTOSO"),
    E("INTI (10).png", "INTI", name="ZAHRA"),
    E("1.png", "ANGGOTA", name="AHZA SHOLAQURDELIA"),
    E("INTI.png", "INTI", name="YIARA RIA RAHEN MAIRA H"),
    E("Z.png", "ANGGOTA", name=""),
    E("INTI (2).png", "INTI", name="ANDI"),
    E("C.png", "ANGGOTA", name="ANDI"),
]
out = P.assign(cfg, P.order(entries))
check("INTI dulu sesuai urutan file, lalu anggota A-Z, nama kosong di akhir",
      [e.file for e in out] == ["INTI.png", "INTI (2).png", "INTI (10).png", "1.png", "C.png", "A (2).png", "Z.png"])
check("kode berurutan dari 0001", [e.code for e in out][:3] == ["PIKR_0001-26", "PIKR_0002-26", "PIKR_0003-26"])
check("label file asli tetap ada", out[0].file == "INTI.png" and out[0].code == "PIKR_0001-26")
check("nama dobel -> handle unik (andi, andi2)", [out[1].handle, out[4].handle] == ["andi", "andi2"])
check("nama kosong -> tanpa link", out[-1].url == "")
check("duplicate_names", P.duplicate_names(out) == {"ANDI"})

# ── Scan + generate di folder sementara ─────────────────
with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    names = {"INTI.png": "YIARA RIA RAHEN MAIRA H", "INTI (2).png": "ZAINAL", "1.png": "BUDI",
             "A.png": "AHZA", "B.png": ""}
    for f in names:
        Image.new("RGB", (591, 1004), "#ffb27a").save(d / f)
    Image.new("RGB", (591, 1004), "#ffe6d3").save(d / "BACK_PIKR.png")
    cfg = P.Config(input_dir=str(d), back_image=str(d / "BACK_PIKR.png"), output_scale=2)

    # OCR palsu: mengembalikan nama sesuai urutan file yang di-scan
    files_in_order = [p.name for p in P.list_inputs(d, d / "BACK_PIKR.png")]
    it = iter(files_in_order)
    entries = P.scan(cfg, ocr=lambda crop: (names[next(it)], 0.95))

    check("BACK_PIKR.png tidak ikut di-scan", all(e.file != "BACK_PIKR.png" for e in entries))
    check("urutan scan: INTI, INTI (2), AHZA, BUDI, kosong",
          [e.name for e in entries] == ["YIARA RIA RAHEN MAIRA H", "ZAINAL", "AHZA", "BUDI", ""])
    results = P.generate(cfg, entries)
    print("\n" + "="*50)
    print("DETAIL HASIL EKSEKUSI GENERATE:")
    print("="*50)
    for r in results:
        print(f"File Asli: {r.file}")
        print(f"  └─ Status Sukses : {r.ok}")
        print(f"  └─ Alasan Gagal  : {r.reason}")
    print("="*50 + "\n")
    S = d / "Success"
    print("\n--- File yang berhasil digenerate di folder Success ---")
    print([p.name for p in S.glob("*")]) 
    check("Success/YIARA RIA RAHEN MAIRA H.png", (S / "YIARA RIA RAHEN MAIRA H.png").exists())
    check("Success/Back/back_YIARA RIA RAHEN MAIRA H.png", (S / "Back" / "back_YIARA RIA RAHEN MAIRA H.png").exists())
    check("nama kosong -> Failed/B.png", (d / "Failed" / "B.png").exists())
    check("hasil 2x resolusi", Image.open(S / "AHZA.png").size == (1182, 2008))
    front = Image.open(S / "YIARA RIA RAHEN MAIRA H.png").convert("RGB")
    x, y, w, h = cfg.front_barcode.to_px(front.size)
    check("barcode di kartu YIARA = PIKR_0001-26", read_bars(front, x, y, w, h) == "PIKR_0001-26")
    front = Image.open(S / "AHZA.png").convert("RGB")
    check("barcode di kartu AHZA = PIKR_0003-26", read_bars(front, x, y, w, h) == "PIKR_0003-26")
    rows = json.loads((S / "data_anggota.json").read_text("utf-8"))
    check("data_anggota.json berisi kode, nama, link, file asli",
          rows[0] == {"no": 1, "kode": "PIKR_0001-26", "nama": "YIARA RIA RAHEN MAIRA H", "grup": "INTI",
                      "handle": "yiarariarahenmairah", "link": "https://pikr-manseku.my.id/@yiarariarahenmairah",
                      "file_asli": "INTI.png", "file_hasil": "YIARA RIA RAHEN MAIRA H.png"})
    check("data_anggota.csv dibuat", (S / "data_anggota.csv").exists())
    check("mode lama: tidak ada failed-list.xlsx, data_anggota.xlsx hanya berisi yang sukses",
          not (d / "Failed" / "failed-list.xlsx").exists() and len(excel_io.read_sheet(S / "data_anggota.xlsx")) == 1 + 4)
    check("file asli tidak diubah", Image.open(d / "INTI.png").size == (591, 1004))

    # QR belakang berisi link lengkap (dibaca dengan OpenCV bila tersedia)
    try:
        import cv2
        import numpy as np
        back = np.array(Image.open(S / "Back" / "back_AHZA.png").convert("RGB"))
        text, *_ = cv2.QRCodeDetector().detectAndDecode(back)
        check("QR belakang = link lengkap", text == "https://pikr-manseku.my.id/@ahza")
    except ImportError:
        print("  - (lewati cek QR: opencv tidak terpasang)")


# ── Mode daftar Excel ───────────────────────────────────
import excel_io
from excel_io import RosterRow

print("\nMode daftar Excel")
R = RosterRow
DAFTAR = [
    R(nama="Yiara Ria Rahen Maira Harizon", kode="PIKR_0001-26", nisn="0012345678", whatsapp="081234567890"),
    R(nama="Ahmad Abdallah Rafiqi", kode="PIKR_0002-26"),
    R(nama="Budi Santoso", kode="PIKR_0003-26", link="https://pikr-manseku.my.id/@budisantoso"),
    R(nama="Budi Santika"),                       # belum berkode
    R(nama="Siti Nur Aini"),                      # belum berkode
    R(nama="Tanpa Foto Sama Sekali"),             # tidak punya foto
    R(nama="", kode="", email="tanpa.nama@gmail.com"),  # data tidak lengkap (ada email, tanpa nama)
]
cfg_r = P.Config()
P.prepare_roster(cfg_r, DAFTAR)
check("kode kosong diberi nomor lanjutan setelah yang tertinggi (0004, 0005, 0006)",
      [r.kode for r in DAFTAR[3:6]] == ["PIKR_0004-26", "PIKR_0005-26", "PIKR_0006-26"])
check("kode berkode tidak diubah", [r.kode for r in DAFTAR[:3]] == ["PIKR_0001-26", "PIKR_0002-26", "PIKR_0003-26"])
check("link kosong dibuat dari nama DAFTAR", DAFTAR[1].link == "https://pikr-manseku.my.id/@ahmadabdallahrafiqi")
check("link dari daftar dipakai apa adanya", DAFTAR[2].link == "https://pikr-manseku.my.id/@budisantoso")
check("baris tanpa nama = bermasalah, tanpa kode baru", DAFTAR[6].problem == "nama kosong" and DAFTAR[6].kode == "")

all_codes = [r.kode for r in DAFTAR if r.kode]
check("tidak ada kode bentrok", len(all_codes) == len(set(all_codes)))

# kode manual bentrok dengan nomor otomatis berikutnya
bentrok = [R(nama="A Satu", kode="PIKR_0003-26"), R(nama="B Dua"), R(nama="C Tiga", kode="PIKR_0002-26"), R(nama="D Empat")]
P.prepare_roster(cfg_r, bentrok)
check("nomor otomatis melompati kode yang sudah ada (0004, 0005)", [bentrok[1].kode, bentrok[3].kode] == ["PIKR_0004-26", "PIKR_0005-26"])
dobel_kode = [R(nama="A Satu", kode="PIKR_0001-26"), R(nama="B Dua", kode="PIKR_0001-26")]
P.prepare_roster(cfg_r, dobel_kode)
check("kode dobel di daftar ditandai", dobel_kode[1].problem.startswith("kode dobel"))

# pencocokan nama
def m(name):
    i, kind, why = P.match_name(name, DAFTAR)
    return (DAFTAR[i].nama if i is not None else None), kind

check("cocok persis (huruf besar/kecil & simbol diabaikan)", m("budi santoso") == ("Budi Santoso", "exact"))
check("subsekuens: 'ABDALLAH RAFIQI' -> Ahmad Abdallah Rafiqi", m("ABDALLAH RAFIQI") == ("Ahmad Abdallah Rafiqi", "approx"))
check("singkatan: 'YIARA RIA RAHEN MAIRA H' -> Yiara ... Maira Harizon", m("YIARA RIA RAHEN MAIRA H") == ("Yiara Ria Rahen Maira Harizon", "approx"))
check("ambigu ditolak: 'BUDI S' cocok Santoso & Santika", m("BUDI S")[0] is None and m("BUDI S")[1] == "fail")
check("tidak ada di daftar ditolak", m("ZULKIFLI HASAN")[0] is None)
check("nama kosong ditolak", m("")[0] is None)
# teks kartu dirapatkan: OCR kehilangan spasi (kasus nyata)
check("tanpa spasi sama sekali: 'BUDISANTOSO' -> Budi Santoso", m("BUDISANTOSO") == ("Budi Santoso", "exact"))
check("spasi salah tempat: 'BUD ISANTOSO' -> Budi Santoso", m("BUD ISANTOSO") == ("Budi Santoso", "exact"))
check("tanpa spasi + nama depan hilang: 'ABDALLAHRAFIQI' -> Ahmad Abdallah Rafiqi", m("ABDALLAHRAFIQI") == ("Ahmad Abdallah Rafiqi", "approx"))
check("tanpa spasi + disingkat: 'YIARARIARAHENMAIRAH'", m("YIARARIARAHENMAIRAH") == ("Yiara Ria Rahen Maira Harizon", "approx"))
check("tanpa spasi tetap ambigu ditolak: 'BUDIS'", m("BUDIS")[0] is None)
check("inisial di depan: 'B. SANTOSO' -> Budi Santoso", m("B. SANTOSO") == ("Budi Santoso", "approx"))
check("inisial + tanpa spasi: 'A. ABDALLAHRAFIQI' -> Ahmad Abdallah Rafiqi", m("A. ABDALLAHRAFIQI") == ("Ahmad Abdallah Rafiqi", "approx"))
check("inisial yang salah ditolak: 'X. SANTOSO'", m("X. SANTOSO")[0] is None)

# kebalikannya: daftar memakai inisial ("M. Dzakwan Raziq"), kartu memakai nama lengkap
DZ = [R(nama="M. Dzakwan Raziq", kode="PIKR_0018-26"), R(nama="M. Arzal Sya'bani"), R(nama="Muhammad Amirul Amin")]
P.prepare_roster(cfg_r, DZ)
def md(name):
    i, kind, why = P.match_name(name, DZ)
    return (DZ[i].nama if i is not None else None), kind
check("daftar berinisial: 'MUHAMMADDZAKWANR' -> M. Dzakwan Raziq", md("MUHAMMADDZAKWANR") == ("M. Dzakwan Raziq", "approx"))
check("daftar berinisial + berspasi: 'MUHAMMAD DZAKWAN R'", md("MUHAMMAD DZAKWAN R") == ("M. Dzakwan Raziq", "approx"))
check("daftar berinisial, kartu lengkap: 'MUHAMMAD DZAKWAN RAZIQ'", md("MUHAMMAD DZAKWAN RAZIQ") == ("M. Dzakwan Raziq", "approx"))
check("inisial tidak boleh mengaburkan orang lain: 'MUHAMMADARZALSYABANI' -> M. Arzal", md("MUHAMMADARZALSYABANI")[0] == "M. Arzal Sya'bani")
check("inisial salah huruf ditolak: 'AHMADDZAKWANR'", md("AHMADDZAKWANR")[0] is None)
check("nama belakang beda tetap ditolak: 'MUHAMMADYUNUS'", md("MUHAMMADYUNUS")[0] is None)
check("tanpa spasi, nama tak ada ditolak", m("ZULKIFLIHASAN")[0] is None)
check("salah baca 1 huruf diterima lewat kemiripan", m("SITI NUR AIN1".replace("1", "I"))[0] == "Siti Nur Aini")
check("difflib: salah ketik 'SITI NUR ANI' -> Siti Nur Aini", m("SITI NUR ANI")[0] == "Siti Nur Aini")

# pengaturan ulang: ketik nama persis dari daftar = cocok
fixed = P.arrange(cfg_r, [P.Entry("x.png", "ANGGOTA", name=P.clean_name("Siti Nur Aini"), confidence=1.0)], DAFTAR)
check("ketik nama persis dari daftar = cocok", fixed[0].match == "exact" and fixed[0].code == "PIKR_0005-26")

# alur lengkap scan + generate dengan daftar
with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp)
    foto = {  # file -> nama hasil OCR
        "A1.png": "ABDALLAH RAFIQI",              # nama depan hilang
        "A2.png": "YIARA RIA RAHEN MAIRA H",      # singkatan
        "A3.png": "BUDI SANTOSO",
        "A4.png": "BUDI SANTOSO",                 # foto dobel
        "A5.png": "BUDI S",                       # ambigu
        "A6.png": "ZULKIFLI HASAN",               # tidak ada di daftar
        "A7.png": "SITI NUR AINI",
    }
    for f in foto:
        Image.new("RGB", (591, 1004), "#ffb27a").save(d / f)
    Image.new("RGB", (591, 1004), "#ffe6d3").save(d / "BACK_PIKR.png")

    xlsx = d / "daftar.xlsx"
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(["no", "NAMA LENGKAP", "kode id card", "nisn", "No. WhatsApp", "Email", "Jenis Kelamin", "Kelas", "Link Profil"])
    for i, r in enumerate(DAFTAR, 1):
        ws.append([i, r.nama, r.kode if r.kode in ("PIKR_0001-26", "PIKR_0002-26", "PIKR_0003-26") else None,
                   r.nisn or None, r.whatsapp or None, r.email or None, None, None,
                   r.link if r.link.endswith("budisantoso") else None])
    ws["D2"] = 12345678          # NISN tersimpan sebagai angka di Excel asli
    wb.save(xlsx)

    cfg2 = P.Config(input_dir=str(d), back_image=str(d / "BACK_PIKR.png"), roster_path=str(xlsx), output_scale=2)
    roster = P.load_roster(cfg2)
    check("load_roster: 7 baris, judul kolom tidak peka huruf besar/kecil", len(roster) == 7 and roster[1].nama == "Ahmad Abdallah Rafiqi")
    check("NISN angka tidak menjadi '12345678.0'", roster[0].nisn == "12345678")
    check("kode diberi saat load (baris kosong kode: 0004..0006)", [r.kode for r in roster[3:6]] == ["PIKR_0004-26", "PIKR_0005-26", "PIKR_0006-26"])

    order_files = [p.name for p in P.list_inputs(d, d / "BACK_PIKR.png")]
    it = iter(order_files)
    entries = P.scan(cfg2, ocr=lambda crop: (foto[next(it)], 0.95), roster=roster)
    by = {e.file: e for e in entries}
    check("A1 cocok ke Ahmad Abdallah Rafiqi (PIKR_0002-26)", by["A1.png"].list_name == "Ahmad Abdallah Rafiqi" and by["A1.png"].code == "PIKR_0002-26")
    check("A2 cocok singkatan (PIKR_0001-26)", by["A2.png"].code == "PIKR_0001-26" and by["A2.png"].match == "approx")
    check("foto dobel: yang kedua gagal 'dobel', yang pertama (A3) tetap cocok", by["A3.png"].match == "exact" and by["A4.png"].match == "dobel")
    check("ambigu & tidak ada di daftar = fail", by["A5.png"].match == "fail" and by["A6.png"].match == "fail")
    check("urutan hasil mengikuti urutan baris daftar", [e.code for e in entries[:4]] == ["PIKR_0001-26", "PIKR_0002-26", "PIKR_0003-26", "PIKR_0005-26"])
    s = P.roster_summary(entries, roster)
    check("ringkasan: 4 cocok, 2 foto tanpa daftar, 1 dobel, 2 daftar tanpa foto, 1 tidak lengkap",
          (s["cocok"], s["foto_tanpa_daftar"], s["dobel"], s["daftar_tanpa_foto"], s["tidak_lengkap"]) == (4, 2, 1, 2, 1))

    results = P.generate(cfg2, entries, roster=roster)
    S, F = d / "Success", d / "Failed"
    check("Success memakai nama DAFTAR huruf besar", (S / "AHMAD ABDALLAH RAFIQI.png").exists() and (S / "Back" / "back_AHMAD ABDALLAH RAFIQI.png").exists())
    check("4 sukses, 3 foto gagal", sum(r.ok for r in results) == 4 and sorted(p.name for p in F.glob("A*.png")) == ["A4.png", "A5.png", "A6.png"])
    front = Image.open(S / "AHMAD ABDALLAH RAFIQI.png").convert("RGB")
    x, y, w, h = cfg2.front_barcode.to_px(front.size)
    check("barcode kartu Ahmad = PIKR_0002-26", read_bars(front, x, y, w, h) == "PIKR_0002-26")

    failed = excel_io.read_sheet(F / "failed-list.xlsx")
    check("failed-list.xlsx: judul kolom sesuai", failed[0] == ["Jenis", "File foto", "Nama terbaca (OCR)", "Nama di daftar", "Kode ID", "Keterangan"])
    kinds = [row[0] for row in failed[1:]]
    check("failed-list.xlsx: jenis FOTO DOBEL, FOTO TANPA DAFTAR x2, DAFTAR TANPA FOTO x2, DATA TIDAK LENGKAP",
          sorted(kinds) == sorted(["FOTO DOBEL", "FOTO TANPA DAFTAR", "FOTO TANPA DAFTAR", "DAFTAR TANPA FOTO", "DAFTAR TANPA FOTO", "DATA TIDAK LENGKAP"]))
    dobel_row = next(r for r in failed[1:] if r[0] == "FOTO DOBEL")
    check("baris FOTO DOBEL memuat file, nama OCR, nama daftar & kode", dobel_row[1:5] == ["A4.png", "BUDI SANTOSO", "Budi Santoso", "PIKR_0003-26"])
    tanpa_foto = [r for r in failed[1:] if r[0] == "DAFTAR TANPA FOTO"]
    check("DAFTAR TANPA FOTO tanpa nama OCR/file", all(r[1] == "" and r[2] == "" for r in tanpa_foto) and {r[3] for r in tanpa_foto} == {"Budi Santika", "Tanpa Foto Sama Sekali"})

    back = excel_io.load_roster(S / "data_anggota.xlsx")
    check("data_anggota.xlsx terbaca balik: 4 baris dengan kode & link final",
          [(r.nama, r.kode) for r in back] == [("Yiara Ria Rahen Maira Harizon", "PIKR_0001-26"), ("Ahmad Abdallah Rafiqi", "PIKR_0002-26"),
                                                ("Budi Santoso", "PIKR_0003-26"), ("Siti Nur Aini", "PIKR_0005-26")])
    check("data_anggota.xlsx: link final terisi & NISN/WA tetap teks",
          all(r.link.startswith("https://pikr-manseku.my.id/@") for r in back) and back[0].nisn == "12345678" and back[0].whatsapp == "081234567890")
    check("data_anggota.json hanya berisi yang sukses & nama daftar",
          [r["nama"] for r in json.loads((S / "data_anggota.json").read_text("utf-8"))][1] == "Ahmad Abdallah Rafiqi"
          and len(json.loads((S / "data_anggota.json").read_text("utf-8"))) == 4)

    try:
        import cv2
        import numpy as np
        qr = np.array(Image.open(S / "Back" / "back_BUDI SANTOSO.png").convert("RGB"))
        text, *_ = cv2.QRCodeDetector().detectAndDecode(qr)
        check("QR belakang = Link Profil dari daftar", text == "https://pikr-manseku.my.id/@budisantoso")
    except ImportError:
        link = next(e for e in entries if e.file == "A3.png").url
        check("QR belakang memakai Link Profil dari daftar (opencv tidak ada, cek data)", link == "https://pikr-manseku.my.id/@budisantoso")



print(f"\n{passed} test lulus.")
