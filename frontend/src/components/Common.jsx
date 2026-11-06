import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, LogOut, Thermometer, FileText, UserX, Minus } from 'lucide-react';
import { photoUrl } from '../lib/api.js';
import { onBack } from '../lib/back.js';

export const Avatar = memo(function Avatar({ name, photo, size = 56 }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const src = photoUrl(photo);
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img className="avatar" src={src} alt={name} width={size} height={size} style={{ width: size, height: size }}
        loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-label={name}>{initials}</div>;
});

/**
 * Bottom sheet dengan animasi masuk (pegas) dan keluar (meluncur turun).
 * Klik latar / Escape / tombol Kembali di HP menutup. `onClose` dipanggil SETELAH animasi keluar selesai,
 * jadi perilaku pemanggil tidak berubah (hanya terasa lebih halus).
 */
export function Sheet({ children, onClose, top = false, title }) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);

  const close = useCallback(() => {
    if (closing) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { onClose?.(); return; }
    setClosing(true);
    timer.current = setTimeout(() => onClose?.(), 220);
  }, [closing, onClose]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Kembali di HP menutup popup ini dulu (popup paling atas didaftarkan terakhir)
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => onBack(() => { closeRef.current(); return true; }, 10), []);

  return (
    <div className={`overlay${top ? ' top' : ''}${closing ? ' closing' : ''}`} onClick={e => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
        <div className="grab" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={close} aria-label="Tutup"><X size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export const STATUS_LABEL = { HADIR: 'Hadir', SAKIT: 'Sakit', IZIN: 'Izin', ALFA: 'Alfa' };
const STATUS_ICON = { HADIR: Check, OUT: LogOut, SAKIT: Thermometer, IZIN: FileText, ALFA: UserX };

/** Badge status kecil di kartu anggota: ikon + teks (tidak hanya warna), centang tergambar saat muncul. */
export const StatusBadge = memo(function StatusBadge({ record, inline = false }) {
  const style = inline ? { position: 'static' } : undefined;
  if (!record) return null;
  const key = record.status === 'HADIR' && record.checkOut ? 'OUT' : record.status;
  const label = key === 'OUT' ? 'Pulang' : STATUS_LABEL[record.status];
  const Icon = STATUS_ICON[key];
  const cls = key === 'OUT' ? 'b-OUT' : `b-${record.status}`;
  return (
    // key = status: saat status berubah, badge dibuat ulang sehingga animasi pop + centang diputar lagi
    <span key={key} className={`badge ${cls}`} style={style}>
      {key === 'HADIR'
        ? <svg className="tick" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
        : <Icon size={11} strokeWidth={3} aria-hidden="true" />}
      {label}
    </span>
  );
});

/** Teks yang "menggulung" naik setiap kali nilainya berubah (efek odometer). */
export function Roll({ value }) {
  return <span className="roll"><span key={value}>{value}</span></span>;
}

/** Badge kosong ("—") untuk baris riwayat yang belum diisi. */
export function EmptyBadge() {
  return <span className="badge b-OUT" style={{ position: 'static' }}><Minus size={11} strokeWidth={3} aria-hidden="true" />Kosong</span>;
}

/** Placeholder berkilau selagi data dimuat. */
export function MemberSkeleton({ count = 6 }) {
  return (
    <div className="skeleton-grid" aria-busy="true" aria-label="Memuat anggota">
      {Array.from({ length: count }, (_, i) => <div className="skeleton" key={i} />)}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => (
        <div className="list-row" key={i}>
          <div className="sk" style={{ width: 40, height: 40, borderRadius: '50%', margin: 0 }} />
          <div className="grow"><div className="sk" style={{ width: '60%' }} /><div className="sk" style={{ width: '40%', height: 12 }} /></div>
        </div>
      ))}
    </div>
  );
}
