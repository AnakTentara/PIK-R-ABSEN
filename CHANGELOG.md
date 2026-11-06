# Changelog — PIK-R Absen

Proyek terpisah dari website utama (`PIK-R-MANSEKU`), terhubung lewat API `/api/absen/*` pada backend yang sama.
Perubahan sisi server dan dashboard dicatat di `PIK-R-MANSEKU/CHANGELOG.md`.

## [v1.3.0] — 2026-11-06

### Web absen (`frontend/`)
- **Tombol Kembali di HP tidak lagi menutup aplikasi:** Kembali menutup popup paling atas, lalu dari History / Daftar Anggota kembali ke Scan Kartu. Di Scan Kartu muncul "Tekan Kembali sekali lagi untuk keluar", dan Kembali berikutnya baru keluar (`src/lib/back.js`). Aplikasi kini satu alamat (`react-router-dom` dihapus).
- **Pencarian anggota:** kolom cari di Daftar Anggota (nama, kelas, jabatan, kode kartu). Mengabaikan huruf besar/kecil, aksen, dan urutan kata; bagian yang cocok disorot; tidak ada pilihan otomatis.
- **Geser antar huruf:** tombol ‹ › di kiri-kanan baris huruf, baris huruf bisa digeser, dan kotak anggota bisa digeser ke huruf sebelum/sesudahnya.
- **Animasi huruf tanpa kedip:** sorotan huruf aktif kini satu indikator yang meluncur. Lompat ke huruf jauh tidak lagi melewati (dan menyalakan) huruf-huruf di antaranya.
- **Rasio layar fleksibel:** kamera mengikuti tinggi layar (HP 20:9/21:9 lebih besar, kamera 4:5 di layar sangat panjang; HP pendek mengecil), kotak anggota mengisi sisa tinggi, tombol bawah selalu terlihat. Diuji di 360×640 sampai 412×915 dan layar lipat 600×900.
- **Tidak patah-patah lagi:** penyebab utamanya pemindai cadangan ZXing (dipakai iPhone dan HP tanpa BarcodeDetector) yang membaca gambar 1920×1080 penuh tiap 40 ms di thread utama (400–800 ms per percobaan) dan tetap membaca saat popup terbuka. Kini hanya pita tengah yang dibaca (diperkecil, maks. 960 px), berhenti saat popup terbuka, dan jedanya menyesuaikan kecepatan HP. Saat popup Kegiatan Baru dibuka, tugas panjang di thread utama turun dari 400–800 ms ke 0 (CPU diperlambat 4×). Popup ini juga tidak lagi muncul bersamaan dengan kamera dan daftar anggota yang sedang dimuat, dan kolom judulnya tidak langsung difokus (keyboard tidak muncul di tengah animasi). `@zxing/browser` dihapus.
- **"Buat Kegiatan":** peringatan "Belum ada kegiatan hari ini" kini punya tombol kecil di sampingnya.
- Hanya belasan kartu pertama yang dianimasikan saat masuk (lebih ringan di HP kelas menengah).

### Skrip uji (`.sandbox/ui/`)
- `home-v13.cjs`: tombol Kembali, pencarian, navigasi huruf tanpa kedip, tombol Buat Kegiatan, 6 ukuran layar, dan kelancaran popup (CPU 4× lebih lambat).
- `zxing-band.cjs`: pemindai ZXing pita tengah membaca barcode kartu asli lewat kamera palsu.
- `dashboard-v23.cjs`: halaman Atur Bot WhatsApp dan bar tombol popup dashboard (jalankan terhadap backend uji, bukan produksi).

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
