/**
 * Confetti ringan tanpa library: satu canvas sementara, partikel disimulasikan dengan
 * requestAnimationFrame lalu canvas dibuang. ~60 partikel, hanya menggambar persegi kecil.
 */
const COLORS = ['#f97316', '#fb923c', '#fdba74', '#22c55e', '#4ade80', '#3b82f6', '#facc15', '#f43f5e'];

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {{x?: number, y?: number, count?: number, color?: string}} opt  titik ledakan dalam piksel layar
 */
export function burst({ x, y, count = 56 } = {}) {
  if (reduced()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  const ox = x ?? W / 2;
  const oy = y ?? H * 0.62;
  const parts = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const v = 7 + Math.random() * 9;
    return {
      x: ox, y: oy,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[i % COLORS.length], life: 0
    };
  });

  const start = performance.now();
  let last = start;
  (function frame(now) {
    const dt = Math.min((now - last) / 16.67, 2.5);
    last = now;
    g.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.vy += 0.32 * dt;           // gravitasi
      p.vx *= 0.985;               // hambatan udara
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life += dt;
      const fade = Math.max(0, 1 - (p.life - 40) / 30);
      if (p.y < H + 20 && fade > 0) {
        alive++;
        g.save();
        g.globalAlpha = Math.min(1, fade);
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
    }
    if (alive && now - start < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
}
