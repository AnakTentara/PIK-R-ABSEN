import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, CalendarX2 } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { nowWibDate, longDate, shiftDate } from '../lib/time.js';
import { Avatar, STATUS_LABEL, StatusBadge, EmptyBadge, ListSkeleton } from '../components/Common.jsx';
import KeteranganSheet from '../components/KeteranganSheet.jsx';

const FILTERS = ['SEMUA', 'HADIR', 'SAKIT', 'IZIN', 'ALFA', 'KOSONG'];
const FILTER_LABEL = { SEMUA: 'Semua', KOSONG: 'Belum diisi' };

/**
 * Rekap kehadiran.
 * Mode Harian: daftar per anggota untuk 1 tanggal (bisa dikoreksi dengan mengetuk baris).
 * Mode Rentang: ringkasan jumlah Hadir/Sakit/Izin/Alfa per anggota.
 */
export default function HistoryPage() {
  const nav = useNavigate();
  const today = nowWibDate();
  const [mode, setMode] = useState('day'); // day | range
  const [date, setDate] = useState(today);
  const [range, setRange] = useState({ from: shiftDate(today, -30), to: today });
  const [filter, setFilter] = useState('SEMUA');
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [exporting, setExporting] = useState('');

  const period = mode === 'day' ? { from: date, to: date } : range;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recap', { params: period });
      setRecap(data);
    } catch (err) {
      toast.error(errMsg(err, 'Gagal memuat rekap'));
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const hasSession = recap?.sessions.length > 0;

  // Baris harian: status hari itu per anggota
  const dayRows = useMemo(() => {
    if (!recap || mode !== 'day') return [];
    return recap.rows
      .map(r => ({ ...r, day: r.days[0] || { status: null } }))
      .filter(r => filter === 'SEMUA' || (filter === 'KOSONG' ? !r.day.status : r.day.status === filter));
  }, [recap, mode, filter, hasSession]);

  const totals = useMemo(() => {
    const t = { HADIR: 0, SAKIT: 0, IZIN: 0, ALFA: 0 };
    recap?.rows.forEach(r => Object.keys(t).forEach(k => { t[k] += r.counts[k]; }));
    return t;
  }, [recap]);

  const rangeRows = useMemo(() => {
    if (!recap || mode !== 'range') return [];
    return filter === 'SEMUA' || filter === 'KOSONG' ? recap.rows : recap.rows.filter(r => r.counts[filter] > 0)
      .sort((a, b) => b.counts[filter] - a.counts[filter]);
  }, [recap, mode, filter]);

  async function exportExcel() {
    setExporting('xlsx');
    try {
      const res = await api.get('/recap/excel', { params: period, responseType: 'blob' });
      downloadBlob(res.data, `Rekap_Absensi_PIKR_${period.from}_${period.to}.xlsx`);
    } catch (err) {
      toast.error(errMsg(err, 'Gagal export Excel'));
    } finally {
      setExporting('');
    }
  }

  async function exportPdf() {
    if (!recap) return;
    setExporting('pdf');
    try {
      // Dimuat hanya saat dibutuhkan supaya halaman utama tetap ringan
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: mode === 'day' ? 'portrait' : 'landscape' });
      doc.setFontSize(15);
      doc.setTextColor(194, 65, 12);
      doc.text('REKAP KEHADIRAN PIK-R MANSEKU', 14, 16);
      doc.setFontSize(10);
      doc.setTextColor(80);
      doc.text(mode === 'day' ? longDate(date) : `Periode ${range.from} s/d ${range.to} • ${recap.sessions.length} kegiatan`, 14, 23);

      const head = mode === 'day'
        ? [['No', 'Nama', 'Kelas', 'Status', 'Masuk', 'Keluar', 'Keterangan']]
        : [['No', 'Nama', 'Kelas', 'Jabatan', 'Hadir', 'Sakit', 'Izin', 'Alfa', '% Hadir']];
      const body = mode === 'day'
        ? recap.rows.map((r, i) => {
            const d = r.days[0] || {};
            return [i + 1, r.name, r.className, d.status ? STATUS_LABEL[d.status] : '-', d.checkIn || '-', d.checkOut || '-', d.note || ''];
          })
        : recap.rows.map((r, i) => {
            const total = r.counts.HADIR + r.counts.SAKIT + r.counts.IZIN + r.counts.ALFA;
            return [i + 1, r.name, r.className, r.jabatan, r.counts.HADIR, r.counts.SAKIT, r.counts.IZIN, r.counts.ALFA,
              total ? `${Math.round((r.counts.HADIR / total) * 100)}%` : '-'];
          });

      autoTable(doc, {
        head, body, startY: 28,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [249, 115, 22] },
        alternateRowStyles: { fillColor: [255, 247, 237] }
      });
      doc.save(`Rekap_Absensi_PIKR_${period.from}_${period.to}.pdf`);
    } catch (err) {
      toast.error('Gagal membuat PDF');
    } finally {
      setExporting('');
    }
  }

  return (
    <div className="app">
      <header className="header">
        <button className="icon-btn" onClick={() => nav('/')} aria-label="Kembali"><ArrowLeft size={19} /></button>
        <div className="header-title">History<small>Rekap daftar hadir</small></div>
      </header>

      <div className="tabs" style={{ '--i': mode === 'day' ? 0 : 1 }}>
        <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Harian</button>
        <button className={mode === 'range' ? 'on' : ''} onClick={() => setMode('range')}>Rentang Tanggal</button>
      </div>

      <div className="page">
        <div className="card stack" style={{ '--i': 0 }}>
          {mode === 'day' ? (
            <div className="row">
              <button className="icon-btn" onClick={() => setDate(shiftDate(date, -1))} aria-label="Hari sebelumnya"><ChevronLeft size={18} /></button>
              <input type="date" className="field" style={{ flex: 1, textAlign: 'center' }} value={date} max={today}
                onChange={e => e.target.value && setDate(e.target.value)} />
              <button className="icon-btn" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))} aria-label="Hari berikutnya"><ChevronRight size={18} /></button>
            </div>
          ) : (
            <div className="row">
              <input type="date" className="field" value={range.from} max={range.to} onChange={e => e.target.value && setRange({ ...range, from: e.target.value })} />
              <span className="muted">s/d</span>
              <input type="date" className="field" value={range.to} max={today} onChange={e => e.target.value && setRange({ ...range, to: e.target.value })} />
            </div>
          )}
          <div className="muted" style={{ textAlign: 'center' }}>
            {mode === 'day'
              ? (recap?.sessions[0] ? `${{ PERTEMUAN: 'Pertemuan', WAJIB: 'Wajib', TAMBAHAN: 'Tambahan' }[recap.sessions[0].type] || 'Kegiatan'} · ${recap.sessions[0].title}` : longDate(date))
              : `${recap?.sessions.length ?? 0} kegiatan`}
          </div>
          <div className="stat-row">
            {Object.entries(totals).map(([k, v]) => (
              <div key={k} className={`stat ${k}`}><b>{v}</b><span>{STATUS_LABEL[k]}</span></div>
            ))}
          </div>
          <div className="row">
            <button className="cbtn c-green" style={{ flex: 1, height: 48 }} disabled={!hasSession || !!exporting} onClick={exportExcel}>
              {exporting === 'xlsx' ? <Loader2 className="spin" size={18} /> : <FileSpreadsheet size={18} />} Excel
            </button>
            <button className="cbtn c-red" style={{ flex: 1, height: 48 }} disabled={!hasSession || !!exporting} onClick={exportPdf}>
              {exporting === 'pdf' ? <Loader2 className="spin" size={18} /> : <FileText size={18} />} PDF
            </button>
          </div>
        </div>

        <div className="filters">
          {FILTERS.map(f => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f] || STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        <div className="card" style={{ '--i': 1 }}>
          {loading && !recap ? (
            <ListSkeleton />
          ) : !hasSession ? (
            <div className="empty"><div className="empty-ico"><CalendarX2 size={30} /></div>Tidak ada kegiatan / absensi di {mode === 'day' ? 'tanggal' : 'rentang'} ini.</div>
          ) : mode === 'day' ? (
            dayRows.length ? dayRows.map(r => (
              <button key={r.id} className="list-row" style={{ width: '100%', textAlign: 'left' }}
                onClick={() => setEditing({ ...r, record: r.day.auto ? null : r.day })}>
                <Avatar name={r.name} photo={r.photoPath} size={40} />
                <div className="grow">
                  <div className="nm">{r.name}</div>
                  <div className="muted">
                    {r.day.status === 'HADIR'
                      ? `Masuk ${r.day.checkIn || '-'} · Keluar ${r.day.checkOut || '-'}`
                      : r.day.note || (r.day.auto ? 'Alfa otomatis (kegiatan wajib)' : !r.day.status ? 'Belum diisi, ketuk untuk mengisi' : r.className)}
                  </div>
                </div>
                {r.day.status ? <StatusBadge record={r.day} inline /> : <EmptyBadge />}
              </button>
            )) : <div className="empty">Tidak ada data untuk filter ini.</div>
          ) : (
            rangeRows.map(r => (
              <div key={r.id} className="list-row">
                <Avatar name={r.name} photo={r.photoPath} size={40} />
                <div className="grow">
                  <div className="nm">{r.name}</div>
                  <div className="muted">{r.className} · {r.jabatan}</div>
                </div>
                <div className="muted" style={{ textAlign: 'right', fontWeight: 600 }}>
                  <span style={{ color: 'var(--green-2)' }}>H {r.counts.HADIR}</span>{' '}
                  <span style={{ color: '#ca8a04' }}>S {r.counts.SAKIT}</span>{' '}
                  <span style={{ color: 'var(--blue-2)' }}>I {r.counts.IZIN}</span>{' '}
                  <span style={{ color: 'var(--red-2)' }}>A {r.counts.ALFA}</span>
                </div>
              </div>
            ))
          )}
        </div>
        {mode === 'day' && hasSession && <p className="muted" style={{ textAlign: 'center' }}>Ketuk nama untuk mengoreksi absensi.</p>}
      </div>

      {editing && (
        <KeteranganSheet
          member={editing}
          date={date}
          isToday={date === today}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
