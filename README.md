# PIK-R Absen

Klien sistem absensi PIK-R MANSEKU: web absen (`absen.pikr-manseku.my.id`) dan aplikasi pembuat ID Card.

**API-nya tidak ada di sini.** API absensi (`/api/absen/*`) tinggal di backend utama repo `PIK-R-MANSEKU`.
Untuk konteks lengkap (tujuan proyek, aturan, cara produksi, pindah server), baca **`PIK-R-MANSEKU/HAND_OVER.md`** dulu.

| Folder | Isi |
|---|---|
| `frontend/` | Web absen (React + Vite, mobile first, PWA) |
| `idcard-generator/` | Aplikasi Windows (.exe) untuk menempel barcode dan QR ke foto ID Card |
| `.sandbox/` | Skrip uji dan database uji terpisah. **Bukan untuk deploy** |
| `ecosystem.config.cjs` | PM2 lama untuk tes lokal. Produksi memakai `PIK-R-MANSEKU/ecosystem.config.cjs` |

## Identitas di ID Card

| Sisi | Kode | Isi | Dipakai untuk |
|---|---|---|---|
| Depan | Barcode batang (Code 128) | `memberCode`, mis. `PIKR_0001-26` | Scan absen |
| Belakang | QR kotak | `https://pikr-manseku.my.id/@slug` | Kamera HP membuka biodata anggota |

`memberCode` **diisi admin lewat Excel** (dashboard → Absensi → ID Card), tidak dibuat otomatis.
`memberCode` dan `slug` tidak boleh berubah setelah kartu dicetak.

## Web absen (`frontend/`)

```bash
cd frontend
npm install
npm run dev      # https://localhost:25554 (HTTPS self-signed agar kamera HP jalan), API diteruskan ke localhost:25552
npm run build    # hasil di dist/, dilayani oleh scripts/serve-static.mjs di repo utama
```

- Login memakai akun bersama petugas atau akun admin dashboard. **Sandi tidak ditulis di dokumen.**
- Halaman: **Scan Kartu** (kamera, **Mode Cepat**, scan manual), **Daftar Anggota**, **History** (rekap, Excel, PDF).
- Pengaturan absensi ada di **dashboard admin**, bukan di web ini.
- Antrean offline: absen yang gagal kirim disimpan di HP dan dikirim ulang tanpa data dobel.
- Kamera hanya bisa dipakai lewat **HTTPS**.

### Aturan absensi

- Kegiatan **wajib**: pertemuan rutin (bawaan Jum'at 15.00) dan tanggal wajib tambahan. Anggota aktif yang tidak absen dihitung **Alfa otomatis**.
- Hari lain: popup **Kegiatan Baru** (judul wajib, deskripsi opsional), jenis **tambahan**. Alfa diisi manual.
- Scan 1 = masuk, scan 2 = keluar, scan 3 = tampilkan data (koreksi lewat Edit Waktu).
- **Mode Cepat:** scan langsung tercatat tanpa konfirmasi. Scan kedua dalam 1 menit dibaca dobel, bukan keluar.
- Semua status (masuk, keluar, izin, sakit, alfa) bisa dikosongkan kembali ke "belum diisi".
- Semua waktu memakai WIB (UTC+7).

## ID Card Generator (`idcard-generator/`)

Alur: **Ekspor Excel dari dashboard → muat Excel itu di aplikasi → Scan (OCR) → Generate.**
Excel adalah sumber kebenaran nama, kode, dan link. OCR hanya mencocokkan foto ke baris daftar.

```bat
cd idcard-generator
build.bat        :: tes inti, lalu PyInstaller -> dist\PIKR-IDCard-Generator.exe
```

Butuh Python 3.10–3.13 (skrip mengunduh Python 3.12 portabel bila tidak ada). Hasil di folder kartu:
`Success\NAMA.png`, `Success\Back\back_NAMA.png`, `Success\data_anggota.xlsx`, dan `Failed\failed-list.xlsx`
(foto tanpa daftar, daftar tanpa foto, data tidak lengkap, foto dobel).

## Pengujian

```bash
cd .sandbox && cp -r ../../PIK-R-MANSEKU/src/. src/    # sinkronkan kode backend dulu
ABSEN_PASSWORD=sandi-uji-absen node test-absen.js      # API absensi, Mode Cepat, kosongkan (sandi uji, bukan produksi)
node test-idcard.js                                    # Excel ID Card
cd ../idcard-generator && python test_core.py          # pencocokan nama, Excel, generate
```

Uji tidak menyentuh database produksi (sandbox punya `local.db` sendiri).

## Data pribadi

Folder foto ID Card, daftar Excel anggota, cadangan database, dan hasil scan **tidak boleh masuk git**
(berisi NISN, email, WhatsApp, foto siswa). `.gitignore` sudah menutupnya; jangan dilonggarkan.
