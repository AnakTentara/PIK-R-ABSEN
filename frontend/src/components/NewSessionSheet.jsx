import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, CalendarPlus } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { feedback } from '../lib/feedback.js';
import { Sheet } from './Common.jsx';

/**
 * Popup "Kegiatan Baru": muncul saat aplikasi dibuka di luar hari wajib.
 * Judul wajib, deskripsi opsional. Kegiatan ini bertipe TAMBAHAN (Alfa diisi manual).
 */
export default function NewSessionSheet({ info, onCreated, onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post('/sessions', { title, description });
      feedback.success();
      toast.success('Kegiatan dibuat');
      onCreated(data);
    } catch (err) {
      // Sudah dibuat dari HP petugas lain -> pakai kegiatan itu
      if (err.response?.status === 409 && err.response.data.session) {
        toast('Kegiatan hari ini sudah dibuat petugas lain', { icon: 'ℹ️' });
        onCreated(err.response.data.session);
      } else {
        toast.error(errMsg(err, 'Gagal membuat kegiatan'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} title="Kegiatan Baru">
      <form className="stack" onSubmit={submit}>
        <p className="muted">
          Hari ini {info.weekday}, bukan hari pertemuan rutin ({info.settings.wajibDayName} {info.settings.wajibTime}) dan tidak ada kegiatan wajib terdaftar.
          Buat kegiatan tambahan untuk mulai mengabsen. Anggota yang tidak hadir di kegiatan tambahan
          tidak otomatis Alfa.
        </p>
        <div>
          <label className="label" htmlFor="st">Judul kegiatan (wajib)</label>
          <input id="st" className="field" maxLength={100} value={title} autoFocus
            placeholder="mis. Rapat Pengurus" onChange={e => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="sd">Deskripsi (opsional)</label>
          <textarea id="sd" className="field" maxLength={1000} value={description}
            onChange={e => setDescription(e.target.value)} />
        </div>
        <button className="cbtn c-accent" disabled={busy || !title.trim()} type="submit">
          {busy ? <Loader2 className="spin" /> : <><CalendarPlus size={18} /> Buat Kegiatan</>}
        </button>
      </form>
    </Sheet>
  );
}
