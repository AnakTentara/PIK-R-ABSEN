import { useEffect, useState } from 'react';
import { feedback } from '../lib/feedback.js';

/**
 * Sepasang tombol 1:1 dengan konfirmasi 2 langkah.
 * Ketuk pertama: tombol memanjang dan menampilkan label.
 * Ketuk kedua (saat memanjang): aksi dijalankan.
 * Mengetuk tombol lainnya memindahkan "armed" ke tombol itu.
 *
 * left/right: { icon, label, color: 'green'|'red'|'blue'|'plain'|..., onConfirm, disabled }
 * Ubah `resetKey` untuk mengembalikan kedua tombol ke ukuran 1:1.
 */
export default function DynamicButtons({ left, right, busy = false, resetKey }) {
  const [armed, setArmed] = useState(null); // null | 'left' | 'right'

  useEffect(() => setArmed(null), [resetKey]);

  const press = (side, e) => {
    const btn = side === 'left' ? left : right;
    if (busy || btn.disabled) return;
    // Titik sentuh untuk kilau cahaya di dalam tombol
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--px', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--py', `${e.clientY - r.top}px`);
    if (armed === side) {
      btn.onConfirm();
    } else {
      feedback.tap();
      setArmed(side);
    }
  };

  const render = (side, btn) => (
    <button
      type="button"
      className={`cbtn c-${btn.color}${armed === side ? ' grow' : ''}${busy ? ' busy' : ''}`}
      onClick={e => press(side, e)}
      disabled={btn.disabled || busy}
      aria-label={btn.label}
      aria-pressed={armed === side}
    >
      {side === 'right' && <span className="lbl">{btn.label}</span>}
      {btn.icon}
      {side === 'left' && <span className="lbl">{btn.label}</span>}
    </button>
  );

  return (
    <div className="dyn">
      {render('left', left)}
      {render('right', right)}
    </div>
  );
}
