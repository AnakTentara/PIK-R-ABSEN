import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Dev: API diteruskan ke backend utama PIK-R MANSEKU (port 25552).
// HTTPS self-signed dipakai karena kamera HP hanya bisa diakses dari halaman HTTPS
// (matikan dengan VITE_HTTPS=0).
const https = process.env.VITE_HTTPS !== '0';
// Target API (default backend utama). Bisa diarahkan ke backend uji lewat VITE_PROXY_TARGET.
const API = process.env.VITE_PROXY_TARGET || 'http://localhost:25552';

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['lucide-react', 'react-hot-toast', 'zustand'],
          'vendor-axios': ['axios']
        }
      }
    }
  },
  server: {
    port: 25554,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': API,
      '/uploads': API
    }
  }
});
