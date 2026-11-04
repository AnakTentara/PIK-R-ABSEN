"""
PIK-R ID Card Generator — GUI (PySide6)

Tab 1 "Tata Letak" : pilih folder & gambar belakang, geser kotak Nama / Barkode / QR
Tab 2 "Scan & Periksa": OCR semua kartu -> tabel urut (INTI dulu, lalu A-Z) berisi
                       label file asli, nama (bisa diedit), kode PIKR_0001-26, link
                       -> Generate ke folder Success / Failed
"""
from __future__ import annotations

import random
import sys
import traceback
from pathlib import Path

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QPixmap, QColor
from PySide6.QtWidgets import (
    QAbstractItemView, QApplication, QFileDialog, QFormLayout, QHBoxLayout, QHeaderView,
    QLabel, QLineEdit, QMessageBox, QProgressBar, QPushButton, QSpinBox, QSplitter,
    QTableWidget, QTableWidgetItem, QTabWidget, QVBoxLayout, QWidget,
)
from PIL import Image

import processor as P
from canvas import BoxCanvas, LabeledBox

APP_DIR = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
CONFIG_PATH = APP_DIR / "config.json"
SESSION_FILE = "idcard_scan.json"  # hasil scan + koreksi nama, disimpan di folder ID Card

STYLE = """
QWidget { font-family: 'Segoe UI'; font-size: 10pt; color: #2a1f17; }
QTabWidget::pane, QWidget#root { background: #f4f1ee; }
QPushButton { background: #fbf8f5; border: 1px solid #e3d9cf; border-radius: 10px; padding: 7px 14px; }
QPushButton:hover { background: #fff; }
QPushButton#primary { background: #f97316; color: white; border: 0; font-weight: 600; font-size: 11pt; padding: 9px 22px; }
QPushButton#primary:disabled { background: #d6cdc5; }
QLineEdit, QSpinBox, QTableWidget { background: #fff; border: 1px solid #e3d9cf; border-radius: 8px; padding: 4px; }
QHeaderView::section { background: #efe9e3; border: 0; padding: 6px; font-weight: 600; }
QProgressBar { border: 0; border-radius: 6px; background: #efe9e3; height: 12px; text-align: center; }
QProgressBar::chunk { background: #f97316; border-radius: 6px; }
QTabBar::tab { padding: 8px 18px; background: #efe9e3; border-radius: 8px; margin: 4px; }
QTabBar::tab:selected { background: #f97316; color: white; }
"""

COLS = ["No", "Label file", "Grup", "Nama (bisa diedit)", "Kode barcode", "Link QR", "OCR", "Status"]
C_NO, C_FILE, C_GROUP, C_NAME, C_CODE, C_URL, C_OCR, C_STATUS = range(len(COLS))
STATUS_TEXT = {"exact": "Cocok", "approx": "Cocok (periksa)", "fail": "Tidak ada di daftar",
               "dobel": "Foto dobel", "problem": "Data tidak lengkap"}


def module_hint(px: int) -> str:
    if px >= 3:
        return f"✅ Garis barcode {px}px di hasil — aman dicetak"
    if px == 2:
        return "⚠️ Garis barcode 2px — perlebar kotak Barkode"
    return "❌ Garis barcode 1px — TERLALU KECIL, perlebar kotak Barkode"


class Worker(QThread):
    progress = Signal(int, int, object)
    done = Signal(object)
    failed = Signal(str)

    def __init__(self, fn):
        super().__init__()
        self.fn = fn
        self._stop = False

    def stop(self):
        self._stop = True

    def run(self):
        try:
            self.done.emit(self.fn(lambda i, n, x: self.progress.emit(i, n, x), lambda: self._stop))
        except Exception:
            self.failed.emit(traceback.format_exc())


# ─── Tab 1: Tata letak ──────────────────────────────────────────────────────

class LayoutPage(QWidget):
    changed = Signal()

    def __init__(self, cfg: P.Config):
        super().__init__()
        self.cfg = cfg
        self.sample: str | None = None

        self.dir_edit = QLineEdit(cfg.input_dir)
        self.back_edit = QLineEdit(cfg.back_image)
        self.roster_edit = QLineEdit(cfg.roster_path)
        self.roster_edit.setPlaceholderText("(opsional) Excel daftar anggota dari dashboard")
        self.url_edit = QLineEdit(cfg.url_template)
        self.url_edit.setToolTip("{handle} = nama tanpa spasi huruf kecil, {code} = kode barcode")
        self.prefix_edit = QLineEdit(cfg.code_prefix)
        self.suffix_edit = QLineEdit(cfg.code_suffix)
        self.start_spin = QSpinBox()
        self.start_spin.setRange(1, 99999)
        self.start_spin.setValue(cfg.code_start)
        self.scale_spin = QSpinBox()
        self.scale_spin.setRange(1, 6)
        self.scale_spin.setValue(cfg.output_scale)
        self.scale_spin.setSuffix("x ukuran asli")
        for w in (self.url_edit, self.prefix_edit, self.suffix_edit):
            w.editingFinished.connect(self.sync)
        for w in (self.start_spin, self.scale_spin):
            w.valueChanged.connect(self.sync)

        def picker(edit: QLineEdit, folder: bool, kind: str = "image"):
            btn = QPushButton("Pilih…")

            def choose():
                if folder:
                    path = QFileDialog.getExistingDirectory(self, "Folder ID Card", edit.text())
                elif kind == "excel":
                    path = QFileDialog.getOpenFileName(self, "Excel daftar anggota", edit.text() or self.dir_edit.text(),
                                                       "Excel (*.xlsx)")[0]
                else:
                    path = QFileDialog.getOpenFileName(self, "Gambar belakang", edit.text() or self.dir_edit.text(),
                                                       "Gambar (*.png *.jpg *.jpeg *.webp)")[0]
                if path:
                    edit.setText(path)
                    self.reload()
            btn.clicked.connect(choose)
            row = QHBoxLayout()
            row.addWidget(edit, 1)
            row.addWidget(btn)
            return row

        code_row = QHBoxLayout()
        for lbl, w in (("Awalan", self.prefix_edit), ("Mulai", self.start_spin), ("Akhiran", self.suffix_edit)):
            code_row.addWidget(QLabel(lbl))
            code_row.addWidget(w)
        self.code_preview = QLabel()
        code_row.addWidget(self.code_preview, 1)

        form = QFormLayout()
        form.addRow("1. Folder ID Card:", picker(self.dir_edit, True))
        form.addRow("2. Gambar belakang:", picker(self.back_edit, False))
        form.addRow("3. Muat Excel daftar…:", picker(self.roster_edit, False, "excel"))
        form.addRow("Kode barcode (tanpa Excel):", code_row)
        form.addRow("Link QR:", self.url_edit)
        form.addRow("Resolusi hasil:", self.scale_spin)

        self.front = BoxCanvas("Depan (contoh acak) — geser kotak Nama & Barkode")
        self.front.boxes = [
            LabeledBox("Nama", "#3b82f6", cfg.name_box, full_width=True),
            LabeledBox("Barkode", "#f97316", cfg.front_barcode),
        ]
        self.back = BoxCanvas("Belakang — geser & ubah ukuran kotak QR")
        self.back.boxes = [LabeledBox("QR", "#16a34a", cfg.back_qr)]
        for c in (self.front, self.back):
            c.changed.connect(self.sync)
        split = QSplitter(Qt.Horizontal)
        split.addWidget(self.front)
        split.addWidget(self.back)

        shuffle = QPushButton("🎲 Contoh lain")
        shuffle.clicked.connect(self.pick_sample)
        test = QPushButton("🔍 Tes baca nama")
        test.clicked.connect(self.test_ocr)
        self.preview_btn = QPushButton("👁 Preview hasil")
        self.preview_btn.setCheckable(True)
        self.preview_btn.toggled.connect(self.toggle_preview)
        self.hint = QLabel()
        tools = QHBoxLayout()
        for w in (shuffle, test, self.preview_btn):
            tools.addWidget(w)
        tools.addWidget(self.hint, 1)

        lay = QVBoxLayout(self)
        lay.addLayout(form)
        lay.addWidget(split, 1)
        lay.addLayout(tools)
        self.reload()

    def sync(self):
        c = self.cfg
        c.input_dir = self.dir_edit.text().strip()
        c.back_image = self.back_edit.text().strip()
        c.roster_path = self.roster_edit.text().strip()
        c.url_template = self.url_edit.text().strip() or P.Config().url_template
        c.code_prefix = self.prefix_edit.text()
        c.code_suffix = self.suffix_edit.text()
        c.code_start = self.start_spin.value()
        c.output_scale = self.scale_spin.value()
        c.save(CONFIG_PATH)
        self.code_preview.setText(f"→ {P.make_code(c, c.code_start)}, {P.make_code(c, c.code_start + 1)}, …")
        self.update_hint()
        if self.preview_btn.isChecked():
            self.toggle_preview(True)
        self.changed.emit()

    def reload(self):
        self.sync()
        back = Path(self.cfg.back_image)
        self.back.set_image(str(back) if back.is_file() else None)
        self.pick_sample()

    def pick_sample(self):
        folder = Path(self.cfg.input_dir)
        files = P.list_inputs(folder, Path(self.cfg.back_image)) if folder.is_dir() else []
        self.sample = str(random.choice(files)) if files else None
        self.front.set_image(self.sample)
        self.front.title = f"Depan — contoh: {Path(self.sample).name}" if self.sample else "Depan"
        self.update_hint()
        if self.preview_btn.isChecked():
            self.toggle_preview(True)

    def update_hint(self):
        size = self.front.image_size()
        if not size:
            self.hint.setText("")
            return
        s = self.cfg.output_scale
        _, _, w, h = self.cfg.front_barcode.to_px((size[0] * s, size[1] * s))
        _, px = P.code128.render(P.make_code(self.cfg, self.cfg.code_start), max(w, 1), max(h, 1), quiet=4)
        self.hint.setText(module_hint(px))

    def test_ocr(self):
        if not self.sample:
            return
        try:
            raw, conf = P.ocr_text(P.crop_box(Image.open(self.sample), self.cfg.name_box))
        except Exception as e:
            QMessageBox.warning(self, "OCR gagal", str(e))
            return
        QMessageBox.information(self, "Tes baca nama",
                                f"File: {Path(self.sample).name}\n\nTeks OCR: “{raw or '(kosong)'}”\n"
                                f"Nama: {P.clean_name(raw) or '(kosong)'}\nKeyakinan: {conf:.0%}")

    def toggle_preview(self, on: bool):
        if not on:
            self.front.set_image(self.sample)
            back = Path(self.cfg.back_image)
            self.back.set_image(str(back) if back.is_file() else None)
            return
        if self.sample:
            img, _ = P.render_front(self.cfg, Path(self.sample), P.make_code(self.cfg, self.cfg.code_start))
            self.front.set_pil_image(img.resize(Image.open(self.sample).size, Image.Resampling.LANCZOS))
        if Path(self.cfg.back_image).is_file():
            back = Image.open(self.cfg.back_image)
            img, _ = P.render_back(self.cfg, back, self.cfg.url_template.format(handle="contohnama", code="X"))
            self.back.set_pil_image(img.resize(back.size, Image.Resampling.LANCZOS))


# ─── Tab 2: Scan & periksa ──────────────────────────────────────────────────

class ReviewPage(QWidget):
    def __init__(self, cfg: P.Config):
        super().__init__()
        self.cfg = cfg
        self.entries: list[P.Entry] = []
        self.roster: list | None = None
        self.worker: Worker | None = None
        self._filling = False

        self.scan_btn = QPushButton("1. Scan semua (OCR)")
        self.scan_btn.clicked.connect(self.start_scan)
        self.gen_btn = QPushButton("2. Generate ke Success")
        self.gen_btn.setObjectName("primary")
        self.gen_btn.clicked.connect(self.start_generate)
        self.gen_btn.setEnabled(False)
        self.status = QLabel("Atur tata letak di tab 1, lalu Scan.")
        top = QHBoxLayout()
        top.addWidget(self.scan_btn)
        top.addWidget(self.gen_btn)
        top.addWidget(self.status, 1)

        self.table = QTableWidget(0, len(COLS))
        self.table.setHorizontalHeaderLabels(COLS)
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        hh = self.table.horizontalHeader()
        hh.setSectionResizeMode(QHeaderView.ResizeToContents)
        hh.setSectionResizeMode(C_NAME, QHeaderView.Stretch)
        self.table.itemChanged.connect(self.on_edit)
        self.table.currentCellChanged.connect(lambda r, *_: self.show_row(r))

        self.preview = QLabel("Pilih baris untuk melihat kartu")
        self.preview.setAlignment(Qt.AlignCenter)
        self.preview.setMinimumWidth(280)

        split = QSplitter(Qt.Horizontal)
        split.addWidget(self.table)
        split.addWidget(self.preview)
        split.setStretchFactor(0, 3)

        self.progress = QProgressBar()
        lay = QVBoxLayout(self)
        lay.addLayout(top)
        lay.addWidget(split, 1)
        lay.addWidget(self.progress)

    # ── Daftar Excel ────────────────────────────────────
    def load_roster(self, warn=True) -> bool:
        """Muat ulang Excel (selalu baca file terbaru). False = ada galat."""
        try:
            self.roster = P.load_roster(self.cfg)
            return True
        except Exception as e:
            self.roster = None
            if warn:
                QMessageBox.warning(self, "Excel daftar tidak bisa dibaca", f"{self.cfg.roster_path}\n\n{e}")
            return False

    # ── Sesi tersimpan ──────────────────────────────────
    def session_path(self) -> Path:
        return Path(self.cfg.input_dir) / SESSION_FILE

    def save_session(self):
        import json
        from dataclasses import asdict
        if Path(self.cfg.input_dir).is_dir():
            self.session_path().write_text(json.dumps([asdict(e) for e in self.entries], indent=2, ensure_ascii=False), "utf-8")

    def load_session(self):
        import json
        p = self.session_path()
        if not p.is_file() or self.entries:
            return
        try:
            self.entries = [P.Entry(**e) for e in json.loads(p.read_text("utf-8"))]
            # buang entri yang filenya sudah tidak ada
            folder = Path(self.cfg.input_dir)
            self.entries = [e for e in self.entries if (folder / e.file).is_file()]
            if self.cfg.roster_path:
                self.load_roster(warn=False)
            self.refresh(reorder=False)
            self.status.setText(f"Hasil scan sebelumnya dimuat ({len(self.entries)} kartu). Scan ulang bila perlu.")
        except Exception:
            self.entries = []

    def showEvent(self, e):
        super().showEvent(e)
        self.load_session()

    # ── Tabel ───────────────────────────────────────────
    def refresh(self, reorder=True):
        if self.roster is not None:
            self.entries = P.arrange(self.cfg, self.entries, self.roster)
            dups = set()
        else:
            if reorder:
                self.entries = P.order(self.entries)
            P.assign(self.cfg, self.entries)
            dups = P.duplicate_names(self.entries)
        self._filling = True
        self.table.setRowCount(len(self.entries))
        for r, e in enumerate(self.entries):
            status = STATUS_TEXT.get(e.match, "") if self.roster is not None else ""
            if status and e.reason and e.match != "approx":
                status += f": {e.reason}"
            vals = [str(r + 1), e.file, e.group, e.list_name or e.name, e.code, e.url,
                    f"{e.ocr}  ({e.confidence:.0%})", status]
            for c, v in enumerate(vals):
                item = QTableWidgetItem(v)
                if c != C_NAME:
                    item.setFlags(item.flags() & ~Qt.ItemIsEditable)
                if self.roster is not None and c in (C_NAME, C_STATUS):
                    if e.match not in P.OK_STATES:
                        item.setBackground(QColor("#fee2e2"))
                    elif e.match == "approx":
                        item.setBackground(QColor("#fef3c7"))
                    if c == C_NAME and e.match not in P.OK_STATES:
                        item.setText(e.name)  # tampilkan nama OCR agar bisa dikoreksi
                elif c == C_NAME and (not e.name or e.name in dups):
                    item.setBackground(QColor("#fee2e2"))
                elif c == C_NAME and e.confidence < 0.8:
                    item.setBackground(QColor("#fef3c7"))
                if e.group == "INTI" and c == C_GROUP:
                    item.setForeground(QColor("#c2410c"))
                self.table.setItem(r, c, item)
        self._filling = False
        if self.roster is not None:
            s = P.roster_summary(self.entries, self.roster)
            self.status.setText(
                f"{s['cocok']} cocok • {s['foto_tanpa_daftar'] + s['dobel']} foto tanpa daftar/dobel • "
                f"{s['daftar_tanpa_foto']} daftar tanpa foto"
                + (f" • {s['tidak_lengkap']} data tidak lengkap" if s["tidak_lengkap"] else ""))
        else:
            empty = sum(not e.name for e in self.entries)
            low = sum(bool(e.name) and e.confidence < 0.8 for e in self.entries)
            self.status.setText(
                f"{len(self.entries)} kartu • kode {self.entries[0].code if self.entries else '-'} s/d "
                f"{self.entries[-1].code if self.entries else '-'} • "
                f"🟥 kosong/dobel: {empty + len(dups)} • 🟨 periksa: {low}")
        self.gen_btn.setEnabled(bool(self.entries))

    def on_edit(self, item: QTableWidgetItem):
        if self._filling or item.column() != C_NAME:
            return
        e = self.entries[item.row()]
        if self.roster is not None and e.match in P.OK_STATES and item.text() == e.list_name:
            return  # sel hanya menampilkan nama daftar; tidak ada perubahan
        e.name = P.clean_name(item.text())
        e.confidence = 1.0  # dikoreksi manual
        file = e.file
        self.refresh()
        self.save_session()
        # tetap pilih kartu yang barusan diedit walau urutannya pindah
        row = next(i for i, x in enumerate(self.entries) if x.file == file)
        self.table.selectRow(row)

    def show_row(self, r: int):
        if not (0 <= r < len(self.entries)):
            return
        pix = QPixmap(str(Path(self.cfg.input_dir) / self.entries[r].file))
        self.preview.setPixmap(pix.scaled(self.preview.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation))

    # ── Scan ────────────────────────────────────────────
    def start_scan(self):
        if self.worker:
            self.worker.stop()
            return
        if not Path(self.cfg.input_dir).is_dir() or not Path(self.cfg.back_image).is_file():
            QMessageBox.warning(self, "Belum lengkap", "Pilih folder ID Card dan gambar belakang di tab 1.")
            return
        if self.entries and QMessageBox.question(self, "Scan ulang?",
                                                 "Koreksi nama yang sudah dibuat akan hilang. Lanjutkan?") != QMessageBox.Yes:
            return
        if self.cfg.roster_path and not self.load_roster():
            return
        if not self.cfg.roster_path:
            self.roster = None
        roster = self.roster
        self.entries = []
        self.table.setRowCount(0)
        self.scan_btn.setText("■ Stop")
        self.gen_btn.setEnabled(False)
        self.worker = Worker(lambda prog, stop: P.scan(self.cfg, prog, stop, roster=roster))
        self.worker.progress.connect(lambda i, n, e: (self.progress.setMaximum(n), self.progress.setValue(i),
                                                      self.status.setText(f"Membaca {e.file}: {e.name or '?'}")))
        self.worker.done.connect(self.scan_done)
        self.worker.failed.connect(self.on_fail)
        self.worker.start()

    def scan_done(self, entries):
        self.worker = None
        self.scan_btn.setText("1. Scan semua (OCR)")
        self.entries = entries
        self.refresh(reorder=False)
        self.save_session()

    # ── Generate ────────────────────────────────────────
    def start_generate(self):
        if self.worker:
            return
        if self.roster is not None:
            if self.cfg.roster_path and not self.load_roster():
                return
            self.entries = P.arrange(self.cfg, self.entries, self.roster)
            s = P.roster_summary(self.entries, self.roster)
            msg = (f"Generate {s['cocok']} kartu dari daftar Excel?\n\n"
                   f"{s['foto_tanpa_daftar'] + s['dobel'] + s['tidak_lengkap']} foto masuk folder Failed, "
                   f"{s['daftar_tanpa_foto']} nama di daftar belum punya foto.\n"
                   f"Semuanya dicatat di Failed/failed-list.xlsx.")
        else:
            dups = P.duplicate_names(self.entries)
            empty = [e.file for e in self.entries if not e.name]
            msg = f"Generate {len(self.entries)} kartu ({self.entries[0].code} s/d {self.entries[-1].code})?"
            if empty:
                msg += f"\n\n{len(empty)} kartu tanpa nama akan masuk folder Failed."
            if dups:
                msg += f"\n\nNama dobel: {', '.join(sorted(dups))}. File hasil akan diberi akhiran (2)."
        if QMessageBox.question(self, "Generate", msg) != QMessageBox.Yes:
            return
        self.save_session()
        self.gen_btn.setEnabled(False)
        roster = self.roster
        self.worker = Worker(lambda prog, stop: P.generate(self.cfg, self.entries, prog, stop, roster=roster))
        self.worker.progress.connect(lambda i, n, r: (self.progress.setMaximum(n), self.progress.setValue(i),
                                                      self.status.setText(f"{r.code or '-'} → {r.output or r.reason}")))
        self.worker.done.connect(self.generate_done)
        self.worker.failed.connect(self.on_fail)
        self.worker.start()

    def generate_done(self, results):
        self.worker = None
        self.gen_btn.setEnabled(True)
        ok = sum(r.ok for r in results)
        small = [r.output for r in results if r.ok and r.module_px < 2]
        msg = (f"Berhasil: {ok}\nFailed: {len(results) - ok}\n\n"
               f"Hasil: {Path(self.cfg.input_dir) / 'Success'}\n"
               f"Daftar kode & link: Success/data_anggota.xlsx (.csv/.json)"
               + (f"\nYang gagal: Failed/failed-list.xlsx" if self.roster is not None else ""))
        if small:
            msg += f"\n\n⚠️ {len(small)} barcode bergaris 1px, perlebar kotak Barkode lalu generate ulang."
        QMessageBox.information(self, "Selesai", msg)

    def on_fail(self, tb):
        self.worker = None
        self.scan_btn.setText("1. Scan semua (OCR)")
        self.gen_btn.setEnabled(bool(self.entries))
        QMessageBox.critical(self, "Error", tb)


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(STYLE)
    cfg = P.Config.load(CONFIG_PATH)
    tabs = QTabWidget()
    tabs.setObjectName("root")
    layout_page = LayoutPage(cfg)
    review = ReviewPage(cfg)
    layout_page.changed.connect(lambda: review.entries and review.refresh(reorder=False))
    tabs.addTab(layout_page, "1. Tata Letak")
    tabs.addTab(review, "2. Scan, Periksa & Generate")
    tabs.setWindowTitle("PIK-R ID Card Generator")
    tabs.resize(1280, 860)
    tabs.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
