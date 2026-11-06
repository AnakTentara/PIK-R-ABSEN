import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Sun, Moon, LogOut, History, ScanLine, Users, Keyboard, Loader2, UsersRound, Zap, Pencil, Search, X, ChevronLeft, ChevronRight, CalendarPlus, SearchX } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { useTheme, useAuth, useView, storage } from '../lib/store.js';
import { onBack } from '../lib/back.js';
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
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Pencarian: abaikan huruf besar/kecil, aksen, spasi, dan urutan kata
const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokensOf = q => norm(q).split(/\s+/).filter(Boolean);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Nama dengan bagian yang cocok dengan pencarian disorot. */
function Highlight({ text, tokens }) {
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.map(escapeRe).join('|')})`, 'gi');
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
}

export function Header({ title = 'Administrasi PIK-R', sub, compact = false }) {
  const { theme, toggle } = useTheme();
  const logout = useAuth(s => s.logout);
  const go = useView(s => s.go);
  const [spin, setSpin] = useState(false);
  const onToggle = () => {
    feedback.pop();
    setSpin(false);
    requestAnimationFrame(() => setSpin(true));
    // Tema berganti lewat View Transition (pudar halus) bila browser mendukung
    if (document.startViewTransition && !reduceMotion()) {
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
      <button type="button" className="pill-btn" aria-label="History" onClick={() => { feedback.tap(); go('history'); }}><History size={18} /><span className="pill-label">History</span></button>
    </header>
  );
}

// Kartu anggota di-memo: memilih satu kartu tidak menggambar ulang puluhan kartu lain.
// Hanya belasan kartu pertama yang diberi animasi masuk (sisanya langsung tampil, lebih ringan).
const MemberCard = memo(function MemberCard({ m, index, selected, onSelect, tokens }) {
  return (
    <button type="button" className={`mcard${selected ? ' sel' : ''}${index < 12 ? ' anim' : ''}`} style={{ '--i': index }}
      aria-pressed={selected} onClick={() => onSelect(m.id)}>
      <StatusBadge record={m.record} />
      <Avatar name={m.name} photo={m.photoPath} size={54} />
      <span className="nm">{tokens ? <Highlight text={m.name} tokens={tokens} /> : m.name}</span>
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

/** Kolom cari anggota: nama, kelas, atau kode kartu. */
function SearchBar({ value, onChange }) {
  const ref = useRef(null);
  return (
    <div className={`search${value ? ' has' : ''}`}>
      <Search size={18} aria-hidden="true" />
      <input ref={ref} type="search" className="search-input" value={value} enterKeyHint="search"
        placeholder="Cari nama, kelas, atau kode kartu" aria-label="Cari anggota"
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      {value && (
        <button type="button" className="search-clear" aria-label="Hapus pencarian"
          onClick={() => { feedback.tap(); onChange(''); ref.current?.focus(); }}>
          <X size={16} />
        </button>
      )}
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
  const [entering, setEntering] = useState(null); // { l, dir } halaman yang baru dituju lewat tombol
  const pagesRef = useRef(null);
  const lettersRef = useRef(null);
  const jump = useRef(null); // huruf tujuan saat halaman digulir lewat tombol
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
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

  // Popup "Kegiatan Baru" dibuka sendiri sekali, SETELAH kamera dan daftar anggota selesai dimuat.
  // Dulu ia muncul bersamaan dengan keduanya, itulah sumber patah-patah saat aplikasi dibuka.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !todayInfo || todayInfo.session || !data) return undefined;
    asked.current = true;
    const t = setTimeout(() => setAskSession(true), 600);
    return () => clearTimeout(t);
  }, [todayInfo, data]);

  // Huruf yang punya anggota
  const available = useMemo(() => LETTERS.filter(l => data?.groups[l]?.length), [data]);
  useEffect(() => {
    if (available.length && !available.includes(letter)) setLetter(available[0]);
  }, [available, letter]);
  const letterIndex = available.indexOf(letter);

  // ── Pencarian ───────────────────────────────────────────
  const searchIndex = useMemo(() => (data ? Object.values(data.groups).flat() : []).map(m => ({
    m,
    hay: norm(`${m.name} ${m.className || ''} ${m.jabatan || ''} ${m.memberCode || ''}`),
    code: norm(m.memberCode).replace(/[^a-z0-9]/g, '')
  })), [data]);
  const tokens = useMemo(() => tokensOf(deferredQuery), [deferredQuery]);
  const results = useMemo(() => {
    if (!tokens.length) return null;
    return searchIndex
      .filter(({ hay, code }) => tokens.every(t => hay.includes(t) || (t.length > 2 && code.includes(t.replace(/[^a-z0-9]/g, '')))))
      .map(x => x.m)
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [searchIndex, tokens]);
  // Tidak ada pilihan otomatis; pilihan yang tidak lagi terlihat dilepas supaya tombol bawah tidak menyasar
  useEffect(() => {
    if (results && selected && !results.some(m => m.id === selected)) setSelected(null);
  }, [results, selected]);

  // ── Slide utama (scanner | anggota) ─────────────────────
  const goSlide = useCallback(i => {
    feedback.tap();
    const el = slidesRef.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, []);
  const onSlidesScroll = e => {
    const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
    if (i !== slide) setSlide(i);
  };
  // Kembali di HP saat di Daftar Anggota: pindah ke Scan Kartu
  useEffect(() => (slide === 1 ? onBack(() => { goSlide(0); return true; }) : undefined), [slide, goSlide]);

  // ── Halaman per huruf ───────────────────────────────────
  // Huruf bersebelahan: digeser halus. Huruf jauh: langsung ke halamannya dengan animasi masuk pendek,
  // TANPA melewati halaman di antaranya (dulu tiap halaman yang dilewati ikut menyalakan tombol hurufnya
  // sesaat, itulah kedip-kedip di tombol huruf).
  const goLetter = useCallback((l, { silent = false } = {}) => {
    const el = pagesRef.current;
    const to = available.indexOf(l);
    if (!el || to < 0) return;
    if (!silent) feedback.tap();
    const from = Math.round(el.scrollLeft / el.clientWidth);
    setLetter(l);
    if (to === from) return;
    jump.current = l;
    const near = Math.abs(to - from) === 1 && !reduceMotion();
    el.scrollTo({ left: to * el.clientWidth, behavior: near ? 'smooth' : 'auto' });
    if (!near && !reduceMotion()) setEntering({ l, dir: to > from ? 1 : -1, at: Date.now() });
  }, [available]);
  const stepLetter = d => {
    const l = available[letterIndex + d];
    if (l) goLetter(l);
  };
  const onPagesScroll = e => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (jump.current) {
      // Abaikan posisi antara selama berpindah lewat tombol; selesai saat halaman tujuan tercapai
      if (available[i] === jump.current && Math.abs(el.scrollLeft - i * el.clientWidth) < 2) jump.current = null;
      return;
    }
    if (available[i] && available[i] !== letter) setLetter(available[i]);
  };
  // Pengaman: bila browser tidak mengirim scroll terakhir, lepaskan kunci perpindahan
  useEffect(() => {
    if (!jump.current) return undefined;
    const t = setTimeout(() => { jump.current = null; }, 700);
    return () => clearTimeout(t);
  }, [letter]);

  // Tombol huruf: indikator bergeser ke huruf aktif, dan baris huruf ikut menggulir supaya terlihat
  const [ind, setInd] = useState(null);
  useEffect(() => {
    const strip = lettersRef.current;
    const btn = strip?.querySelector(`[data-l="${letter}"]`);
    if (!btn) return;
    setInd({ x: btn.offsetLeft, w: btn.offsetWidth });
    const left = btn.offsetLeft - (strip.clientWidth - btn.offsetWidth) / 2;
    strip.scrollTo({ left, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [letter, available, slide]);

  // Selesai mencari: halaman huruf dipasang ulang, langsung kembali ke huruf terakhir (tanpa animasi)
  const searching = !!results;
  useLayoutEffect(() => {
    const el = pagesRef.current;
    const i = available.indexOf(letter);
    if (!searching && el && i > 0) el.scrollLeft = i * el.clientWidth;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, data]);

  // Header mengecil begitu daftar anggota digulir ke bawah
  const onPageScroll = e => {
    const y = e.currentTarget.scrollTop;
    if (!compact && y > 48) setCompact(true);
    else if (compact && y < 8) setCompact(false);
  };
  // Kartu bergerak masuk hanya di halaman pertama yang terlihat, sekali
  const animLetter = useRef(null);
  if (data && animLetter.current === null) animLetter.current = available[0] || '';

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

  const popupOpen = !!scan || !!sheet || askSession;

  return (
    <div className="app">
      <Header compact={compact} sub={session ? `${TYPE_LABEL[session.type] || 'Kegiatan'} · ${session.title}` : longDate(today)} />
      {todayInfo && !session && (
        <div className="no-session" role="status">
          <span>Belum ada kegiatan hari ini.</span>
          <button type="button" className="mini-btn" onClick={() => { feedback.tap(); setAskSession(true); }}>
            <CalendarPlus size={15} /> Buat Kegiatan
          </button>
        </div>
      )}
      {pending > 0 && <div className="offline-bar">{pending} absen menunggu dikirim (offline)</div>}

      <div className="tabs" role="tablist" style={{ '--i': slide }}>
        <button role="tab" aria-selected={slide === 0} className={slide === 0 ? 'on' : ''} onClick={() => goSlide(0)}><ScanLine size={16} />Scan Kartu</button>
        <button role="tab" aria-selected={slide === 1} className={slide === 1 ? 'on' : ''} onClick={() => goSlide(1)}><Users size={16} />Daftar Anggota</button>
      </div>

      <div className="slides" ref={slidesRef} onScroll={onSlidesScroll}>
        {/* Slide 1: Scanner */}
        <section className={`slide scan-slide${quick ? ' quick' : ''}`}>
          <div className="scanner-wrap">
            <button type="button" className={`quick-toggle${quick ? ' on' : ''}`} role="switch" aria-checked={quick} onClick={toggleQuick}>
              <span className="qt-ico"><Zap size={18} /></span>
              <span className="qt-txt"><b>Mode Cepat</b><small>{quick ? 'Scan langsung tercatat, tanpa konfirmasi' : 'Ketuk untuk absen tanpa konfirmasi'}</small></span>
              <span className="qt-sw" aria-hidden="true"><i /></span>
            </button>
            {/* Kamera hanya aktif saat slide scanner terlihat (hemat baterai) */}
            {slide === 0 ? <Scanner onCode={handleCode} paused={popupOpen || scanning} /> : <div className="scanner" />}
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

        {/* Slide 2: Daftar anggota per huruf + pencarian */}
        <section className="slide">
          <SearchBar value={query} onChange={setQuery} />

          {!results && (
            <div className="letter-nav">
              <button type="button" className="step-btn" aria-label="Huruf sebelumnya" disabled={letterIndex <= 0} onClick={() => stepLetter(-1)}><ChevronLeft size={18} /></button>
              <div className="letters" ref={lettersRef}>
                {ind && <span className="letters-ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} aria-hidden="true" />}
                {LETTERS.map(l => (
                  <button key={l} data-l={l} className={l === letter ? 'on' : ''} disabled={!available.includes(l)} onClick={() => goLetter(l)} aria-label={`Huruf ${l}`} aria-pressed={l === letter}>{l}</button>
                ))}
              </div>
              <button type="button" className="step-btn" aria-label="Huruf berikutnya" disabled={letterIndex < 0 || letterIndex >= available.length - 1} onClick={() => stepLetter(1)}><ChevronRight size={18} /></button>
            </div>
          )}

          <div className="member-box">
            {!data ? (
              <MemberSkeleton />
            ) : results ? (
              <div className="letter-page search-page" onScroll={onPageScroll}>
                <div className="search-count">{results.length ? `${results.length} anggota cocok` : ''}</div>
                {results.length ? (
                  <div className="grid">
                    {results.map((m, i) => (
                      <MemberCard key={m.id} m={m} index={i} selected={selected === m.id} onSelect={onSelect} tokens={tokens} />
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <div className="empty-ico"><SearchX size={30} /></div>
                    Tidak ada anggota yang cocok dengan “{deferredQuery.trim()}”.
                  </div>
                )}
              </div>
            ) : !available.length ? (
              <div className="empty">
                <div className="empty-ico"><UsersRound size={30} /></div>
                Belum ada anggota aktif.
              </div>
            ) : (
              <div className="letter-pages" ref={pagesRef} onScroll={onPagesScroll}>
                {available.map(l => (
                  <div className={`letter-page${entering?.l === l ? (entering.dir > 0 ? ' enter-r' : ' enter-l') : ''}`} key={l}
                    onScroll={onPageScroll} onAnimationEnd={e => { if (e.target === e.currentTarget) setEntering(null); }}>
                    <h3>{l}</h3>
                    <div className="grid">
                      {data.groups[l].map((m, i) => (
                        <MemberCard key={m.id} m={m} index={animLetter.current === l ? i : 99} selected={selected === m.id} onSelect={onSelect} />
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
