import { create } from 'zustand';

// Akses localStorage selalu dibungkus try/catch (mode privat bisa melempar error)
export const storage = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* abaikan */ }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch { /* abaikan */ }
  }
};

export const useAuth = create(set => ({
  token: storage.get('absen_token'),
  officer: storage.get('absen_officer'),
  login(token, officer) {
    storage.set('absen_token', token);
    storage.set('absen_officer', officer);
    set({ token, officer });
  },
  setOfficer(officer) {
    storage.set('absen_officer', officer);
    set({ officer });
  },
  logout() {
    storage.remove('absen_token');
    storage.remove('absen_officer');
    set({ token: null, officer: null });
  }
}));

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1916' : '#f4f1ee');
}

const initialTheme = storage.get('absen_theme', 'light');
applyTheme(initialTheme);

export const useTheme = create(set => ({
  theme: initialTheme,
  toggle: () => set(s => {
    const theme = s.theme === 'dark' ? 'light' : 'dark';
    storage.set('absen_theme', theme);
    applyTheme(theme);
    return { theme };
  })
}));
