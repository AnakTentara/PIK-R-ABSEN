const puppeteer = require('puppeteer-core');
const url = process.argv[2];
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, ignoreHTTPSErrors: true });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const cdp = await p.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  let n = 0, bytes = 0;
  cdp.on('Network.loadingFinished', (e) => { n++; bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await p.goto(url, { waitUntil: 'load', timeout: 90000 });
  await p.waitForSelector('input', { timeout: 60000 }).catch(() => {});
  const ms = Date.now() - t0;
  console.log(JSON.stringify({ url, tampil_login_ms: ms, request: n, unduh_KB: Math.round(bytes / 1024) }));
  await b.close();
})().catch((e) => console.log('GAGAL', e.message));
