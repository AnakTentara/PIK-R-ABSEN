const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  for (const [url, out] of [['http://192.168.1.3:25551/alumni', 'web-alumni'], ['http://192.168.1.3:25551/@febriady', 'web-profil-alumni-ketua'], ['http://192.168.1.3:25551/@annisamawaddah', 'web-profil-alumni-biasa'], ['http://192.168.1.3:25551/anggota', 'web-anggota']]) {
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 700));
    await p.screenshot({ path: `shots/${out}.png` });
    console.log(out, '|', (await p.$eval('body', el => el.innerText.replace(/\s+/g, ' ').slice(0, 140))));
  }
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
