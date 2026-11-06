/**
 * Tombol Kembali di HP (terutama aplikasi yang sudah dipasang di layar utama).
 * Tanpa ini, Kembali langsung menutup aplikasi. Urutannya sekarang:
 *   1. popup paling atas ditutup,
 *   2. History / Daftar Anggota kembali ke Scan Kartu,
 *   3. di Scan Kartu: muncul "tekan sekali lagi", Kembali berikutnya keluar.
 *
 * Caranya: beberapa entri riwayat "penjaga" ditumpuk di atas halaman. Tiap Kembali memakai satu penjaga
 * dan aplikasi menangani langkah itu. Penjaga ditambah lagi hanya saat layar disentuh, karena Chrome
 * melewati entri riwayat yang dibuat tanpa interaksi pengguna (Kembali bisa langsung menutup aplikasi).
 */
const DEPTH = 4;
const handlers = [];
let seq = 0;
let draining = false;

const depth = () => (Number.isInteger(window.history.state?.pikrGuard) ? window.history.state.pikrGuard : 0);

function topUp() {
  if (navigator.userActivation && !navigator.userActivation.isActive) return;
  for (let d = depth() + 1; d <= DEPTH; d++) window.history.pushState({ pikrGuard: d }, '');
}

/**
 * Daftarkan penangan Kembali. `fn()` mengembalikan true bila langkah itu sudah ditangani.
 * Prioritas lebih tinggi dicoba dulu (popup = 10, halaman = 0); di prioritas yang sama, yang terbaru dulu.
 * Mengembalikan fungsi pelepas, cocok untuk `useEffect`.
 */
export function onBack(fn, priority = 0) {
  const h = { fn, priority, seq: ++seq };
  handlers.push(h);
  handlers.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  return () => {
    const i = handlers.indexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

let started = false;
export function initBack({ onExitHint }) {
  if (started) return;
  started = true;
  // Aplikasi hanya punya satu alamat; alamat lama (/history, /pengaturan) dirapikan ke "/"
  if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');

  window.addEventListener('popstate', () => {
    if (draining) { draining = false; return; }
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i].fn()) return;
    }
    // Tidak ada yang bisa ditutup: buang sisa penjaga, Kembali berikutnya menutup aplikasi
    onExitHint?.();
    const d = depth();
    if (d > 0) { draining = true; window.history.go(-d); }
  });
  // Sentuhan (pointerup memberi "user activation" pada layar sentuh) mengisi ulang penjaga
  window.addEventListener('pointerup', topUp, { passive: true });
  window.addEventListener('keydown', topUp);
}
