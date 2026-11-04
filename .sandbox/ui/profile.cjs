const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--ignore-certificate-errors'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  for (const [url, out] of [['http://192.168.1.3:25551/@yiarariarahenmairaharizon', 'web-profil'], ['http://192.168.1.3:25551/@ahzasholaqurdelia', 'web-profil-tanpabio'], ['http://192.168.1.3:25551/@tidakada', 'web-profil-404'], ['http://192.168.1.3:25551/kami', 'web-kami']]) {
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 800));
    await p.screenshot({ path: `shots/${out}.png`, fullPage: true });
    console.log(out, (await p.$eval('body', el => el.innerText.slice(0, 120).replace(/\s+/g, ' '))));
  }
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
