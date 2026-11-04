/**
 * Umpan balik indra: bunyi sintetis (Web Audio) + getar (Android).
 * - AudioContext dibuat/dilanjutkan saat gestur pertama (aturan autoplay iOS & Chrome).
 * - Tiap peristiwa punya karakter nada sendiri, volume rendah supaya tidak mengganggu ruang rapat.
 */
let ctx = null;
let master = null;

function audio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Buka kunci audio pada sentuhan pertama (iOS menolak suara sebelum ada gestur)
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/**
 * Satu nada: envelope attack cepat + decay halus (tidak "klik").
 * notes = [{ f: Hz, at: detik, dur: detik, type?, vol?, glide?: Hz tujuan }]
 */
function play(notes) {
  const ac = audio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + 0.005;
    for (const n of notes) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const start = t0 + (n.at || 0);
      const end = start + n.dur;
      osc.type = n.type || 'sine';
      osc.frequency.setValueAtTime(n.f, start);
      if (n.glide) osc.frequency.exponentialRampToValueAtTime(n.glide, end);
      const vol = n.vol ?? 0.2;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch { /* audio tidak tersedia */ }
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch { /* abaikan */ }
}

// Skala pentatonik C mayor: apa pun urutannya terdengar harmonis
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G4 = 392, A4 = 440;

export const feedback = {
  /** Sentuhan ringan: tik halus */
  tap: () => { vibrate(10); play([{ f: 1500, at: 0, dur: 0.035, type: 'triangle', vol: 0.07 }]); },
  /** Kode terbaca: "bip" pendek bersemangat */
  scan: () => { vibrate(25); play([{ f: G5, at: 0, dur: 0.07, vol: 0.16 }, { f: C6, at: 0.06, dur: 0.1, vol: 0.18 }]); },
  /** Absen masuk tersimpan: arpeggio naik (C-E-G-C) */
  success: () => {
    vibrate([30, 40, 60]);
    play([C5, E5, G5, C6].map((f, i) => ({ f, at: i * 0.065, dur: 0.2 - i * 0.015, vol: 0.17, type: i === 3 ? 'triangle' : 'sine' })));
  },
  /** Absen keluar tersimpan: arpeggio turun yang tenang (G-E-C) */
  checkout: () => {
    vibrate([60, 40, 30]);
    play([G5, E5, C5].map((f, i) => ({ f, at: i * 0.08, dur: 0.22, vol: 0.17 })));
  },
  /** Gagal: dua nada rendah turun, tumpul (bukan buzzer yang menyakitkan telinga) */
  error: () => {
    vibrate([80, 50, 80]);
    play([{ f: A4, at: 0, dur: 0.16, vol: 0.2, type: 'triangle', glide: 330 }, { f: G4, at: 0.14, dur: 0.24, vol: 0.2, type: 'triangle', glide: 220 }]);
  },
  /** Pop untuk toggle/pilihan */
  pop: () => { vibrate(8); play([{ f: 440, at: 0, dur: 0.09, type: 'sine', vol: 0.12, glide: 880 }]); },
  /** Tinggi sedikit untuk perayaan setelah confetti */
  sparkle: () => play([E6, C6, E6].map((f, i) => ({ f, at: i * 0.05, dur: 0.12, vol: 0.07, type: 'sine' })))
};
