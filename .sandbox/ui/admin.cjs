const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Uji UI dashboard admin: pemilih claymorphism, struktur organisasi, urutan anggota
const puppeteer = require('puppeteer-core');
const BASE = 'http://192.168.1.3:25551';

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && errors.push('console: ' + m.text().slice(0, 160)));
  await p.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (n) => { await wait(500); await p.screenshot({ path: `shots/${n}.png` }); console.log('shot', n); };
  const clickText = async (sel, text) => {
    const ok = await p.evaluate((sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text) && !e.disabled);
      if (el) el.click();
      return !!el;
    }, sel, text);
    if (!ok) throw new Error(`tidak ada ${sel} "${text}"`);
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('FAIL', name, '-', e.message); errors.push(name + ': ' + e.message); } };

  await p.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
  await step('login', async () => {
    await p.type('input[type="text"]', 'pikr-manseku');
    await p.type('input[type="password"]', `${ADMIN_PW}`);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => location.pathname === '/admin', { timeout: 15000 });
  });

  // ── Anggota ──
  await p.goto(`${BASE}/admin/anggota`, { waitUntil: 'networkidle0' });
  await step('urutan anggota', async () => {
    await p.waitForSelector('table tbody tr', { timeout: 10000 });
    const rows = await p.$$eval('table tbody tr', (trs) => trs.map((tr) => {
      const t = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
      return { name: t[3], kelas: t[4], jabatan: t[5], status: t[7] };
    }));
    const firstAlumni = rows.findIndex((r) => r.status === 'ALUMNI');
    const lastActive = rows.map((r) => r.status).lastIndexOf('AKTIF');
    console.log('halaman 1:', rows.length, 'baris | alumni pertama di indeks', firstAlumni, '| aktif terakhir di indeks', lastActive);
    console.log('  contoh:', rows.slice(0, 4).map((r) => `${r.kelas} ${r.name}`).join(' | '));
  });
  await shot('admin-anggota');
  await step('pemilih filter kelas', async () => {
    await clickText('button', 'Semua Kelas');
    await p.waitForSelector('[role="dialog"]', { timeout: 4000 });
  });
  await shot('admin-picker-kelas');
  await step('tutup + modal edit', async () => {
    await p.keyboard.press('Escape');
    await wait(300);
    await p.click('table tbody tr:first-child button[title*="Edit"]');
    await p.waitForSelector('#edit-name', { timeout: 5000 });
  });
  await shot('admin-edit-anggota');
  await step('pemilih jabatan di modal edit', async () => {
    await clickText('button', 'Anggota biasa (tanpa jabatan)');
    await p.waitForSelector('[role="dialog"][aria-label*="jabatan"]', { timeout: 4000 });
  });
  await shot('admin-picker-jabatan');

  // ── Struktur organisasi ──
  await p.goto(`${BASE}/admin/org`, { waitUntil: 'networkidle0' });
  await step('org aktif', async () => { await p.waitForSelector('table', { timeout: 10000 }); });
  await shot('admin-org-aktif');
  await step('org arsip', async () => {
    await clickText('button', 'Arsip Kepengurusan');
    await wait(500);
    const heads = await p.$$eval('h3', (hs) => hs.map((h) => h.innerText.replace(/\s+/g, ' ')).filter((t) => /Kepengurusan/.test(t)));
    console.log('arsip:', heads.join(' | '));
  });
  await shot('admin-org-arsip');
  await step('modal tambah pengurus + pemilih akun', async () => {
    await clickText('button', 'Pengurus Aktif');
    await clickText('button', 'Tambah Pengurus');
    await p.waitForSelector('form', { timeout: 4000 });
    await clickText('button', 'Pilih akun anggota');
    await p.waitForSelector('[role="dialog"][aria-label*="akun"]', { timeout: 4000 });
  });
  await shot('admin-picker-akun');
  await step('cari di pemilih', async () => {
    await p.type('[role="dialog"] input', 'zah');
    await wait(400);
    const n = await p.$$eval('[role="dialog"] button[class*="card"]', (b) => b.length);
    console.log('hasil cari "zah":', n, 'kartu');
  });
  await shot('admin-picker-cari');

  // ── Absensi ──
  await p.goto(`${BASE}/admin/absensi`, { waitUntil: 'networkidle0' });
  await step('absensi', async () => { await p.waitForSelector('[role="tab"]', { timeout: 8000 }); });
  await shot('admin-absensi');
  await step('absensi tab id card', async () => { await clickText('button', 'ID Card'); await wait(800); });
  await shot('admin-absensi-idcard');

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await b.close();
})();
