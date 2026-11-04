import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, LogIn } from 'lucide-react';
import api, { errMsg } from '../lib/api.js';
import { useAuth } from '../lib/store.js';
import { feedback } from '../lib/feedback.js';

/** Login petugas dengan akun bersama absensi (atau akun admin website). */
export default function LoginPage() {
  const login = useAuth(s => s.login);
  const [form, setForm] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/login', form);
      feedback.success();
      login(data.token, data.officer);
    } catch (err) {
      feedback.error();
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      toast.error(errMsg(err, 'Login gagal'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`login${shake ? ' shake' : ''}`}>
      <div className="login-orbs" aria-hidden="true"><i /><i /><i /></div>
      <div className="logo">
        <img src="/logo_pik-r-192.png" width="64" height="64" alt="PIK-R" onError={e => { e.currentTarget.style.display = 'none'; }} />
      </div>
      <h1>Administrasi PIK-R<br /><span>MANSEKU</span></h1>

      <form className="card stack" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="u">Username</label>
          <input id="u" className="field" autoComplete="username" autoCapitalize="none" value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value.trim() })} required />
        </div>
        <div>
          <label className="label" htmlFor="p">Password</label>
          <input id="p" className="field" type="password" autoComplete="current-password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} required />
        </div>
        <button className="cbtn c-accent" disabled={busy} type="submit">
          {busy ? <Loader2 className="spin" /> : <><LogIn size={18} /> Masuk</>}
        </button>
      </form>
    </div>
  );
}
