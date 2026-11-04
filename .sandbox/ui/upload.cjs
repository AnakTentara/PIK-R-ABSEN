const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
const B = 'http://192.168.1.3:25552/api';
(async () => {
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
  const login = await j(await fetch(`${B}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'pikr-manseku', password: `${ADMIN_PW}` }) }));
  const H = { Authorization: `Bearer ${login.token}` };
  const members = await j(await fetch(`${B}/admin/members`, { headers: H }));
  const m = members.find(x => x.status === 'ACTIVE' && x.name.startsWith('Ahza'));

  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(2000, 7)]);
  const send = async (blob, name, extra = {}) => {
    const fd = new FormData();
    fd.append('photo', blob, name);
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    const r = await fetch(`${B}/admin/members/${m.id}`, { method: 'PUT', headers: H, body: fd });
    return { status: r.status, body: await j(r) };
  };

  const ok = await send(new Blob([png], { type: 'image/png' }), 'tes.png', { bio: 'Bio dari tes upload' });
  console.log('gambar  ->', ok.status, ok.body.message, '| foto:', ok.body.member?.photoPath, '| bio:', ok.body.member?.bio);
  const bad = await send(new Blob(['bukan gambar'], { type: 'text/plain' }), 'x.txt');
  console.log('teks    ->', bad.status, JSON.stringify(bad.body).slice(0, 120));
  // kembalikan data uji
  await fetch(`${B}/admin/members/${m.id}`, { method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ bio: '' }) });
})();
