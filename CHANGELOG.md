# Changelog — PIK-R Absen

Proyek terpisah dari website utama (`PIK-R-MANSEKU`), terhubung lewat API `/api/absen/*` pada backend yang sama.
Perubahan sisi server dan dashboard dicatat di `PIK-R-MANSEKU/CHANGELOG.md`.

## [v1.2.0] — 2026-11-05

### Web absen (`frontend/`)
- **Mode Cepat:** tombol di atas kamera pada halaman Scan Kartu. Saat menyala, scan langsung tercatat masuk atau keluar tanpa popup konfirmasi. Hasilnya tampil sebagai kartu kecil di bawah kamera (nama, jam, "Barusan terscan" bila terscan dua kali). Pilihan diingat di HP.
- **Koreksi Absen:** tombol lebar di dasar layar (terjangkau jempol) yang muncul hanya saat Mode Cepat menyala, langsung menuju Daftar Anggota.
- **Semua status bisa dikosongkan:** di popup Keterangan Lain, ketuk lagi pilihan yang aktif untuk membatalkannya. Tanpa pilihan, tombol konfirmasi menjadi "Kosongkan Absen" dan anggota kembali "belum diisi". Pilihan yang sudah tercatat ditandai titik, dan ada "Hapus jam keluar saja".
- **Halaman Pengaturan dihapus:** pengaturan ada di dashboard. Header kini hanya berisi tema, Keluar, dan History.

### ID Card Generator (`idcard-generator/`)
- Nama tanpa spasi dari OCR dicocokkan ke daftar dengan membandingkan huruf tanpa spasi (teks kartu sering dirapatkan).
- Inisial di daftar ("M. Dzakwan Raziq") cocok dengan nama lengkap di kartu ("MUHAMMAD DZAKWAN R"), dan sebaliknya. Satu huruf lepas tanpa jangkar tidak lagi diterima, supaya nama orang lain tidak lolos.

### Repositori
- Folder `backend-module/` dihapus (salinan lama; backend yang berlaku ada di `PIK-R-MANSEKU/src`).
- `.gitignore` mengecualikan foto ID Card, daftar anggota, cadangan, dan arsip besar.

## [v1.1.0] — 2026-11-03

### Web absen (`frontend/`)
- **Desain & animasi dirombak:** token desain baru, clay berlapis, tombol yang terasa ditekan (pegas), indikator tab dan toggle yang bergeser, kartu anggota masuk bertahap, centang yang tergambar, bingkai scanner yang "mengunci" saat kode terbaca, popup naik dengan pegas, angka jam yang menggulung, tombol dinamis yang memanjang, confetti saat absen tersimpan, skeleton shimmer, header yang mengecil saat scroll, toggle tema dengan View Transition, login dengan latar bergerak. Mendukung `prefers-reduced-motion`.
- **Kecepatan:** halaman Riwayat dan Pengaturan dimuat saat dibuka (kode awal 120 kB → 13,5 kB gzip), font tidak memblokir render, ikon aplikasi diperkecil (215 kB → 21 kB), kartu anggota di-`memo`.
- **Suara & getar:** nada Web Audio berbeda untuk tap, scan, masuk, keluar, dan error; pola getar berbeda per aksi.
- **Scanner:** hanya membaca Code 128 dan QR, resolusi 1920×1080, fokus otomatis kontinu, jeda ZXing 40 ms.
- Aksesibilitas: fokus terlihat, target sentuh 44 px, label pada tombol ikon.
- `vite.config.js`: `allowedHosts` terbuka (dibutuhkan tunnel Cloudflare) dan `VITE_PROXY_TARGET` untuk pengujian.

### ID Card Generator (`idcard-generator/`)
- **Mode daftar Excel:** "Muat Excel daftar…" memakai file ekspor dashboard sebagai sumber kebenaran nama, kode, dan link. Pencocokan foto ke daftar bertingkat (persis, awalan kata berurutan, lalu mirip ≥ 88%); hanya diterima bila tepat satu kandidat.
- Foto tanpa daftar, daftar tanpa foto, data tidak lengkap, dan foto dobel masuk `Failed/failed-list.xlsx`. Hasil sukses ditulis ke `Success/data_anggota.xlsx` (bisa diimpor balik ke dashboard).
- Dependensi baru: `openpyxl`. Jalankan ulang `build.bat` untuk membuat .exe baru.

## [v1.0.0] — 2026-11-02

### Web absen (`frontend/`)
- Mobile-first, claymorphism, mode terang/gelap, PWA.
- Scanner barcode batang (Code 128) dan QR; BarcodeDetector bawaan Chrome dengan cadangan ZXing untuk iPhone.
- Popup anggota (foto, nama, kelas, jabatan, jam masuk/keluar), tombol dua langkah, edit waktu dengan jam bulat, getar (Android) dan bunyi.
- Daftar anggota aktif per huruf A–Z, keterangan Sakit/Izin/Alfa dengan catatan, jam digital.
- Riwayat harian dan rentang tanggal, ekspor Excel dan PDF.
- Jenis kegiatan: Pertemuan, Wajib, Tambahan; popup Kegiatan Baru di hari tanpa jadwal.
- Antrean offline: absen disimpan di HP dan dikirim ulang tanpa dobel.

### ID Card Generator (`idcard-generator/`)
- Aplikasi Windows (PySide6): atur kotak Nama, Barkode, dan QR dengan seret-lepas.
- OCR nama, urutan INTI lalu A–Z, kode `PIKR_0001-26`, barcode batang depan dan QR tautan belakang.
- Hasil: `Success/`, `Success/Back/`, `Failed/`, `data_anggota.csv|json`.
- `build.bat` memilih Python 3.10–3.13 otomatis (mengunduh Python portabel bila perlu).

### Backend (`backend-module/`)
- Salinan modul absensi yang terpasang di `PIK-R-MANSEKU/src` (controller, rute, middleware, util).
- Lihat `README.md` untuk langkah integrasi.
