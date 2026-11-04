const puppeteer = require('puppeteer-core');
const fs = require('fs');
const DIR = 'D:/RUDY/codeHaikal/PIK-R-ABSEN/Id card pik-r manseku periode 20262027/';
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  for (const f of process.argv.slice(2)) {
    const src = 'data:image/png;base64,' + fs.readFileSync(DIR + f).toString('base64');
    const r = await p.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      const white = (i, j) => { const k = (j * c.width + i) * 4; return d[k] > 245 && d[k+1] > 245 && d[k+2] > 245; };
      // kotak putih terbesar: cari baris & kolom dengan run putih panjang
      const rows = [];
      for (let j = 0; j < c.height; j++) {
        let best = 0, cur = 0, end = 0;
        for (let i = 0; i < c.width; i++) { cur = white(i, j) ? cur + 1 : 0; if (cur > best) { best = cur; end = i; } }
        rows.push([best, end - best + 1]);
      }
      // kelompokkan baris berurutan dengan run >= 200 & posisi mirip
      const groups = []; let g = null;
      rows.forEach(([len, x0], j) => {
        if (len >= 200) {
          if (g && j === g.y1 + 1 && Math.abs(x0 - g.x0) < 6) { g.y1 = j; g.len = Math.min(g.len, len); }
          else { g = { y0: j, y1: j, x0, len }; groups.push(g); }
        }
      });
      return { w: c.width, h: c.height, boxes: groups.filter(g => g.y1 - g.y0 > 40).map(g => ({ x: g.x0, y: g.y0, w: g.len, h: g.y1 - g.y0 + 1 })) };
    }, src);
    console.log(f, r.w + 'x' + r.h, JSON.stringify(r.boxes));
  }
  await b.close();
})();
