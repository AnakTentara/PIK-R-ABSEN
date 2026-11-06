// Uji dashboard v2.3: halaman Atur Bot WhatsApp + bar tombol popup selalu terlihat.
// Jalankan terhadap backend UJI (database salinan), bukan produksi:
//   BASE=http://127.0.0.1:25571 ADMIN_USER=uji-dev ADMIN_PW=... node dashboard-v23.cjs
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:25571';
const USER = process.env.ADMIN_USER || 'uji-dev';
const PW = process.env.ADMIN_PW || 'sandi-uji-dashboard';
const OUT = path.join(__dirname, 'shots', 'v23');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

// Bar tombol popup terlihat di dalam layar dan di dalam kartu popup
const barVisible = (p) => p.evaluate(() => {
  const bar = [...document.querySelectorAll('.modal-bar')].pop();
  if (!bar) return { found: false };
  const r = bar.getBoundingClientRect();
  const shell = bar.closest('.modal-shell').getBoundingClientRect();
  const scroll = bar.closest('.modal-shell').querySelector('.modal-scroll');
  return {
    found: true,
    inViewport: r.top >= 0 && r.bottom <= innerHeight + 1,
    inShell: r.bottom <= shell.bottom + 1,
    scrollable: scroll ? scroll.scrollHeight > scroll.clientHeight : false,
    buttons: [...bar.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean)
  };
});

(async () => {
  const token = (await (await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PW }) })).json()).token;
  if (!token) throw new Error('login uji gagal');
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g|404|ERR_|Failed to load resource/i.test(m.text()) && errors.push('console: ' + m.text().slice(0, 160)));
  await p.setViewport({ width: 1280, height: 720 });
  await p.goto(BASE + '/admin/login', { waitUntil: 'networkidle2' });
  await p.evaluate((t, u) => { localStorage.setItem('admin_token', t); localStorage.setItem('admin_user', JSON.stringify({ username: u, role: 'DEVELOPER' })); }, token, USER);

  console.log('\nPengaturan → kartu Atur Bot WhatsApp');
  await p.goto(BASE + '/admin/settings', { waitUntil: 'networkidle2' });
  await p.waitForSelector('a[href="/admin/settings/bot"]', { timeout: 10000 });
  const card = await p.$eval('a[href="/admin/settings/bot"]', (a) => ({ text: a.textContent, w: a.getBoundingClientRect().width, cw: a.parentElement.getBoundingClientRect().width }));
  ok('kartu panjang bertuliskan "Atur Bot WhatsApp"', /Atur Bot WhatsApp/.test(card.text) && card.w > card.cw * 0.9, `lebar ${Math.round(card.w)} dari ${Math.round(card.cw)}`);
  await p.screenshot({ path: `${OUT}/1-pengaturan.png` });
  await p.click('a[href="/admin/settings/bot"]');
  await p.waitForFunction(() => location.pathname === '/admin/settings/bot', { timeout: 8000 });
  ok('klik menuju /admin/settings/bot', true);

  console.log('\nHalaman Atur Bot');
  await p.waitForSelector('[role="switch"]', { timeout: 10000 });
  await wait(1200);
  ok('status bot tampil (Mati)', await p.evaluate(() => /Mati/.test(document.body.innerText)));
  ok('terminal debug tersambung langsung (SSE)', await p.evaluate(() => /LANGSUNG/.test(document.body.innerText)));
  ok('log awal bot tampil di terminal', await p.evaluate(() => /Bot dimatikan dari dashboard/.test(document.querySelector('[class*="term"]')?.parentElement?.innerText || document.body.innerText)));
  ok('tombol Nyalakan Bot ada', await p.evaluate(() => /Nyalakan Bot/.test(document.querySelector('[role="switch"]').textContent)));
  ok('panel Hubungkan: minta nyalakan dulu', await p.evaluate(() => /Nyalakan bot dulu/.test(document.body.innerText)));
  ok('Uji Kirim nonaktif saat bot belum terhubung', await p.evaluate(() => [...document.querySelectorAll('form button[type="submit"]')].some((x) => /Kirim/.test(x.textContent) && x.disabled)));
  ok('daftar perintah bot tampil', await p.evaluate(() => /\/rekap/.test(document.body.innerText) && /\/absen/.test(document.body.innerText)));
  await p.screenshot({ path: `${OUT}/2-bot-mati.png`, fullPage: true });
  // Status lewat API terlindungi
  const unauth = await (await fetch(BASE + '/api/admin/wa/status')).status;
  ok('API status bot menolak tanpa token', unauth === 401);
  const sseBad = await (await fetch(BASE + '/api/admin/wa/stream?token=salah')).status;
  ok('SSE menolak token salah', sseBad === 401);

  console.log('\nTampilan HP (390 px)');
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.reload({ waitUntil: 'networkidle2' });
  await wait(1000);
  ok('tanpa gulir horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: `${OUT}/3-bot-hp.png`, fullPage: true });

  console.log('\nPopup dashboard: bar tombol selalu terlihat (layar pendek 1280x600)');
  await p.setViewport({ width: 1280, height: 600 });
  // Tambah anggota (form panjang)
  await p.goto(BASE + '/admin/anggota', { waitUntil: 'networkidle2' });
  await wait(800);
  const addBtn = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find((x) => /Tambah Anggota|Tambah Manual/i.test(x.textContent)));
  if (addBtn.asElement()) {
    await addBtn.asElement().click();
    await wait(600);
    const v = await barVisible(p);
    ok('Anggota → Tambah: bar terlihat tanpa menggulir', v.found && v.inViewport && v.inShell, JSON.stringify(v));
    await p.screenshot({ path: `${OUT}/4-popup-tambah-anggota.png` });
    await p.keyboard.press('Escape');
    const cancel = await p.evaluateHandle(() => [...document.querySelectorAll('.modal-bar button')].find((x) => /Batal/.test(x.textContent)));
    if (cancel.asElement()) await cancel.asElement().click();
    await wait(400);
  } else ok('tombol Tambah Anggota ditemukan', false);
  // Edit anggota (popup lebar)
  const editBtn = await p.$('button[title*="Edit"], button[aria-label*="Edit"]');
  if (editBtn) {
    await editBtn.click();
    await wait(800);
    const v = await barVisible(p);
    ok('Anggota → Edit: bar terlihat, isi menggulir', v.found && v.inViewport && v.inShell, JSON.stringify(v));
    await p.screenshot({ path: `${OUT}/5-popup-edit-anggota.png` });
    const cancel = await p.evaluateHandle(() => [...document.querySelectorAll('.modal-bar button')].find((x) => /Batal/.test(x.textContent)));
    if (cancel.asElement()) await cancel.asElement().click();
    await wait(400);
  }
  // Absensi → Kegiatan baru
  await p.goto(BASE + '/admin/absensi', { waitUntil: 'networkidle2' });
  await wait(800);
  // Tab Kegiatan, lalu "+ Kegiatan untuk tanggal lalu"
  const tabK = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find((x) => /^s*Kegiatans*$/i.test(x.textContent)));
  if (tabK.asElement()) { await tabK.asElement().click(); await wait(600); }
  const newSess = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find((x) => /Kegiatan untuk tanggal lalu|Kegiatan baru/i.test(x.textContent)));
  if (newSess.asElement()) {
    await newSess.asElement().click();
    await wait(600);
    const v = await barVisible(p);
    ok('Absensi → Kegiatan baru: bar Simpan/Batal terlihat', v.found && v.inViewport && v.buttons.some((t) => /Simpan/.test(t)), JSON.stringify(v));
    await p.screenshot({ path: `${OUT}/6-popup-kegiatan.png` });
  } else console.log('  · tombol Kegiatan baru tidak ditemukan di halaman (dilewati)');
  // Struktur → Tambah pengurus
  await p.goto(BASE + '/admin/org', { waitUntil: 'networkidle2' });
  await wait(800);
  const addOrg = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find((x) => /Tambah (Pengurus|Pembina)/i.test(x.textContent)));
  if (addOrg.asElement()) {
    await addOrg.asElement().click();
    await wait(600);
    const v = await barVisible(p);
    ok('Struktur → Tambah: bar terlihat', v.found && v.inViewport && v.inShell, JSON.stringify(v));
  } else console.log('  · tombol Tambah Pengurus tidak ditemukan (dilewati)');
  // Pengguna → tambah admin
  await p.goto(BASE + '/admin/users', { waitUntil: 'networkidle2' });
  await wait(800);
  const addUser = await p.evaluateHandle(() => [...document.querySelectorAll('button')].find((x) => /Tambah (Admin|Akun)/i.test(x.textContent)));
  if (addUser.asElement()) {
    await addUser.asElement().click();
    await wait(600);
    const v = await barVisible(p);
    ok('Pengguna → Tambah admin: bar terlihat', v.found && v.inViewport && v.inShell, JSON.stringify(v));
  } else console.log('  · tombol Tambah Admin tidak ditemukan (dilewati)');

  console.log(`\n${errors.length ? 'Galat di konsol:\n  ' + errors.join('\n  ') : 'Tanpa galat konsol.'}`);
  console.log(fails ? `\n${fails} GAGAL` : '\nSEMUA LULUS');
  await b.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
