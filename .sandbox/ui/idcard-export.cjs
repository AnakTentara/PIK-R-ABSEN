const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Klik "Ekspor Excel" di Absensi -> ID Card lewat dashboard admin, tangkap respons, toast, dan galat
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = process.argv[2] || 'http://192.168.1.3:25551';
const DL = 'D:/RUDY/codeHaikal/PIK-R-ABSEN/.sandbox/ui/dl';

(async () => {
  fs.rmSync(DL, { recursive: true, force: true });
  fs.mkdirSync(DL, { recursive: true });
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  const cdp = await p.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL.replace(/\//g, '\\') });
  const log = [];
  p.on('pageerror', (e) => log.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && log.push('console: ' + m.text().slice(0, 200)));
  p.on('response', async (r) => {
    if (/idcards/.test(r.url())) log.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')} type=${r.headers()['content-type']}`);
  });
  await p.setViewport({ width: 1366, height: 900 });
  await p.evaluateOnNewDocument(() => { window.__dl = []; window.__ev = []; window.__rej = []; window.addEventListener('unhandledrejection', (e) => window.__rej.push('REJ ' + (e.reason && e.reason.message))); window.addEventListener('error', (e) => window.__rej.push('ERR ' + e.message)); const cou = URL.createObjectURL; URL.createObjectURL = function (b) { window.__ev.push('createObjectURL ' + (b && b.size) + ' ' + (b && b.type)); return cou.apply(this, arguments); }; const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__ev.push('a.click download=' + this.download); return oc.apply(this, arguments); }; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { const h = this.href; fetch(h).then((r) => r.blob()).then((b) => window.__dl.push({ name: this.download, size: b.size, type: b.type })); } return orig.apply(this, arguments); }; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await p.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
  await p.type('input[type="text"]', 'pikr-manseku');
  await p.type('input[type="password"]', `${ADMIN_PW}`);
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => location.pathname === '/admin', { timeout: 15000 });
  await p.goto(`${BASE}/admin/absensi`, { waitUntil: 'networkidle0' });
  const clicked = async (text) => p.evaluate((t) => {
    const el = [...document.querySelectorAll('button, [role=tab]')].find((e) => e.textContent.trim().includes(t));
    if (el) el.click();
    return !!el;
  }, text);
  console.log('tab ID Card:', await clicked('ID Card'));
  await wait(1500);
  console.log('tombol Ekspor Excel:', await clicked('Ekspor Excel'));
  const seen = new Set(); for (let i = 0; i < 30; i++) { await wait(300); const t = await p.evaluate(() => [[...document.querySelectorAll('[role=status],[role=alert]')].map((e) => e.textContent.trim()).join(' / '), (window.__ev || []).join(' ; '), (window.__rej || []).join(' ; ')].join(' || ')); if (!seen.has(t)) { seen.add(t); console.log(i * 300 + 'ms', t); } }
  const toasts = await p.evaluate(() => [...document.querySelectorAll('[role=status]')].map((e) => e.textContent.trim()));
  console.log('toast:', JSON.stringify(toasts));
  console.log('events:', JSON.stringify(await p.evaluate(() => window.__ev)));
  console.log('teks toast:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('div')].map((e) => e.textContent.trim()).filter((t) => /gagal|berhasil|unduh/i.test(t) && t.length < 90).slice(0, 5))));
  console.log('unduhan tertangkap:', JSON.stringify(await p.evaluate(() => window.__dl)));
  log.forEach((l) => console.log(' ', l));
  await p.screenshot({ path: 'shots/idcard-export.png' });
  await b.close();
})().catch((e) => { console.log('SKRIP GAGAL:', e.message); process.exit(1); });
