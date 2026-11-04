import axios from 'axios';
import { useAuth } from './store.js';

// Produksi: set VITE_API_URL=https://pikr-manseku.my.id (beda subdomain)
// Dev: kosong, diteruskan oleh proxy Vite
export const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({ baseURL: `${API_BASE}/api/absen`, timeout: 15000 });

api.interceptors.request.use(cfg => {
  const token = useAuth.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res,
  err => {
    // Token kedaluwarsa / hak dicabut -> keluar otomatis
    if (err.response && [401, 403].includes(err.response.status) && useAuth.getState().token
      && !err.config.url.startsWith('/login')) {
      useAuth.getState().logout();
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err, fallback = 'Terjadi kesalahan') =>
  err?.response?.data?.message || (err?.response ? fallback : 'Tidak ada koneksi ke server');

export const photoUrl = path => (!path ? null : /^https?:/.test(path) ? path : `${API_BASE}${path}`);

export default api;
