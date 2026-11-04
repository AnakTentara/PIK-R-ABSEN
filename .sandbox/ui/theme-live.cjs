const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
const puppeteer = require('puppeteer-core');
const B = 'http://192.168.1.3:25552/api';
const W = 'http://192.168.1.3:25551';
(async () => {
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
  const login = await j(await fetch(`${B}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'pikr-manseku', password: `${ADMIN_PW}` }) }));
  const H = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };
  const before = (await j(await fetch(`${B}/admin/design`, { headers: H }))).design;
  console.log('desain awal :', before.theme, before.card.style);
  try {
    const put = await fetch(`${B}/admin/design`, { method: 'PUT', headers: H, body: JSON.stringify({ design: { ...before, theme: 'tosca', radius: 'bulat', card: { ...before.card, style: 'klasik', cover: 'titik', hidden: ['gender'] } } }) });
    console.log('PUT /admin/design ->', put.status);
    const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const p = await br.newPage();
    await p.setViewport({ width: 1000, height: 900 });
    await p.goto(`${W}/@ahzasholaqurdelia`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));
    const info = await p.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
      hasGender: /Jenis Kelamin/.test(document.body.innerText),
      styleTag: !!document.getElementById('pikr-site-theme'),
      cached: !!localStorage.getItem('pikr_site_theme_vars')
    }));
    console.log('situs publik:', JSON.stringify(info));
    await p.screenshot({ path: 'shots/d-kartu-tosca-klasik.png' });
    await p.goto(`${W}/admin`, { waitUntil: 'networkidle0' });
    const adminAccent = await p.evaluate(() => ({ attr: document.documentElement.hasAttribute('data-admin'), accent: getComputedStyle(document.querySelector('a, button')).color }));
    console.log('dashboard tetap data-admin:', adminAccent.attr);
    await br.close();
  } finally {
    const back = await fetch(`${B}/admin/design`, { method: 'PUT', headers: H, body: JSON.stringify({ design: before }) });
    const now = (await j(await fetch(`${B}/admin/design`, { headers: H }))).design;
    console.log('dikembalikan:', back.status, now.theme, now.card.style, JSON.stringify(now) === JSON.stringify(before));
  }
})();
