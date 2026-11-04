const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const zx = require('../../frontend/node_modules/@zxing/library');
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  for (const f of process.argv.slice(2)) {
    const b64 = fs.readFileSync(f).toString('base64');
    const mime = f.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const { w, h, data } = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const lum = new Array(c.width * c.height);
      for (let i = 0; i < lum.length; i++) lum[i] = (d[i*4] * 299 + d[i*4+1] * 587 + d[i*4+2] * 114) / 1000 | 0;
      return { w: c.width, h: c.height, data: lum };
    }, `data:${mime};base64,${b64}`);
    const src = new zx.RGBLuminanceSource(Uint8ClampedArray.from(data), w, h);
    const hints = new Map([[zx.DecodeHintType.TRY_HARDER, true]]);
    try {
      const r = new zx.MultiFormatReader(); r.setHints(hints);
      const res = r.decode(new zx.BinaryBitmap(new zx.HybridBinarizer(src)));
      console.log(path.basename(f), `${w}x${h}`, '->', zx.BarcodeFormat[res.getBarcodeFormat()], JSON.stringify(res.getText()));
    } catch (e) { console.log(path.basename(f), `${w}x${h}`, '-> TIDAK TERBACA', e.constructor.name); }
  }
  await browser.close();
})();
