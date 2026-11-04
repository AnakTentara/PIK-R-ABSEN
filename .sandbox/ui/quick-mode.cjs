const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Uji Mode Cepat + Koreksi Absen + batal pilih + tanpa halaman Pengaturan (sandbox: Vite 25564 -> API 25562)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = 'https://127.0.0.1:25564';
const API = 'http://127.0.0.1:25562/api/absen';
const OUT = 'shots/quick';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

(async () => {
  const login = await (await fetch(API + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'pikrmanseku01', password: `${ABSEN_PW}` }) })).json();
  const H = { Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json' };
  const members = (await (await fetch(API + '/members', { headers: H })).json());
  const flat = Object.values(members.groups).flat();
  const target = flat.find((m) => m.name === 'Ahmad Fauzi');
  const codeOf = target.memberCode || target.slug && `https://pikr-manseku.my.id/@${target.slug}`;

  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g|ERR_INTERNET|ERR_NAME|font|404/i.test(m.text()) && errors.push('console: ' + m.text().slice(0, 160)));
  const shot = async (n) => { await wait(700); await p.screenshot({ path: `${OUT}/${n}.png` }); };
  const rec = async () => (await (await fetch(API + '/members', { headers: H })).json()).groups[target.name[0]].find((m) => m.id === target.id).record;

  await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 40000 });
  await p.type('#u', 'pikrmanseku01'); await p.type('#p', `${ABSEN_PW}`);
  await p.click('button[type="submit"]');
  await p.waitForSelector('.tabs', { timeout: 15000 });
  await wait(600);
  if (await p.$('.sheet #st')) { await p.type('#st', 'Rapat Uji'); await p.click('.sheet form button[type="submit"]'); await p.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 8000 }); }

  console.log('\nHalaman Pengaturan dihapus');
  ok('tidak ada ikon/tautan Pengaturan di header', !(await p.$('a[href="/pengaturan"], [aria-label="Pengaturan"]')));
  ok('ada tombol Keluar di header', !!(await p.$('[aria-label="Keluar"]')));
  ok('ada tombol tema', !!(await p.$('[aria-label="Ganti tema"]')));
  await p.goto(BASE + '/pengaturan', { waitUntil: 'networkidle2' });
  await wait(500);
  ok('/pengaturan kembali ke beranda', await p.evaluate(() => location.pathname === '/'));

  console.log('\nMode Cepat: tampilan');
  ok('tombol Mode Cepat ada di atas kamera', await p.evaluate(() => { const t = document.querySelector('.quick-toggle'), s = document.querySelector('.scanner'); return !!t && !!s && t.getBoundingClientRect().bottom <= s.getBoundingClientRect().top + 2; }));
  ok('awalnya mati, tanpa tombol Koreksi Absen', (await p.$eval('.quick-toggle', (e) => e.getAttribute('aria-checked'))) === 'false' && !(await p.$('.quick-correct')));
  await shot('1-mati');
  await p.click('.quick-toggle'); await wait(500);
  ok('menyala: aria-checked true', (await p.$eval('.quick-toggle', (e) => e.getAttribute('aria-checked'))) === 'true');
  const corr = await p.$('.quick-correct');
  ok('tombol Koreksi Absen muncul', !!corr);
  const geo = await p.evaluate(() => { const c = document.querySelector('.quick-correct').getBoundingClientRect(); const vh = innerHeight, vw = innerWidth; return { w: Math.round(c.width), h: Math.round(c.height), bottomGap: Math.round(vh - c.bottom), vw }; });
  ok('lebar, tinggi >= 56 px, dekat dasar layar (jangkauan jempol)', geo.w >= geo.vw - 40 && geo.h >= 56 && geo.bottomGap < 40, JSON.stringify(geo));
  ok('pilihan bertahan setelah muat ulang', await (async () => { await p.reload({ waitUntil: 'networkidle2' }); await wait(600); return (await p.$eval('.quick-toggle', (e) => e.getAttribute('aria-checked'))) === 'true'; })());
  await shot('2-menyala');

  console.log('\nMode Cepat: scan langsung tercatat (pakai kamera palsu: kode dimasukkan lewat kolom manual)');
  await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Ketik kode/.test(b.textContent))?.click());
  await wait(300);
  const scanManual = async (code) => { await p.click('.manual-code input', { clickCount: 3 }); await p.type('.manual-code input', code); await p.click('.manual-code button[type="submit"]'); await wait(900); };
  await scanManual(codeOf);
  ok('TANPA popup konfirmasi', !(await p.$('.sheet')));
  ok('kartu hasil muncul: absen masuk', await p.evaluate(() => /Absen masuk/.test(document.querySelector('.quick-result')?.textContent || '')), await p.evaluate(() => document.querySelector('.quick-result')?.textContent));
  const r1 = await rec();
  ok('server mencatat HADIR dengan jam masuk', r1?.status === 'HADIR' && !!r1.checkIn && !r1.checkOut, JSON.stringify(r1));
  await shot('3-masuk-tercatat');
  await scanManual(codeOf);
  ok('scan beruntun = "Barusan terscan", bukan keluar', await p.evaluate(() => /Barusan terscan/.test(document.querySelector('.quick-result')?.textContent || '')));
  ok('jam keluar tetap kosong', !(await rec()).checkOut);

  console.log('\nKoreksi Absen → slide Daftar Anggota');
  await p.click('.quick-correct'); await wait(1200);
  ok('pindah ke slide Daftar Anggota', await p.evaluate(() => document.querySelector('.tabs button.on')?.textContent.includes('Daftar Anggota')));
  await shot('4-daftar');

  console.log('\nBatal pilih (semua status bisa dikosongkan)');
  await p.evaluate((id) => { const cards = [...document.querySelectorAll('.mcard')]; cards.find((c) => c.textContent.includes('Ahmad Fauzi'))?.click(); }, target.id);
  await wait(300);
  await p.evaluate(() => [...document.querySelectorAll('.bottom-actions button')].find((b) => /Keterangan/.test(b.textContent))?.click());
  await wait(600);
  ok('popup terbuka dengan penanda "sudah tercatat" di Absen Masuk', !!(await p.$('.sheet .opt.k-IN .rec-dot')));
  await shot('5-popup-tercatat');
  ok('tanpa pilihan: tombol konfirmasi = "Kosongkan Absen"', await p.evaluate(() => /Kosongkan Absen/.test(document.querySelector('.sheet .dyn')?.textContent || '')));
  // pilih Sakit lalu batal pilih dengan mengetuk lagi
  await p.click('.sheet .opt.k-SAKIT'); await wait(250);
  ok('memilih Sakit mengaktifkan tombol Sakit', await p.$eval('.sheet .opt.k-SAKIT', (e) => e.classList.contains('on')));
  await p.click('.sheet .opt.k-SAKIT'); await wait(250);
  ok('mengetuk lagi = batal pilih', !(await p.$eval('.sheet .opt.k-SAKIT', (e) => e.classList.contains('on'))));
  ok('kembali ke "Kosongkan Absen"', await p.evaluate(() => /Kosongkan Absen/.test(document.querySelector('.sheet .dyn')?.textContent || '')));
  // kosongkan: ketuk dua kali (konfirmasi 2 langkah)
  const btn = '.sheet .dyn .cbtn:last-child';
  await p.click(btn); await wait(500); await p.click(btn); await wait(1300);
  ok('popup tertutup', !(await p.$('.sheet')));
  ok('server: absen dikosongkan (tanpa baris)', (await rec()) === null, JSON.stringify(await rec()));
  await shot('6-dikosongkan');

  console.log('\nMode Cepat dimatikan: popup konfirmasi kembali');
  await p.click('.tabs button:nth-child(1)'); await wait(900);
  await p.click('.quick-toggle'); await wait(400);
  ok('Koreksi Absen hilang saat mode mati', !(await p.$('.quick-correct')));
  await scanManual(codeOf);
  ok('scan biasa memunculkan popup konfirmasi', !!(await p.$('.sheet')));
  ok('dan belum menyimpan apa pun', (await rec()) === null);

  console.log('\nGalat konsol/halaman:', errors.length ? errors : 'tidak ada');
  console.log(fails ? `\nGAGAL: ${fails}` : '\nSEMUA LULUS');
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('SKRIP GAGAL:', e.message); process.exit(2); });
