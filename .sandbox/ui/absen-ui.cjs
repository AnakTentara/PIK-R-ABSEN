const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Uji UI web absen (sandbox: Vite 25564 -> API sandbox 25562). Screenshot 390px terang+gelap, alur simpan, frame time.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = 'https://127.0.0.1:25564';
const OUT = 'shots/absen';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const THEMES = (process.argv[2] || 'light,dark').split(',');

(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });
  const results = {};
  for (const theme of THEMES) {
    const ctx = await b.createBrowserContext();
    const p = await ctx.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    p.on('pageerror', (e) => errors.push(`[${theme}] pageerror: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|fonts\.g|ERR_INTERNET|ERR_NAME|Failed to load resource.*(font|404)/i.test(m.text())) errors.push(`[${theme}] console: ${m.text().slice(0, 200)}`);
    });
    await p.evaluateOnNewDocument((t) => { try { localStorage.setItem('absen_theme', JSON.stringify(t)); } catch {} }, theme);
    const shot = async (n) => { await wait(900); await p.screenshot({ path: `${OUT}/${theme}-${n}.png` }); };

    // ── Login ──
    await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 40000 });
    await shot('1-login');
    await p.type('#u', 'pikrmanseku01');
    await p.type('#p', `${ABSEN_PW}`);
    await p.click('button[type="submit"]');
    await p.waitForSelector('.tabs', { timeout: 15000 });
    await wait(600);
    // Hari ini mungkin tanpa kegiatan: popup Kegiatan Baru muncul -> buat (sandbox, aman)
    if (await p.$('.sheet #st')) {
      await shot('2a-kegiatan-baru');
      await p.type('#st', 'Rapat Uji UI');
      await p.click('.sheet form button[type="submit"]');
      await p.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 8000 });
    }
    await shot('2-beranda-scan');

    // ── Daftar anggota ──
    await p.click('.tabs button:nth-child(2)');
    await wait(900);
    await shot('3-daftar');
    await p.evaluate(() => document.querySelector('.mcard')?.click());
    await wait(500);
    await shot('3b-daftar-terpilih');

    // ── Alur absen masuk via daftar (tombol 2 langkah) + ukur frame time animasi sheet ──
    await p.evaluate(() => document.querySelector('.bottom-actions .c-green')?.click());
    await p.evaluate(() => {
      window.__frames = [];
      let last = performance.now();
      const t0 = last;
      (function f(now) { window.__frames.push(now - last); last = now; if (now - t0 < 1500) requestAnimationFrame(f); })(last);
    });
    await p.waitForSelector('.sheet', { timeout: 5000 });
    await wait(1700);
    const frames = await p.evaluate(() => window.__frames.slice(2));
    const avg = frames.reduce((a, x) => a + x, 0) / frames.length;
    const sorted = [...frames].sort((x, y) => x - y);
    results[theme] = { frames: frames.length, avgMs: +avg.toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), maxMs: +Math.max(...frames).toFixed(2), over20ms: frames.filter((x) => x > 20).length };
    await shot('4-sheet-keterangan');

    // Ketuk 1 = memanjang, ketuk 2 = simpan
    const btn = '.dyn .cbtn:last-child';
    await p.click(btn);
    await wait(900);
    await shot('4b-tombol-memanjang');
    await p.click(btn);
    await p.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 8000 });
    await wait(350);
    await shot('5-confetti');
    await wait(1400);
    await shot('5b-setelah-simpan');

    // ── Popup hasil scan (scan manual = hanya baca) ──
    await p.click('.tabs button:nth-child(1)');
    await wait(800);
    await p.evaluate(() => [...document.querySelectorAll('.link-btn')].find((x) => /ketik kode/i.test(x.textContent))?.click());
    await wait(300);
    await p.type('.manual-code input', 'https://pikr-manseku.my.id/@budisantoso');
    await p.click('.manual-code button');
    await p.waitForSelector('.sheet .person', { timeout: 8000 });
    await wait(1300);
    await shot('6-popup-scan');
    await p.evaluate(() => document.querySelector('.sheet .dyn .cbtn:first-child')?.click());
    await wait(900);
    await shot('6b-popup-edit-memanjang');
    await p.evaluate(() => document.querySelector('.sheet .dyn .cbtn:first-child')?.click());
    await p.waitForSelector('.overlay.top .dial', { timeout: 5000 });
    await wait(800);
    await shot('6c-edit-waktu');
    await p.keyboard.press('Escape');
    await wait(500);
    await p.keyboard.press('Escape');
    await wait(500);

    // ── History & Pengaturan ──
    await p.evaluate(() => document.querySelector('a[href="/history"]')?.click());
    await p.waitForSelector('.stat-row', { timeout: 10000 });
    await shot('7-history');
    await p.evaluate(() => document.querySelector('.icon-btn[aria-label="Kembali"]')?.click());
    await p.waitForSelector('.tabs', { timeout: 5000 });
    await p.evaluate(() => document.querySelector('a[href="/pengaturan"]')?.click());
    await p.waitForSelector('.page .card', { timeout: 10000 });
    await shot('8-pengaturan');
    await ctx.close();
    console.log('selesai tema', theme);
  }
  console.log('FRAME', JSON.stringify(results));
  console.log('ERRORS', errors.length ? '\n' + errors.join('\n') : 'tidak ada');
  await b.close();
})().catch((e) => { console.error('GAGAL', e.message); console.log('ERRORS', errors.join('\n')); process.exit(1); });
