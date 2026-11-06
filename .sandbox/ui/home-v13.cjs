const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
// Uji v1.3: tombol Kembali, pencarian, geser antar huruf, indikator huruf tanpa kedip,
// tombol "Buat Kegiatan", dan tata letak di beberapa rasio layar (sandbox: web 25564 -> API 25562)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = process.env.BASE || 'https://127.0.0.1:25564';
const OUT = 'shots/v13';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

async function login(p) {
  await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 40000 });
  if (await p.$('#u')) {
    await p.type('#u', 'pikrmanseku01'); await p.type('#p', ABSEN_PW);
    await p.click('button[type="submit"]');
  }
  await p.waitForSelector('.tabs', { timeout: 15000 });
  await wait(900);
}
const tapAt = async (p, sel) => {
  // Seperti jari: elemen digeser ke layar dulu (baris huruf bisa digulir ke samping)
  await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'nearest', inline: 'center' }), sel);
  await wait(250);
  const el = await p.$(sel);
  const b = await el.boundingBox();
  await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};
const historyBack = async (p) => { await p.evaluate(() => history.back()); await wait(450); };

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g|ERR_INTERNET|ERR_NAME|font|404|camera|Permission|NotFound|Requested device/i.test(m.text()) && errors.push('console: ' + m.text().slice(0, 160)));
  const shot = async (n) => { await wait(500); await p.screenshot({ path: `${OUT}/${n}.png` }); };

  await login(p);

  console.log('\nTidak ada kegiatan: banner + tombol kecil');
  const hasBanner = !!(await p.$('.no-session'));
  if (hasBanner) {
    // Popup Kegiatan Baru muncul sendiri sesudah halaman siap; tutup dulu untuk menguji banner
    await p.waitForSelector('.sheet', { timeout: 4000 }).catch(() => {});
    const autoOpened = !!(await p.$('.sheet #st'));
    ok('popup Kegiatan Baru terbuka otomatis sekali', autoOpened);
    ok('kolom judul tidak langsung difokus (tanpa keyboard di tengah animasi)', await p.evaluate(() => document.activeElement?.id !== 'st'));
    await historyBack(p);
    ok('Kembali di HP menutup popup', !(await p.$('.overlay')));
    ok('aplikasi tidak tertutup (masih di beranda)', !!(await p.$('.tabs')));
    const btn = await p.$('.no-session .mini-btn');
    ok('tombol "Buat Kegiatan" di samping peringatan', !!btn && (await p.$eval('.no-session .mini-btn', (e) => e.textContent.trim())) === 'Buat Kegiatan');
    const geo = await p.evaluate(() => { const r = document.querySelector('.no-session').getBoundingClientRect(), m = document.querySelector('.mini-btn').getBoundingClientRect(); return { sameRow: Math.abs((r.top + r.bottom) / 2 - (m.top + m.bottom) / 2) < 4, h: m.height }; });
    ok('tombol sebaris dengan teks, tinggi >= 32 px', geo.sameRow && geo.h >= 32, JSON.stringify(geo));
    await shot('1-banner');
    await tapAt(p, '.no-session .mini-btn');
    await p.waitForSelector('.sheet #st', { timeout: 4000 });
    ok('tombol membuka popup Kegiatan Baru', true);
    await p.type('#st', 'Rapat Uji v1.3');
    await p.click('.sheet form button[type="submit"]');
    await p.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 8000 });
    ok('kegiatan dibuat, peringatan hilang', !(await p.$('.no-session')));
  } else {
    ok('sudah ada kegiatan hari ini (banner tidak tampil)', true);
  }

  console.log('\nTombol Kembali di HP');
  await tapAt(p, '.tabs button:nth-child(2)');
  await wait(800);
  ok('pindah ke Daftar Anggota', (await p.$eval('.tabs', (e) => e.style.getPropertyValue('--i'))) === '1');
  await historyBack(p);
  await wait(400);
  ok('Kembali di Daftar Anggota -> Scan Kartu', (await p.$eval('.tabs', (e) => e.style.getPropertyValue('--i'))) === '0');
  await tapAt(p, '.pill-btn');
  await p.waitForFunction(() => /History/.test(document.querySelector('.header-title')?.textContent || ''), { timeout: 8000 });
  ok('History terbuka', true);
  await historyBack(p);
  await p.waitForSelector('.tabs .on', { timeout: 5000 });
  ok('Kembali di History -> Beranda', /Scan Kartu/.test(await p.$eval('.tabs .on', (e) => e.textContent)));
  await tapAt(p, '.quick-toggle'); await wait(200); await tapAt(p, '.quick-toggle'); await wait(300);
  await historyBack(p);
  ok('Kembali pertama di Scan Kartu: muncul "tekan sekali lagi", tetap di aplikasi', await p.evaluate(() => /sekali lagi/.test(document.body.innerText)) && !!(await p.$('.tabs')));
  const before = await p.evaluate(() => history.length);
  ok('riwayat penjaga habis, Kembali berikutnya keluar', await p.evaluate(() => !Number.isInteger(history.state?.pikrGuard)), `history.length=${before}`);

  console.log('\nDaftar Anggota: huruf, geser, tanpa kedip');
  await tapAt(p, '.tabs button:nth-child(2)');
  await wait(800);
  const avail = await p.$$eval('.letters button:not(:disabled)', (bs) => bs.map((x) => x.dataset.l));
  ok('baris huruf satu baris + tombol < >', (await p.$$('.step-btn')).length === 2 && await p.$eval('.letters', (e) => e.scrollHeight <= 50));
  // Rekam semua huruf yang pernah tersorot selama lompatan jauh
  await p.evaluate(() => {
    window.__on = [];
    const strip = document.querySelector('.letters');
    new MutationObserver(() => strip.querySelectorAll('button.on').forEach((x) => window.__on.push(x.dataset.l))).observe(strip, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const far = avail[avail.length - 1];
  await tapAt(p, `.letters button[data-l="${far}"]`);
  await wait(900);
  const seen = [...new Set(await p.evaluate(() => window.__on))];
  ok(`lompat A -> ${far}: hanya huruf tujuan yang menyala (tanpa kedip di huruf lain)`, seen.length === 1 && seen[0] === far, `tersorot: ${seen.join(',')}`);
  const pageOk = await p.evaluate((l) => { const el = document.querySelector('.letter-pages'); const i = Math.round(el.scrollLeft / el.clientWidth); return el.children[i]?.querySelector('h3')?.textContent === l; }, far);
  ok('halaman yang tampil sesuai huruf', pageOk);
  const ind = await p.evaluate(() => { const i = document.querySelector('.letters-ind').getBoundingClientRect(), o = document.querySelector('.letters button.on').getBoundingClientRect(); return Math.abs(i.left - o.left) < 2 && Math.abs(i.width - o.width) < 2; });
  ok('indikator berada tepat di huruf aktif', ind);
  await shot('2-huruf-jauh');
  await tapAt(p, '.step-btn[aria-label="Huruf sebelumnya"]');
  await wait(800);
  ok('tombol < pindah ke huruf sebelumnya', (await p.$eval('.letters button.on', (e) => e.dataset.l)) === avail[avail.length - 2]);
  // Geser jari di kotak anggota
  const box = await (await p.$('.letter-pages')).boundingBox();
  const cur = await p.$eval('.letters button.on', (e) => e.dataset.l);
  await p.evaluate(() => { const el = document.querySelector('.letter-pages'); el.scrollTo({ left: el.scrollLeft - el.clientWidth, behavior: 'smooth' }); });
  await wait(900);
  ok('geser kotak ke kanan -> huruf sebelumnya', (await p.$eval('.letters button.on', (e) => e.dataset.l)) === avail[avail.indexOf(cur) - 1], `box ${Math.round(box.width)}px`);

  console.log('\nPencarian');
  await p.type('.search-input', 'putri');
  await wait(500);
  const names = await p.$$eval('.search-page .mcard .nm', (xs) => xs.map((x) => x.textContent));
  ok('cari "putri" menampilkan semua nama berisi Putri', names.length >= 2 && names.every((n) => /putri/i.test(n)), names.join(', '));
  ok('bagian yang cocok disorot', (await p.$$('.search-page .mcard .nm mark')).length === names.length);
  ok('tidak ada yang terpilih otomatis', !(await p.$('.mcard.sel')));
  ok('baris huruf disembunyikan saat mencari', !(await p.$('.letters')));
  await shot('3-cari');
  await p.click('.search-clear'); await wait(100);
  await p.type('.search-input', 'xi-1 andi');
  await wait(500);
  const n2 = await p.$$eval('.search-page .mcard .nm', (xs) => xs.map((x) => x.textContent));
  ok('urutan kata bebas + kelas ("xi-1 andi")', n2.length >= 1 && n2.every((n) => /andi/i.test(n)), n2.join(', '));
  await p.click('.search-clear'); await wait(100);
  await p.type('.search-input', 'zzzz');
  await wait(400);
  ok('tidak cocok: pesan kosong', !!(await p.$('.search-page .empty')));
  await p.click('.search-clear');
  await wait(500);
  ok('hapus pencarian: kembali ke halaman huruf terakhir', !!(await p.$('.letters')) && (await p.$eval('.letters button.on', (e) => e.dataset.l)) === avail[avail.indexOf(cur) - 1]);
  // Pilih anggota lalu Kembali dari popup
  await tapAt(p, '.letter-pages .letter-page:nth-child(1) .mcard');
  await wait(200);
  await p.evaluate(() => { const el = document.querySelector('.letter-pages'); el.scrollLeft = 0; });
  await wait(300);
  await tapAt(p, '.letter-pages .letter-page:nth-child(1) .mcard');
  await wait(200);
  if (await p.$('.bottom-actions .c-green:not(:disabled)')) {
    await tapAt(p, '.bottom-actions .c-green');
    await p.waitForSelector('.sheet', { timeout: 4000 });
    await historyBack(p);
    ok('Kembali menutup popup absen, tetap di Daftar Anggota', !(await p.$('.overlay')) && (await p.$eval('.tabs', (e) => e.style.getPropertyValue('--i'))) === '1');
  }

  console.log('\nRasio layar');
  const SIZES = [
    ['hp-pendek-360x640', 360, 640], ['hp-biasa-390x844', 390, 844], ['hp-panjang-20x9-393x873', 393, 873],
    ['hp-sangat-panjang-21x9-360x840', 360, 840], ['hp-panjang-lebar-412x915', 412, 915], ['lipat-terbuka-600x900', 600, 900]
  ];
  for (const [name, w, h] of SIZES) {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await p.evaluate(() => { const el = document.querySelector('.slides'); el.scrollLeft = 0; });
    await wait(500);
    const g = await p.evaluate(() => {
      const vh = innerHeight;
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const cam = r('.scanner'), app = r('.app');
      return { camH: Math.round(cam.height), camBottom: Math.round(cam.bottom), vh, appOverflow: document.documentElement.scrollHeight - vh, hScroll: document.documentElement.scrollWidth - innerWidth, appH: Math.round(app.height) };
    });
    await p.screenshot({ path: `${OUT}/rasio-scan-${name}.png` });
    await p.evaluate(() => { const el = document.querySelector('.slides'); el.scrollLeft = el.clientWidth; });
    await wait(500);
    const g2 = await p.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const box = r('.member-box'), act = r('.bottom-actions');
      return { boxH: Math.round(box.height), actBottom: Math.round(act.bottom), gap: Math.round(act.top - box.bottom) };
    });
    await p.screenshot({ path: `${OUT}/rasio-anggota-${name}.png` });
    ok(`${name}: kamera ${g.camH}px, tanpa gulir halaman/horizontal, tombol bawah di layar, kotak anggota ${g2.boxH}px`,
      g.appOverflow <= 1 && g.hScroll <= 0 && g2.actBottom <= h && g2.boxH >= 150 && g2.gap >= 0 && g2.gap <= 20 && g.camBottom < h,
      JSON.stringify({ ...g, ...g2 }));
  }

  console.log('\nKelancaran popup (CPU diperlambat 4x, meniru HP kelas menengah)');
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluate(() => { const el = document.querySelector('.slides'); el.scrollLeft = 0; });
  await wait(500);
  const cdp = await p.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Yang diukur: tugas panjang di main thread (yang membuat animasi tersendat di HP).
  // Jeda frame di Chrome headless ikut terhitung GPU software, jadi tidak dipakai sebagai patokan.
  // Batas 120 ms dengan CPU 4x lebih lambat ≈ 30 ms di HP sungguhan (di bawah 2 frame).
  const measure = async (open) => {
    await p.evaluate(() => {
      window.__lt = [];
      window.__po?.disconnect();
      window.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration))));
      window.__po.observe({ type: 'longtask' });
    });
    await open();
    await wait(1100);
    return p.evaluate(() => ({ longTasks: window.__lt, worst: Math.max(0, ...window.__lt) }));
  };
  const hasNew = !!(await p.$('.no-session .mini-btn'));
  if (hasNew) {
    const r = await measure(() => p.evaluate(() => document.querySelector('.no-session .mini-btn').click()));
    ok('popup Kegiatan Baru: main thread tidak tersendat', r.worst < 120, JSON.stringify(r));
    await historyBack(p);
    await wait(400);
  }
  await p.evaluate(() => { const el = document.querySelector('.slides'); el.scrollLeft = el.clientWidth; });
  await wait(500);
  await p.evaluate(() => document.querySelector('.letter-pages .mcard')?.click());
  await wait(200);
  if (await p.$('.bottom-actions .c-orange:not(:disabled)')) {
    const r2 = await measure(() => p.evaluate(() => document.querySelector('.bottom-actions .c-orange').click()));
    ok('popup Keterangan Lain: main thread tidak tersendat', r2.worst < 120, JSON.stringify(r2));
    await historyBack(p);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  console.log(`\n${errors.length ? 'Galat di konsol:\n  ' + errors.join('\n  ') : 'Tanpa galat konsol.'}`);
  console.log(fails ? `\n${fails} GAGAL` : '\nSEMUA LULUS');
  await b.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
