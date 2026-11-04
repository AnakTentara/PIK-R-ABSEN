import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Check, LogIn, LogOut, Thermometer, FileText, UserX } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { submitRecord } from '../lib/queue.js';
import { feedback } from '../lib/feedback.js';
import { nowWibTime, splitTime, pad } from '../lib/time.js';
import { Avatar, Sheet } from './Common.jsx';
import DynamicButtons from './DynamicButtons.jsx';
import { DigitalClock } from './Clocks.jsx';

const ABSENSI = [
  { k: 'IN', label: 'Absen Masuk', icon: LogIn },
  { k: 'OUT', label: 'Absen Keluar', icon: LogOut }
];
const IZIN = [
  { k: 'SAKIT', label: 'Sakit', icon: Thermometer },
  { k: 'IZIN', label: 'Izin', icon: FileText },
  { k: 'ALFA', label: 'Tidak Hadir (Alfa)', icon: UserX }
];

// Warna & label tombol konfirmasi sesuai pilihan
const CONFIRM = {
  IN: { color: 'green', label: 'Absen Masuk' },
  OUT: { color: 'red', label: 'Absen Keluar' },
  SAKIT: { color: 'blue', label: 'Konfirmasi' },
  IZIN: { color: 'blue', label: 'Konfirmasi' },
  ALFA: { color: 'blue', label: 'Konfirmasi' }
};

/** Highlight kata "Izin" di textarea (layer belakang meniru isi teks). */
function HighlightNote({ value, onChange }) {
  const parts = value.split(/(\bizin\b)/gi);
  return (
    <div className="note-wrap">
      <div className="note-bg" />
      <div className="hl" aria-hidden="true">
        {parts.map((p, i) => (/^izin$/i.test(p) ? <mark key={i}>{p}</mark> : p))}
        {'\n'}
      </div>
      <textarea
        className="field"
        style={{ boxShadow: 'none' }}
        rows={3}
        maxLength={500}
        value={value}
        placeholder="Izin ……"
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * Popup "Keterangan Lain" dari daftar anggota.
 * initial: 'IN' bila dibuka dari tombol Absen Masuk, null bila dari Keterangan Lain.
 */
export default function KeteranganSheet({ member, date, isToday, initial = null, onClose, onSaved }) {
  const rec = member.record;
  const [pick, setPick] = useState(initial);
  const [val, setVal] = useState(splitTime(isToday ? nowWibTime() : '07:00'));
  const [note, setNote] = useState(rec?.note || '');
  const [busy, setBusy] = useState(false);
  const canOut = rec?.status === 'HADIR' && !!rec.checkIn;
  const needTime = pick === 'IN' || pick === 'OUT';
  // Yang sudah tercatat (ditandai titik di tombolnya)
  const hasRecord = !!rec?.id;
  const recorded = !rec ? {} : rec.status === 'HADIR' ? { IN: !!rec.checkIn, OUT: !!rec.checkOut } : { [rec.status]: true };

  // Semua pilihan boleh dibatalkan: tanpa pilihan, konfirmasi = mengosongkan absen (kembali "belum diisi")
  async function clearAll() {
    setBusy(true);
    try {
      await api.delete(`/records/${rec.id}`);
      feedback.pop();
      toast.success('Absen dikosongkan');
      onSaved();
    } catch (err) {
      feedback.error();
      toast.error(errMsg(err, 'Gagal mengosongkan absen'));
      setBusy(false);
    }
  }

  async function clearOut() {
    setBusy(true);
    try {
      await api.patch(`/records/${rec.id}`, { checkOut: null });
      feedback.pop();
      toast.success('Jam keluar dikosongkan');
      onSaved();
    } catch (err) {
      feedback.error();
      toast.error(errMsg(err, 'Gagal mengosongkan jam keluar'));
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pick) return clearAll();
    setBusy(true);
    try {
      const { queued } = await submitRecord({
        memberId: member.id,
        action: pick,
        date,
        ...(needTime ? { time: `${pad(val.h)}:${pad(val.m)}` } : {}),
        note: needTime ? undefined : note
      });
      pick === 'OUT' ? feedback.checkout() : feedback.success();
      toast.success(queued ? 'Offline: disimpan di HP, dikirim saat sinyal kembali' : 'Absensi tersimpan');
      onSaved();
    } catch (err) {
      feedback.error();
      toast.error(errMsg(err, 'Gagal menyimpan'));
      setBusy(false);
    }
  }

  const option = ({ k, label, icon: Icon }, disabled = false) => (
    <button key={k} type="button" disabled={disabled}
      className={`opt k-${k}${pick === k ? ' on' : ''}${recorded[k] ? ' rec' : ''}`}
      aria-pressed={pick === k}
      onClick={() => { feedback.pop(); setPick(pick === k ? null : k); }}>
      {recorded[k] && <i className="rec-dot" title="Sudah tercatat" />}
      <Icon size={22} />
      {label}
    </button>
  );

  return (
    <Sheet onClose={onClose}>
      <div className="row" style={{ marginBottom: 16 }}>
        <Avatar name={member.name} photo={member.photoPath} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontFamily: 'var(--font-d)', fontSize: 17 }}>{member.name}</div>
          <div className="muted">Kelas {member.className} · {member.jabatan}</div>
        </div>
      </div>

      <div className="opt-title">Absensi</div>
      <div className="opts two">
        {option(ABSENSI[0])}
        {option(ABSENSI[1], !canOut)}
      </div>
      {needTime && (
        <div className="reveal">
          <div className="label" style={{ textAlign: 'center' }}>
            Waktu {pick === 'IN' ? 'masuk' : 'keluar'} (wajib)
          </div>
          <DigitalClock value={val} onChange={setVal} />
        </div>
      )}

      <div className="opt-title">Izin</div>
      <div className="opts three">{IZIN.map(o => option(o))}</div>
      {!needTime && pick && (
        <div className="reveal">
          <label className="label">Keterangan Tambahan (opsional)</label>
          <HighlightNote value={note} onChange={setNote} />
        </div>
      )}

      {hasRecord && (
        <p className="muted" style={{ textAlign: 'center', margin: '0 0 10px' }}>
          Ketuk lagi pilihan yang aktif untuk membatalkannya{hasRecord && rec.checkOut && rec.status === 'HADIR' ? ' · ' : ''}
          {rec.checkOut && rec.status === 'HADIR' && <button type="button" className="link-btn" onClick={clearOut} disabled={busy}>Hapus jam keluar saja</button>}
        </p>
      )}

      <DynamicButtons
        busy={busy}
        resetKey={pick}
        left={{ icon: <X size={24} />, label: 'Batal', color: 'plain', onConfirm: onClose }}
        right={{
          icon: <Check size={24} />,
          label: pick ? CONFIRM[pick].label : hasRecord ? 'Kosongkan Absen' : 'Pilih dulu',
          color: pick ? CONFIRM[pick].color : hasRecord ? 'red' : 'blue',
          disabled: !pick && !hasRecord,
          onConfirm: confirm
        }}
      />
    </Sheet>
  );
}
