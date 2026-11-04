import { useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, ArrowRight, Check } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { submitRecord } from '../lib/queue.js';
import { feedback } from '../lib/feedback.js';
import { nowWibTime, splitTime, pad } from '../lib/time.js';
import { Avatar, Roll, Sheet, STATUS_LABEL } from './Common.jsx';
import DynamicButtons from './DynamicButtons.jsx';
import { AnalogClock } from './Clocks.jsx';

/**
 * Popup hasil scan kartu.
 * scan = respons POST /scan: { member, record, suggested: IN|OUT|DONE }
 * Scan 1 = masuk, scan 2 = keluar, scan 3+ = tampilkan data (koreksi lewat Edit Waktu).
 * Waktu yang ditampilkan = jam scan; bisa diganti lewat "Edit Waktu" sebelum dikonfirmasi.
 */
export default function ScanPopup({ scan, onClose, onSaved }) {
  const { member, record } = scan;
  const initialAction = scan.suggested === 'OUT' ? 'OUT' : 'IN';
  const [action, setAction] = useState(initialAction);
  const [time, setTime] = useState(scan.now || nowWibTime());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [suggested, setSuggested] = useState(scan.suggested);

  const isOut = action === 'OUT';
  const leave = record && record.status !== 'HADIR';
  const done = suggested === 'DONE';

  async function confirm() {
    setBusy(true);
    try {
      // Sudah absen masuk & sedang edit jam masuk -> PATCH, selain itu rekam baru
      if (record?.status === 'HADIR' && action === 'IN') {
        await api.patch(`/records/${record.id}`, { checkIn: time });
      } else {
        const { queued } = await submitRecord({ memberId: member.id, action, time });
        if (queued) toast('Offline: absen disimpan di HP, dikirim saat sinyal kembali', { icon: '📶' });
      }
      isOut ? feedback.checkout() : feedback.success();
      toast.success(`${member.name.split(' ')[0]} ${isOut ? 'absen keluar' : 'absen masuk'} ${time}`);
      onSaved();
    } catch (err) {
      feedback.error();
      toast.error(errMsg(err, 'Gagal menyimpan absensi'));
      setResetKey(k => k + 1);
    } finally {
      setBusy(false);
    }
  }

  // Jam yang ditampilkan: jam tersimpan, kecuali yang sedang akan dicatat
  const shownIn = action === 'IN' ? time : record?.checkIn;
  const shownOut = action === 'OUT' ? time : record?.checkOut;

  return (
    <>
      <Sheet onClose={onClose}>
        <div className="person stagger">
          <div className="avatar-ring" style={{ '--d': 0 }}><Avatar name={member.name} photo={member.photoPath} size={96} /></div>
          <div className="nm" style={{ '--d': 1 }}>{member.name}</div>
          <div className="meta" style={{ '--d': 2 }}>Kelas {member.className}</div>
          <span className="chip" style={{ '--d': 3 }}>{member.jabatan}</span>
        </div>

        {leave && (
          <div className="notice">
            Hari ini tercatat <b>{STATUS_LABEL[record.status]}</b>{record.note ? ` — ${record.note}` : ''}.
            Konfirmasi akan mengubahnya menjadi Hadir.
          </div>
        )}
        {done && <div className="notice">Sudah absen masuk & keluar hari ini.</div>}

        <div className="times stagger">
          <div className={`time-box in${action === 'IN' && !done ? ' pending' : ''}`} style={{ '--d': 4 }}>
            <span>Jam Masuk</span>
            {shownIn ? <b><Roll value={shownIn} /></b> : <b className="none">Belum ada</b>}
          </div>
          <div className={`time-box out${action === 'OUT' && !done ? ' pending' : ''}`} style={{ '--d': 5 }}>
            <span>Jam Keluar</span>
            {shownOut && !done ? <b><Roll value={shownOut} /></b> : record?.checkOut ? <b><Roll value={record.checkOut} /></b> : <b className="none">Belum ada</b>}
          </div>
        </div>

        {done ? (
          <DynamicButtons
            resetKey={resetKey}
            left={{ icon: <Pencil size={22} />, label: 'Edit Waktu', color: 'plain', onConfirm: () => setEditing(true) }}
            right={{ icon: <Check size={24} />, label: 'Tutup', color: 'green', onConfirm: onClose }}
          />
        ) : (
          <DynamicButtons
            busy={busy}
            resetKey={`${resetKey}-${action}`}
            left={{ icon: <Pencil size={22} />, label: 'Edit Waktu', color: 'plain', onConfirm: () => setEditing(true) }}
            right={{
              icon: <ArrowRight size={24} />,
              label: isOut ? 'Absen Keluar' : 'Absen Masuk',
              color: isOut ? 'red' : 'green',
              onConfirm: confirm
            }}
          />
        )}
      </Sheet>

      {editing && (
        <EditTimeSheet
          action={action}
          time={time}
          canOut={record?.status === 'HADIR' && !!record.checkIn}
          onClose={() => { setEditing(false); setResetKey(k => k + 1); }}
          onSave={(a, t) => {
            setAction(a);
            setTime(t);
            setEditing(false);
            setResetKey(k => k + 1);
            // Setelah edit, popup selalu menawarkan konfirmasi aksi baru
            setSuggested(a);
          }}
        />
      )}
    </>
  );
}

/** Popup Edit Waktu: toggle Masuk/Keluar + jam analog + Simpan. */
function EditTimeSheet({ action, time, canOut, onClose, onSave }) {
  const [a, setA] = useState(action);
  const [val, setVal] = useState(splitTime(time));

  return (
    <Sheet onClose={onClose} top title="Edit Waktu">
      <div className={`toggle${a === 'OUT' ? ' is-out' : ''}`} style={{ '--i': a === 'OUT' ? 1 : 0 }}>
        <button type="button" className={a === 'IN' ? 'on-in' : ''} onClick={() => { feedback.pop(); setA('IN'); }}>Jam Masuk</button>
        <button type="button" className={a === 'OUT' ? 'on-out' : ''} disabled={!canOut}
          onClick={() => { feedback.pop(); setA('OUT'); }} title={canOut ? '' : 'Belum absen masuk'}>
          Jam Keluar
        </button>
      </div>
      <AnalogClock value={val} onChange={setVal} />
      <button type="button" className="cbtn c-green" style={{ width: '100%' }}
        onClick={() => onSave(a, `${pad(val.h)}:${pad(val.m)}`)}>
        Simpan
      </button>
    </Sheet>
  );
}
