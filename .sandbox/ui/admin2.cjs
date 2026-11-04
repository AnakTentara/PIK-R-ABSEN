const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Uji UI: Desain, Pengguna, Struktur (editor hierarki, ganti pejabat), Anggota (Excel), Absensi (pengaturan)
const puppeteer = require('puppeteer-core');
const BASE = 'http://192.168.1.3:25551';
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/favicon|404|Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text().slice(0, 180)));
  await p.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (n) => { await wait(600); await p.screenshot({ path: `shots/${n}.png` }); console.log('shot', n); };
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

  // Desain
  await p.goto(`${BASE}/admin/desain`, { waitUntil: 'networkidle0' });
  await step('desain tema', async () => { await p.waitForSelector('[role="tab"]', { timeout: 8000 }); });
  await shot('d-tema');
  await step('pilih tema laut -> pratinjau berubah, tombol simpan aktif', async () => {
    await clickText('button', 'Biru Laut');
    await wait(400);
    const accent = await p.evaluate(() => getComputedStyle(document.querySelector('[class*="previewBox"]')).getPropertyValue('--color-accent').trim());
    console.log('aksen pratinjau:', accent);
    if (accent !== '#0ea5e9') throw new Error('pratinjau tidak berubah: ' + accent);
    const saveBtn = await p.evaluate(() => [...document.querySelectorAll('button')].find((e) => /Simpan Perubahan/.test(e.textContent))?.disabled);
    if (saveBtn !== false) throw new Error('tombol simpan tidak aktif');
  });
  await shot('d-tema-laut');
  await step('tab kartu biodata + pratinjau kartu', async () => {
    await clickText('[role="tab"]', 'Kartu Biodata');
    await p.waitForSelector('article', { timeout: 5000 });
    await clickText('button', 'Kaca');
  });
  await shot('d-kartu');
  await step('tab beranda, tentang, visi, halaman', async () => {
    for (const t of ['Beranda', 'Tentang Kami', 'Visi', 'Halaman Baru']) { await clickText('[role="tab"]', t); await wait(250); }
  });
  await shot('d-halaman');

  // Pengguna
  await p.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle0' });
  await step('pengguna: 2 seksi', async () => {
    await p.waitForSelector('table', { timeout: 8000 });
    const heads = await p.$$eval('h2', (hs) => hs.map((h) => h.innerText.replace(/\s+/g, ' ')));
    console.log('seksi:', heads.join(' | '));
    if (heads.length < 2) throw new Error('kurang dari 2 seksi');
  });
  await shot('d-pengguna');

  // Struktur
  await p.goto(`${BASE}/admin/org`, { waitUntil: 'networkidle0' });
  await step('org: tombol di bar, tab satu baris', async () => {
    await p.waitForSelector('table', { timeout: 8000 });
    const tabH = await p.$$eval('button[class*="tab"]', (bs) => bs.slice(0, 2).map((b) => Math.round(b.getBoundingClientRect().height)));
    console.log('tinggi tab:', tabH.join(','));
    if (Math.max(...tabH) > 52) throw new Error('tab masih 2 baris: ' + tabH);
  });
  await shot('d-org');
  await step('editor hierarki', async () => {
    await clickText('button', 'Atur Hierarki');
    await p.waitForSelector('[aria-label="Atur hierarki jabatan"]', { timeout: 4000 });
    const cards = await p.$$eval('[aria-label="Atur hierarki jabatan"] [draggable="true"]', (e) => e.length);
    console.log('kartu jabatan:', cards);
  });
  await shot('d-hierarki');
  await step('tutup editor, buka Tambah Pengurus', async () => {
    await p.keyboard.press('Escape'); await clickText('button', 'Batal');
  });

  // Anggota + Excel
  await p.goto(`${BASE}/admin/anggota`, { waitUntil: 'networkidle0' });
  await step('anggota: tombol Excel di bar', async () => {
    await p.waitForSelector('table tbody tr', { timeout: 8000 });
    await clickText('button', 'Impor Excel');
    await p.waitForSelector('[aria-label="Impor anggota dari Excel"]', { timeout: 4000 });
  });
  await shot('d-excel');

  // Absensi pengaturan
  await p.goto(`${BASE}/admin/absensi`, { waitUntil: 'networkidle0' });
  await step('absensi pengaturan: pertemuan + kegiatan wajib', async () => {
    await clickText('[role="tab"]', 'Pengaturan');
    await wait(600);
    const txt = await p.$eval('body', (el) => el.innerText);
    if (!/Pertemuan rutin/.test(txt) || !/Kegiatan wajib/.test(txt)) throw new Error('bagian pengaturan tidak lengkap');
  });
  await shot('d-absensi-pengaturan');

  // Situs publik memakai tema
  await p.goto(`${BASE}/@ahzasholaqurdelia`, { waitUntil: 'networkidle0' });
  await shot('d-kartu-publik');

  console.log('\nERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await b.close();
})();
