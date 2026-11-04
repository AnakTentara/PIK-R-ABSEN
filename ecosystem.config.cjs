/**
 * PM2 untuk tes lokal (bisa diakses dari HP di Wi-Fi yang sama).
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs            # lihat log
 *   pm2 stop all        # hentikan
 *
 * Alamat dari HP: ganti LAN_IP sesuai `ipconfig` (Wi-Fi IPv4).
 */
const path = require('path');

const LAN_IP = process.env.LAN_IP || '192.168.1.3';
const MAIN = path.resolve(__dirname, '../PIK-R-MANSEKU');
const ABSEN = path.resolve(__dirname, 'frontend');
const VITE = 'node_modules/vite/bin/vite.js';

module.exports = {
  apps: [
    {
      name: 'pikr-backend',
      cwd: MAIN,
      script: 'src/server.js',
      env: {
        NODE_ENV: 'development',
        PORT: 25552,
        FRONTEND_URL: `http://${LAN_IP}:25551`,
        CORS_EXTRA_ORIGINS: `http://${LAN_IP}:25554,http://localhost:25551,http://localhost:25554`,
        // Bot WA produksi masih berjalan di VPS; jangan dobel login dari laptop
        DISABLE_WHATSAPP: '1'
      },
      autorestart: true,
      max_restarts: 10
    },
    {
      name: 'pikr-web',
      cwd: path.join(MAIN, 'frontend'),
      script: VITE,
      args: '--host 0.0.0.0 --port 25551 --strictPort',
      autorestart: true
    },
    {
      name: 'pikr-absen',
      cwd: ABSEN,
      script: VITE,
      args: '--host 0.0.0.0 --port 25554 --strictPort',
      autorestart: true
    }
  ]
};
