// Pasang tema hijau lewat cache localStorage, lalu pindai tiap halaman publik untuk warna oranye tersisa
const puppeteer = require('puppeteer-core');
const BASE = 'http://192.168.1.3:25551';
const PAGES = (process.argv[2] || '/,/kami,/anggota,/alumni,/forum,/pengumuman,/blog-tidak-ada,/tidak-ada-halaman').split(',');
const GREEN = {
  '--color-accent': '#16a34a', '--color-accent-hover': '#15803d', '--color-accent-light': '#4ade80', '--color-accent-dark': '#166534',
  '--color-accent-subtle': '#dcfce7', '--color-accent-border': '#16a34a40'
};

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1366, height: 900 });
  await p.setRequestInterception(true);
  p.on('request', (r) => (/\/api\/public\/design/.test(r.url()) ? r.abort() : r.continue()));
  await p.evaluateOnNewDocument((vars) => 0, GREEN);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let bad = 0;
  for (const path of PAGES) {
    await p.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await wait(1200);
    // gulir supaya konten lazy/animasi muncul
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await wait(500);
    const res = await p.evaluate(() => {
      const isOrange = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (!d) return false;
        const l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1));
        let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        return h >= 14 && h <= 46 && s > 0.6 && l > 0.3 && l < 0.85;
      };
      const parse = (str) => {
        const out = [];
        for (const m of str.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/g)) out.push([+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]);
        for (const m of str.matchAll(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/g)) out.push([m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]]);
        return out;
      };
      const props = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'boxShadow', 'outlineColor', 'fill', 'stroke', 'textDecorationColor'];
      const hits = new Map();
      for (const el of document.querySelectorAll('body *')) {
        for (const ps of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, ps);
        if (ps && (cs.content === 'none' || cs.content === 'normal')) continue;
        for (const pr of props) {
          const v = cs[pr];
          if (!v || v === 'none') continue;
          if (parse(v).some(([r, g, b, a]) => a > 0.05 && isOrange(r, g, b))) {
            const key = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0].slice(0, 40)} [${pr}]`;
            if (!hits.has(key)) hits.set(key + (ps || ''), v.slice(0, 80));
          }
        }
        }
      }
      return [...hits.entries()];
    });
    console.log(`\n${path} -> oranye tersisa: ${res.length}`);
    res.slice(0, 15).forEach(([k, v]) => console.log('   ', k, '=', v));
    bad += res.length;
    await p.screenshot({ path: `shots/theme-${path.replace(/\W+/g, '_') || 'home'}.png` });
  }
  console.log('\nTOTAL oranye tersisa:', bad);
  await b.close();
})();
