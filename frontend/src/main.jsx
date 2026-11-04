import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './styles.css';
import { useAuth } from './lib/store.js';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';

// History (jsPDF, tabel) dimuat hanya saat dibuka: halaman scan tetap ringan
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'));

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
  if (!token) return <LoginPage />;
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-center" gutter={10} toastOptions={{
        className: 'clay-toast',
        duration: 2600,
        success: { iconTheme: { primary: '#15803d', secondary: '#fff' } },
        error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } }
      }} />
    </BrowserRouter>
  </React.StrictMode>
);
