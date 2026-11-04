import { useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { pad } from '../lib/time.js';

const RING_OUTER = 0.4; // radius angka luar (relatif ke lebar dial)
const RING_INNER = 0.26;

/**
 * Jam analog bulat 24 jam (gaya Material).
 * Mode jam: lingkar luar 1–12, lingkar dalam 13–24 (00). Mode menit: 0–55 tiap 5, bisa per menit.
 * Setelah memilih jam, otomatis pindah ke menit.
 */
export function AnalogClock({ value, onChange }) {
  const { h, m } = value;
  const [mode, setMode] = useState('h');
  const dialRef = useRef(null);
  const dragging = useRef(false);

  const pick = (e, release) => {
    const rect = dialRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    // sudut dari jam 12 searah jarum jam, 0..1
    const turn = ((Math.atan2(x, -y) / (2 * Math.PI)) + 1) % 1;
    if (mode === 'h') {
      const step = Math.round(turn * 12) % 12;
      const inner = Math.hypot(x, y) < rect.width * ((RING_OUTER + RING_INNER) / 2);
      const hour = inner ? (step === 0 ? 0 : step + 12) : (step === 0 ? 12 : step);
      onChange({ h: hour, m });
      if (release) setMode('m');
    } else {
      onChange({ h, m: Math.round(turn * 60) % 60 });
    }
  };

  const handlers = {
    onPointerDown: e => {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      pick(e, false);
    },
    onPointerMove: e => dragging.current && pick(e, false),
    onPointerUp: e => {
      if (!dragging.current) return;
      dragging.current = false;
      pick(e, true);
    }
  };

  // Posisi angka & jarum
  const pos = (turn, r) => ({
    left: `${50 + Math.sin(turn * 2 * Math.PI) * r * 100}%`,
    top: `${50 - Math.cos(turn * 2 * Math.PI) * r * 100}%`
  });
  const selTurn = mode === 'h' ? (h % 12) / 12 : m / 60;
  const selR = mode === 'h' && (h === 0 || h > 12) ? RING_INNER : RING_OUTER;

  const numbers = mode === 'h'
    ? [
        ...Array.from({ length: 12 }, (_, i) => ({ v: i === 0 ? 12 : i, t: i / 12, r: RING_OUTER })),
        ...Array.from({ length: 12 }, (_, i) => ({ v: i === 0 ? 0 : i + 12, t: i / 12, r: RING_INNER, inner: true }))
      ]
    : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, t: i / 12, r: RING_OUTER }));

  return (
    <div>
      <div className="clock-read">
        <button type="button" className={mode === 'h' ? 'on' : ''} onClick={() => setMode('h')}>{pad(h)}</button>
        <span>:</span>
        <button type="button" className={mode === 'm' ? 'on' : ''} onClick={() => setMode('m')}>{pad(m)}</button>
      </div>
      <div className="dial" ref={dialRef} {...handlers} role="slider"
        aria-label={mode === 'h' ? 'Pilih jam' : 'Pilih menit'} aria-valuenow={mode === 'h' ? h : m}>
        <div className="hand" style={{
          width: `${selR * 100}%`,
          transform: `rotate(${selTurn * 360 - 90}deg)`
        }} />
        <div className="knob" style={pos(selTurn, selR)} />
        <div className="center" />
        {numbers.map(n => {
          const on = mode === 'h' ? n.v === h : n.v === m;
          return (
            <span key={`${n.v}-${n.r}`} className={`num${n.inner ? ' inner' : ''}${on ? ' on' : ''}`} style={pos(n.t, n.r)}>
              {mode === 'm' ? pad(n.v) : n.v === 0 ? '00' : n.v}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Jam digital: dua kolom HH:MM dengan tombol naik/turun dan input langsung. */
export function DigitalClock({ value, onChange }) {
  const { h, m } = value;
  const wrap = (v, max) => (v + max) % max;

  const field = (val, max, key) => (
    <div className="col">
      <button type="button" aria-label="Naik" onClick={() => onChange({ ...value, [key]: wrap(val + 1, max) })}>
        <ChevronUp size={18} />
      </button>
      <input
        inputMode="numeric"
        value={pad(val)}
        onFocus={e => e.target.select()}
        onChange={e => {
          const n = parseInt(e.target.value.replace(/\D/g, '').slice(-2), 10);
          if (!Number.isNaN(n) && n < max) onChange({ ...value, [key]: n });
        }}
        aria-label={key === 'h' ? 'Jam' : 'Menit'}
      />
      <button type="button" aria-label="Turun" onClick={() => onChange({ ...value, [key]: wrap(val - 1, max) })}>
        <ChevronDown size={18} />
      </button>
    </div>
  );

  return (
    <div className="digital">
      {field(h, 24, 'h')}
      <span className="sep">:</span>
      {field(m, 60, 'm')}
    </div>
  );
}
