const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
// Uji pemindai ZXing baru (pita tengah) memakai video palsu berisi kartu asli.
// BarcodeDetector dimatikan supaya jalur cadangan ZXing yang dipakai (seperti di iPhone).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const card = fs.readFileSync(require('path').join(__dirname, '..', 'render', 'depan.png')).toString('base64');
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument((card) => {
    delete window.BarcodeDetector;
    window.__codes = [];
    // Kamera palsu: kanvas 1280x720 berisi kartu, barcode di tengah frame seperti saat dibidik
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const g = c.getContext('2d');
      const img = new Image(); img.src = 'data:image/png;base64,' + card;
      await img.decode();
      // Potong area barcode kartu (y 840-930 dari 1004) dan perbesar ke tengah frame
      const draw = () => {
        g.fillStyle = '#ddd'; g.fillRect(0, 0, 1280, 720);
        g.drawImage(img, 150, 830, 340, 110, 240, 250, 800, 259);
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(30);
    };
  }, card);
  p.on('console', (m) => /scan|kode/i.test(m.text()) && console.log('console:', m.text()));
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (r.url().endsWith('/api/absen/scan')) { console.log('POST /scan body:', r.postData()); r.respond({ status: 404, contentType: 'application/json', body: '{"message":"uji"}' }); }
    else r.continue();
  });
  await p.goto('https://127.0.0.1:25564/', { waitUntil: 'networkidle2' });
  if (await p.$('#u')) { await p.type('#u', 'pikrmanseku01'); await p.type('#p', ABSEN_PW); await p.click('button[type="submit"]'); }
  await p.waitForSelector('.tabs'); await wait(1500);
  if (await p.$('.overlay')) { await p.evaluate(() => history.back()); await wait(600); }
  // Kegiatan harus ada supaya scan dikirim; di sandbox hari ini tanpa kegiatan -> buat
  if (await p.$('.no-session')) {
    await p.click('.no-session .mini-btn'); await p.waitForSelector('#st'); await p.type('#st', 'Uji ZXing');
    await p.click('.sheet form button[type="submit"]'); await p.waitForFunction(() => !document.querySelector('.sheet'), { timeout: 8000 });
  }
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('.scanner.locked'), { timeout: 15000 }).then(() => console.log(`kode terbaca dalam ${Date.now() - t0} ms (ZXing, pita tengah)`)).catch(() => console.log('GAGAL: kode tidak terbaca dalam 15 detik'));
  await wait(800);
  await p.screenshot({ path: require('path').join(__dirname, 'shots', 'v13', 'zxing-scan.png') });
  await b.close();
})();
