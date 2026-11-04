const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage(); await p.setViewport({ width: 1366, height: 900 });
  await p.setRequestInterception(true);
  p.on('request', (r) => (/\/api\/public\/design/.test(r.url()) ? r.abort() : r.continue()));
  await p.evaluateOnNewDocument(() => localStorage.setItem('pikr_site_theme_vars', JSON.stringify({'--color-accent':'#16a34a','--color-accent-hover':'#15803d','--color-accent-light':'#4ade80','--color-accent-dark':'#166534','--color-accent-subtle':'#dcfce7'})));
  await p.goto('http://192.168.1.3:25551/', { waitUntil: 'networkidle2' }); await new Promise(r=>setTimeout(r,1500));
  const out = await p.evaluate(() => [435, 925].map((x) => document.elementsFromPoint(x, 400).slice(0, 6).map((e) => {
    const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}.${String(e.className).slice(0,50)} bg=${cs.backgroundColor} img=${cs.backgroundImage.slice(0,90)}`; })));
  out.forEach((o, i) => { console.log('x=' + [435, 925][i]); o.forEach((l) => console.log('  ', l)); });
  await b.close();
})();
