import React, { Suspense, lazy, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import toast, { Toaster } from 'react-hot-toast';
import './styles.css';
import { useAuth, useView } from './lib/store.js';
import { initBack, onBack } from './lib/back.js';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';

// History (jsPDF, tabel) dimuat hanya saat dibuka: halaman scan tetap ringan
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'));

initBack({
  onExitHint: () => toast('Tekan Kembali sekali lagi untuk keluar', { id: 'exit-hint', duration: 2000, icon: '👋' })
});

const PageFallback = () => (
  <div className="app" aria-busy="true">
    <div className="header"><div className="header-title"><div className="sk" style={{ width: 140, height: 24 }} /></div></div>
    <div className="page">
      <div className="card"><div className="sk" /><div className="sk" style={{ width: '70%' }} /><div className="sk" style={{ width: '85%' }} /></div>
    </div>
  </div>
);

function App() {
  const token = useAuth(s => s.token);
  const { view, go } = useView();

  // Kembali dari History selalu ke Beranda
  useEffect(() => {
    if (view !== 'history') return undefined;
    return onBack(() => { go('home'); return true; });
  }, [view, go]);

  if (!token) return <LoginPage />;
  if (view === 'history') {
    return <Suspense fallback={<PageFallback />}><HistoryPage /></Suspense>;
  }
  return <HomePage />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster position="top-center" gutter={10} toastOptions={{
      className: 'clay-toast',
      duration: 2600,
      success: { iconTheme: { primary: '#15803d', secondary: '#fff' } },
      error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } }
    }} />
  </React.StrictMode>
);
