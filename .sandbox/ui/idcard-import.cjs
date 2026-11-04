const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Impor Excel di Absensi -> ID Card: hanya PRATINJAU (dryRun), tidak menyimpan apa pun ke DB live
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BASE = 'http://192.168.1.3:25551';
const FILE = 'D:/RUDY/codeHaikal/PIK-R-ABSEN/.restore/live-roster.xlsx';

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const reqs = [];
  p.on('response', (r) => { if (/idcards\/(import|codes)/.test(r.url())) reqs.push(`${r.request().method()} ${r.url().split('/api')[1]} -> ${r.status()}`); });
  await p.setViewport({ width: 1366, height: 900 });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await p.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
  await p.type('input[type="text"]', 'pikr-manseku');
  await p.type('input[type="password"]', `${ADMIN_PW}`);
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => location.pathname === '/admin', { timeout: 15000 });
  await p.goto(`${BASE}/admin/absensi`, { waitUntil: 'networkidle0' });
  const click = (t) => p.evaluate((t) => { const el = [...document.querySelectorAll('button')].find((e) => e.textContent.includes(t) && !e.disabled); if (el) el.click(); return !!el; }, t);
  await click('ID Card'); await wait(1500);
  const input = await p.$('input[type=file][accept=".xlsx"]');
  console.log('input impor ada:', !!input);
  await input.uploadFile(FILE);
  await wait(3000);
  const modal = await p.evaluate(() => document.body.innerText.match(/Pratinjau impor ID Card[\s\S]{0,260}/)?.[0]);
  console.log('modal:', JSON.stringify(modal));
  await p.screenshot({ path: 'shots/idcard-import.png' });
  // tombol Hapus semua kode: buka dialog saja, lalu batal
  await click('Batal'); await wait(300);
  console.log('buka dialog hapus:', await click('Hapus semua kode'));
  await wait(500);
  console.log('dialog:', JSON.stringify(await p.evaluate(() => document.body.innerText.match(/Hapus semua kode ID Card\?[\s\S]{0,200}/)?.[0])));
  console.log('tombol hapus aktif tanpa ketik HAPUS:', await p.evaluate(() => { const bs = [...document.querySelectorAll('button')].filter((e) => e.textContent.includes('Hapus semua kode')); return bs.some((e) => !e.disabled && e.closest('[class*=modal], [role=dialog]')); }));
  console.log('request:', reqs.join(' | '));
  console.log('errors:', errs);
  await b.close();
})().catch((e) => { console.log('SKRIP GAGAL:', e.message); process.exit(1); });
