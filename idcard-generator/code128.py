"""
Encoder Code 128 (set B) tanpa dependensi + renderer tajam.

Barcode digambar dengan lebar garis BILANGAN BULAT piksel (tidak di-resize),
supaya tetap terbaca setelah dicetak. Jangan pernah mengecilkan hasil gambar ini.
"""
from PIL import Image, ImageDraw

# Pola lebar bar/spasi untuk nilai 0..106 (106 = STOP, 7 elemen)
PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]
START_B = 104
STOP = 106
QUIET_MODULES = 10


def encode(text: str) -> list[int]:
    """Kembalikan daftar lebar elemen (bar, spasi, bar, ...) dalam satuan modul."""
    values = [START_B]
    for ch in text:
        code = ord(ch)
        if not 32 <= code <= 127:
            raise ValueError(f"Karakter tidak didukung Code 128-B: {ch!r}")
        values.append(code - 32)
    checksum = (values[0] + sum(i * v for i, v in enumerate(values[1:], start=1))) % 103
    values += [checksum, STOP]
    return [int(w) for v in values for w in PATTERNS[v]]


def total_modules(text: str) -> int:
    return sum(encode(text)) + 2 * QUIET_MODULES


def render(text: str, box_w: int, box_h: int, quiet: int = QUIET_MODULES) -> tuple[Image.Image, int]:
    """
    Gambar barcode putih-hitam seukuran box (box_w x box_h).
    `quiet` = margin putih kiri/kanan (modul) yang wajib ada agar scanner bisa membaca.
    Mengembalikan (gambar, lebar_modul_px). lebar_modul_px < 2 = berisiko sulit discan.
    """
    widths = encode(text)
    modules = sum(widths) + 2 * quiet
    module_px = max(1, box_w // modules)
    img = Image.new("RGB", (box_w, box_h), "white")
    draw = ImageDraw.Draw(img)
    # Pusatkan barcode di dalam box
    x = (box_w - sum(widths) * module_px) // 2
    for i, w in enumerate(widths):
        width_px = w * module_px
        if i % 2 == 0:  # elemen genap = bar hitam
            draw.rectangle([x, 0, x + width_px - 1, box_h - 1], fill="black")
        x += width_px
    return img, module_px


def decode_widths(widths: list[int]) -> str:
    """Kebalikan encode() — dipakai untuk self-test."""
    table = {p: i for i, p in enumerate(PATTERNS)}
    chunks, i = [], 0
    while i < len(widths):
        size = 7 if i + 7 == len(widths) else 6
        chunks.append(table["".join(map(str, widths[i:i + size]))])
        i += size
    assert chunks[0] == START_B and chunks[-1] == STOP
    data = chunks[1:-2]
    checksum = (START_B + sum(n * v for n, v in enumerate(data, start=1))) % 103
    assert checksum == chunks[-2], "checksum salah"
    return "".join(chr(v + 32) for v in data)
