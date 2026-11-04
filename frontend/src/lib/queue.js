import { create } from 'zustand';
import api from './api.js';
import { storage } from './store.js';

/**
 * Antrean offline: absen yang gagal terkirim karena sinyal disimpan di HP,
 * lalu dikirim ulang otomatis. clientId unik mencegah data dobel di server.
 */
const KEY = 'absen_queue';

export const newClientId = () =>
  (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const useQueue = create((set, get) => ({
  items: storage.get(KEY, []),
  flushing: false,

  push(payload) {
    const items = [...get().items, payload];
    storage.set(KEY, items);
    set({ items });
  },

  async flush() {
    if (get().flushing || !get().items.length || !navigator.onLine) return;
    set({ flushing: true });
    const left = [];
    for (const item of get().items) {
      try {
        await api.post('/records', item);
      } catch (err) {
        // Error validasi (4xx) dibuang supaya tidak macet selamanya; error jaringan diulang
        if (!err.response || err.response.status >= 500) left.push(item);
      }
    }
    storage.set(KEY, left);
    set({ items: left, flushing: false });
  }
}));

/**
 * Kirim absensi. Kalau gagal karena jaringan, masuk antrean dan dianggap terkirim.
 * Mengembalikan { record, queued }.
 */
export async function submitRecord(payload) {
  const body = { clientId: newClientId(), ...payload };
  try {
    const { data } = await api.post('/records', body);
    return { record: data.record, queued: false };
  } catch (err) {
    if (err.response) throw err;
    useQueue.getState().push(body);
    return { record: null, queued: true };
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useQueue.getState().flush());
  setInterval(() => useQueue.getState().flush(), 30000);
}
