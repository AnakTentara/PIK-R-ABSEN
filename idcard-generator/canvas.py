"""
Kanvas preview ID Card dengan kotak berlabel yang bisa digeser & di-resize.
Koordinat kotak disimpan relatif (0..1) agar tidak tergantung ukuran tampilan.
"""
from __future__ import annotations

from PySide6.QtCore import Qt, QRectF, QPointF, Signal
from PySide6.QtGui import QPainter, QPixmap, QColor, QPen, QFont, QImage
from PySide6.QtWidgets import QWidget

from processor import Box

HANDLE = 10  # ukuran pegangan resize (px layar)
MIN_REL = 0.02


class LabeledBox:
    def __init__(self, label: str, color: str, box: Box, full_width: bool = False):
        self.label = label
        self.color = QColor(color)
        self.box = box
        self.full_width = full_width  # kotak "Nama": selalu dari ujung kiri ke kanan
        if full_width:
            self.box.x, self.box.w = 0.0, 1.0


class BoxCanvas(QWidget):
    changed = Signal()

    def __init__(self, title: str, parent=None):
        super().__init__(parent)
        self.title = title
        self.pixmap: QPixmap | None = None
        self.boxes: list[LabeledBox] = []
        self.overlay: QPixmap | None = None  # preview barcode asli
        self._drag = None  # (box, mode, start_pos, start_box)
        self.setMinimumSize(280, 200)
        self.setMouseTracking(True)

    # ── Data ────────────────────────────────────────────
    def set_image(self, path: str | None):
        self.pixmap = QPixmap(path) if path else None
        self.update()

    def set_pil_image(self, pil_img):
        """Tampilkan hasil render (preview barcode sebenarnya)."""
        rgba = pil_img.convert("RGBA")
        qimg = QImage(rgba.tobytes(), rgba.width, rgba.height, QImage.Format_RGBA8888)
        self.pixmap = QPixmap.fromImage(qimg.copy())
        self.update()

    def image_size(self) -> tuple[int, int] | None:
        return (self.pixmap.width(), self.pixmap.height()) if self.pixmap and not self.pixmap.isNull() else None

    # ── Geometri ────────────────────────────────────────
    def _img_rect(self) -> QRectF:
        if not self.pixmap or self.pixmap.isNull():
            return QRectF(10, 30, self.width() - 20, self.height() - 40)
        avail = QRectF(10, 30, self.width() - 20, self.height() - 40)
        s = min(avail.width() / self.pixmap.width(), avail.height() / self.pixmap.height())
        w, h = self.pixmap.width() * s, self.pixmap.height() * s
        return QRectF(avail.x() + (avail.width() - w) / 2, avail.y() + (avail.height() - h) / 2, w, h)

    def _box_rect(self, b: Box) -> QRectF:
        r = self._img_rect()
        return QRectF(r.x() + b.x * r.width(), r.y() + b.y * r.height(), b.w * r.width(), b.h * r.height())

    def _hit(self, pos: QPointF):
        for lb in reversed(self.boxes):
            rect = self._box_rect(lb.box)
            handle = QRectF(rect.right() - HANDLE, rect.bottom() - HANDLE, HANDLE * 2, HANDLE * 2)
            if handle.contains(pos):
                return lb, "resize"
            if rect.contains(pos):
                return lb, "move"
        return None, None

    # ── Gambar ──────────────────────────────────────────
    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        p.fillRect(self.rect(), QColor("#f4f1ee"))
        p.setPen(QColor("#2a1f17"))
        p.setFont(QFont("Segoe UI", 10, QFont.Bold))
        p.drawText(12, 20, self.title)

        r = self._img_rect()
        if self.pixmap and not self.pixmap.isNull():
            p.drawPixmap(r.toRect(), self.pixmap)
        else:
            p.setPen(QPen(QColor("#a8998c"), 1, Qt.DashLine))
            p.drawRect(r)
            p.drawText(r, Qt.AlignCenter, "Belum ada gambar")

        for lb in self.boxes:
            rect = self._box_rect(lb.box)
            fill = QColor(lb.color)
            fill.setAlpha(70)
            p.fillRect(rect, fill)
            p.setPen(QPen(lb.color, 2))
            p.drawRect(rect)
            p.setFont(QFont("Segoe UI", 9, QFont.Bold))
            tag = QRectF(rect.x(), rect.y() - 18, max(70, len(lb.label) * 8 + 10), 18)
            p.fillRect(tag, lb.color)
            p.setPen(Qt.white)
            p.drawText(tag, Qt.AlignCenter, lb.label)
            p.fillRect(QRectF(rect.right() - HANDLE / 2, rect.bottom() - HANDLE / 2, HANDLE, HANDLE), lb.color)
        p.end()

    # ── Mouse ───────────────────────────────────────────
    def mousePressEvent(self, e):
        lb, mode = self._hit(e.position())
        if lb:
            b = lb.box
            self._drag = (lb, mode, e.position(), Box(b.x, b.y, b.w, b.h))

    def mouseMoveEvent(self, e):
        if not self._drag:
            lb, mode = self._hit(e.position())
            self.setCursor(Qt.SizeFDiagCursor if mode == "resize" else Qt.SizeAllCursor if mode else Qt.ArrowCursor)
            return
        lb, mode, start, sb = self._drag
        r = self._img_rect()
        dx = (e.position().x() - start.x()) / r.width()
        dy = (e.position().y() - start.y()) / r.height()
        b = lb.box
        if mode == "move":
            b.y = min(max(sb.y + dy, 0), 1 - b.h)
            if not lb.full_width:
                b.x = min(max(sb.x + dx, 0), 1 - b.w)
        else:
            b.h = min(max(sb.h + dy, MIN_REL), 1 - b.y)
            if not lb.full_width:
                b.w = min(max(sb.w + dx, MIN_REL), 1 - b.x)
        self.update()

    def mouseReleaseEvent(self, _):
        if self._drag:
            self._drag = None
            self.changed.emit()
