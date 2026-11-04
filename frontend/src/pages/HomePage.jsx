import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sun, Moon, LogOut, History, ScanLine, Users, Keyboard, Loader2, UsersRound, Zap, Pencil } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { useTheme, useAuth, storage } from '../lib/store.js';
import { useQueue } from '../lib/queue.js';
import { feedback } from '../lib/feedback.js';
import { burst } from '../lib/confetti.js';
import { nowWibDate, longDate } from '../lib/time.js';
import Scanner from '../components/Scanner.jsx';
import ScanPopup from '../components/ScanPopup.jsx';
import KeteranganSheet from '../components/KeteranganSheet.jsx';
import NewSessionSheet from '../components/NewSessionSheet.jsx';
import { Avatar, StatusBadge, MemberSkeleton } from '../components/Common.jsx';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const TYPE_LABEL = { PERTEMUAN: 'Pertemuan', WAJIB: 'Wajib', TAMBAHAN: 'Tambahan' };

export function Header({ title = 'Administrasi PIK-R', sub, compact = false }) {
  const { theme, toggle } = useTheme();
  const logout = useAuth(s => s.logout);
  const [spin, setSpin] = useState(false);
  const onToggle = e => {
    feedback.pop();
    setSpin(false);
    requestAnimationFrame(() => setSpin(true));
    // Tema berganti lewat View Transition (pudar halus) bila browser mendukung
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => toggle());
    } else {
      toggle();
    }
  };
  return (
    <header className={`header${compact ? ' compact' : ''}`}>
      <div className="header-title">
        {title}
        {sub && <small>{sub}</small>}
      </div>
      <button className={`icon-btn theme-btn${spin ? ' spin-once' : ''}`} onClick={onToggle} aria-label="Ganti tema" onAnimationEnd={() => setSpin(false)}>
        {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
      </button>
      <button type="button" className="icon-btn" aria-label="Keluar" onClick={() => { if (window.confirm('Keluar dari aplikasi absen?')) logout(); }}><LogOut size={19} /></button>
      <Link to="/history" className="pill-btn" aria-label="History"><History size={18} /><span className="pill-label">History</span></Link>
    </header>
  );
}

// Kartu anggota di-memo: memilih satu kartu tidak menggambar ulang puluhan kartu lain
const MemberCard = memo(function MemberCard({ m, index, selected, onSelect }) {
  return (
    <button type="button" className={`mcard${selected ? ' sel' : ''}`} style={{ '--i': index }}
      aria-pressed={selected} onClick={() => onSelect(m.id)}>
      <StatusBadge record={m.record} />
      <Avatar name={m.name} photo={m.photoPath} size={54} />
      <span className="nm">{m.name}</span>
      <span className="cl">{m.className}</span>
    </button>
  );
});

const QUICK_TEXT = {
  IN: { cls: 'in', title: 'Absen masuk', icon: 'in' },
  OUT: { cls: 'out', title: 'Absen keluar', icon: 'out' },
  DONE: { cls: 'done', title: 'Sudah masuk & keluar' },
  DUPLICATE: { cls: 'dup', title: 'Barusan terscan' }
};

/** Hasil scan Mode Cepat: kartu kecil di bawah kamera, berganti tiap scan. */
function QuickResult({ r }) {
  if (!r) return <div className="quick-result idle" aria-hidden="true" />;
  const t = QUICK_TEXT[r.result] || QUICK_TEXT.DONE;
  const time = r.result === 'DONE' ? `${r.checkIn || '-'} → ${r.checkOut || '-'}` : r.time;
  return (
    <div key={r.at} className={`quick-result ${t.cls}`} role="status" aria-live="polite">
      <Avatar name={r.member.name} photo={r.member.photoPath} size={44} />
      <div className="qr-txt">
        <b>{r.member.name}</b>
        <span>{t.title}{time ? ` · ${time}` : ''}{r.previous ? ` (tadinya ${r.previous.toLowerCase()})` : ''}</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [slide, setSlide] = useState(0);
  const slidesRef = useRef(null);
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);
  const pending = useQueue(s => s.items.length);
  const [quick, setQuick] = useState(() => storage.get('absen_quick', false) === true);
  const [quickResult, setQuickResult] = useState(null);
  const quickTimer = useRef(null);

  const [data, setData] = useState(null);
  const [letter, setLetter] = useState('A');
  const pagesRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [sheet, setSheet] = useState(null); // null | 'IN' | 'KET'
  const today = nowWibDate();
  const [todayInfo, setTodayInfo] = useState(null);
  const [askSession, setAskSession] = useState(false);
  const [compact, setCompact] = useState(false);
  const session = todayInfo?.session || null;

  const loadToday = useCallback(async () => {
    try {
      const { data } = await api.get('/session/today');
      setTodayInfo(data);
      if (!data.session) setAskSession(true);
    } catch (err) {
      toast.error(errMsg(err, 'Gagal memuat kegiatan hari ini'));
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get('/members', { params: { date: today } });
      setData(data);
    } catch (err) {
      toast.error(errMsg(err, 'Gagal memuat anggota'));
    }
  }, [today]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Huruf yang punya anggota
  const available = useMemo(() => LETTERS.filter(l => data?.groups[l]?.length), [data]);
  useEffect(() => {
    if (available.length && !available.includes(letter)) setLetter(available[0]);
  }, [available, letter]);

  // ── Slide utama (scanner | anggota) ─────────────────────
  const goSlide = i => {
    feedback.tap();
    slidesRef.current?.scrollTo({ left: i * slidesRef.current.clientWidth, behavior: 'smooth' });
  };
  const onSlidesScroll = e => {
    const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
    if (i !== slide) setSlide(i);
  };

  // ── Halaman per huruf di dalam box ──────────────────────
  const goLetter = l => {
    feedback.tap();
    setLetter(l);
    const i = available.indexOf(l);
    pagesRef.current?.scrollTo({ left: i * pagesRef.current.clientWidth, behavior: 'smooth' });
  };
  const onPagesScroll = e => {
    const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
    if (available[i] && available[i] !== letter) setLetter(available[i]);
  };
  // Header mengecil begitu daftar anggota digulir ke bawah
  const onPageScroll = e => {
    const y = e.currentTarget.scrollTop;
    if (!compact && y > 48) setCompact(true);
    else if (compact && y < 8) setCompact(false);
  };

  // ── Scan ────────────────────────────────────────────────
  const toggleQuick = () => {
    feedback.pop();
    setQuick(q => { storage.set('absen_quick', !q); return !q; });
    setQuickResult(null);
  };

  // Mode Cepat: hasil scan ditampilkan sebentar di bawah kamera, tanpa popup konfirmasi
  const showQuick = data => {
    const q = data.quick;
    if (q.result === 'IN') feedback.success();
    else if (q.result === 'OUT') feedback.checkout();
    else feedback.pop();
    clearTimeout(quickTimer.current);
    setQuickResult({ member: data.member, ...q, at: Date.now() });
    quickTimer.current = setTimeout(() => setQuickResult(null), 2800);
    if (q.result === 'IN' || q.result === 'OUT') loadMembers();
  };
  useEffect(() => () => clearTimeout(quickTimer.current), []);

  const handleCode = useCallback(async code => {
    if (scanning) return;
    if (!session) { setAskSession(true); return; }
    setScanning(true);
    feedback.scan();
    try {
      const { data } = await api.post('/scan', quick ? { code, quick: true } : { code });
      if (quick && data.quick) showQuick(data); else setScan(data);
    } catch (err) {
      feedback.error();
      toast.error(errMsg(err, 'Kartu tidak dikenali'));
    } finally {
      setScanning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, session, quick, loadMembers]);

  const afterSave = () => {
    setScan(null);
    setSheet(null);
    setSelected(null);
    loadMembers();
    burst();
    setTimeout(() => feedback.sparkle(), 120);
  };

  const onSelect = useCallback(id => {
    feedback.tap();
    setSelected(cur => (cur === id ? null : id));
  }, []);

  const selectedMember = useMemo(() => {
    if (!selected || !data) return null;
    return Object.values(data.groups).flat().find(m => m.id === selected) || null;
  }, [selected, data]);

  return (
    <div className="app">
      <Header compact={compact} sub={session ? `${TYPE_LABEL[session.type] || 'Kegiatan'} · ${session.title}` : longDate(today)} />
      {todayInfo && !session && (
        <button className="offline-bar" style={{ border: 0, width: 'calc(100% - 32px)' }} onClick={() => setAskSession(true)}>
          Belum ada kegiatan hari ini. Ketuk untuk membuat kegiatan baru.
        </button>
      )}
      {pending > 0 && <div className="offline-bar">{pending} absen menunggu dikirim (offline)</div>}

      <div className="tabs" role="tablist" style={{ '--i': slide }}>
        <button role="tab" aria-selected={slide === 0} className={slide === 0 ? 'on' : ''} onClick={() => goSlide(0)}><ScanLine size={16} />Scan Kartu</button>
        <button role="tab" aria-selected={slide === 1} className={slide === 1 ? 'on' : ''} onClick={() => goSlide(1)}><Users size={16} />Daftar Anggota</button>
      </div>

      <div className="slides" ref={slidesRef} onScroll={onSlidesScroll}>
        {/* Slide 1: Scanner */}
        <section className="slide">
          <div className="scanner-wrap">
            <button type="button" className={`quick-toggle${quick ? ' on' : ''}`} role="switch" aria-checked={quick} onClick={toggleQuick}>
              <span className="qt-ico"><Zap size={18} /></span>
              <span className="qt-txt"><b>Mode Cepat</b><small>{quick ? 'Scan langsung tercatat, tanpa konfirmasi' : 'Ketuk untuk absen tanpa konfirmasi'}</small></span>
              <span className="qt-sw" aria-hidden="true"><i /></span>
            </button>
            {/* Kamera hanya aktif saat slide scanner terlihat (hemat baterai) */}
            {slide === 0 ? <Scanner onCode={handleCode} paused={!!scan || scanning} /> : <div className="scanner" />}
            <p className="scan-hint" aria-live="polite">
              {scanning ? <><Loader2 size={14} className="spin" /> {quick ? 'Mencatat…' : 'Memeriksa kartu…'}</> : 'Arahkan barcode ID Card ke dalam kotak'}
            </p>
            {quick && <QuickResult r={quickResult} />}
            {showManual ? (
              <form className="manual-code" onSubmit={e => { e.preventDefault(); if (manual.trim()) handleCode(manual.trim()); }}>
                <input className="field" value={manual} onChange={e => setManual(e.target.value)} placeholder="Ketik kode / nama-di-kartu" autoFocus aria-label="Kode kartu" />
                <button className="cbtn c-accent" style={{ width: 70 }} type="submit">Cek</button>
              </form>
            ) : (
              <button className="link-btn" onClick={() => setShowManual(true)}>
                <Keyboard size={14} style={{ verticalAlign: -2 }} /> Barcode rusak? Ketik kode
              </button>
            )}
          </div>
          {quick && (
            <button type="button" className="cbtn c-orange quick-correct" onClick={() => goSlide(1)}>
              <Pencil size={20} /> Koreksi Absen
            </button>
          )}
        </section>

        {/* Slide 2: Daftar anggota per huruf */}
        <section className="slide">
          <div className="letters">
            {LETTERS.map(l => (
              <button key={l} className={l === letter ? 'on' : ''} disabled={!available.includes(l)} onClick={() => goLetter(l)} aria-label={`Huruf ${l}`}>{l}</button>
            ))}
          </div>

          <div className="member-box">
            {!data ? (
              <MemberSkeleton />
            ) : !available.length ? (
              <div className="empty">
                <div className="empty-ico"><UsersRound size={30} /></div>
                Belum ada anggota aktif.
              </div>
            ) : (
              <div className="letter-pages" ref={pagesRef} onScroll={onPagesScroll}>
                {available.map(l => (
                  <div className="letter-page" key={l} onScroll={onPageScroll}>
                    <h3>{l}</h3>
                    <div className="grid">
                      {data.groups[l].map((m, i) => (
                        <MemberCard key={m.id} m={m} index={i} selected={selected === m.id} onSelect={onSelect} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bottom-actions">
            <button className="cbtn c-orange" disabled={!selectedMember || !session} onClick={() => setSheet('KET')}>
              <span className="long">Keterangan Lain</span><span className="short">Ktrgn Lain</span>
            </button>
            <button className="cbtn c-green" disabled={!selectedMember || !session} onClick={() => setSheet('IN')}>
              <span className="long">Absen Masuk</span><span className="short">Absn Msk</span>
            </button>
          </div>
        </section>
      </div>

      {askSession && todayInfo && !session && (
        <NewSessionSheet
          info={todayInfo}
          onClose={() => setAskSession(false)}
          onCreated={s => { setTodayInfo({ ...todayInfo, session: s }); setAskSession(false); loadMembers(); }}
        />
      )}
      {scan && <ScanPopup scan={scan} onClose={() => setScan(null)} onSaved={afterSave} />}
      {sheet && selectedMember && (
        <KeteranganSheet
          member={selectedMember}
          date={today}
          isToday
          initial={sheet === 'IN' ? 'IN' : null}
          onClose={() => setSheet(null)}
          onSaved={afterSave}
        />
      )}
    </div>
  );
}
