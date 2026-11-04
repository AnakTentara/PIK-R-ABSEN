// Login sebagai anggota sungguhan (akun uji sementara) -> profil, kartu, simpan kartu, profil publik. Data uji dibersihkan.
const B = 'http://192.168.1.3:25552/api';
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('D:/RUDY/codeHaikal/PIK-R-MANSEKU/node_modules/bcryptjs');
const db = new DatabaseSync('D:/RUDY/codeHaikal/PIK-R-MANSEKU/local.db');
(async () => {
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
  const pw = await bcrypt.hash('ujikartu123', 10);
  const id = 'uji-kartu-' + Date.now();
  db.prepare("INSERT INTO Member (id,nisn,name,className,whatsappNumber,email,gender,password,plainPassword,status,joinYear,role,slug,memberCode,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, '9990009999', 'ZZ Uji Kartu', 'XI-1', '0800', 'u@x.id', 'Perempuan', pw, 'ujikartu123', 'ACTIVE', 2026, 'member', 'zzujikartu', 'PIKR_9999-26', Date.now());
  try {
    const login = await j(await fetch(`${B}/candidates/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nisn: '9990009999', password: 'ujikartu123' }) }));
    const H = { Authorization: `Bearer ${login.token}` };
    const me = await j(await fetch(`${B}/candidates/me`, { headers: H }));
    console.log('profil membawa slug/memberCode:', !!me.slug, !!me.memberCode, '| bio field ada:', 'bio' in me);
    const card = await j(await fetch(`${B}/candidates/me/card`, { headers: H }));
    console.log('GET me/card -> allowEdit', card.allowEdit, '| katalog sampul', card.catalog?.covers?.length);
    const fd = new FormData();
    fd.append('cover', 'titik'); fd.append('accent', '#8b5cf6'); fd.append('hidden', JSON.stringify(['asalSekolah']));
    fd.append('info', JSON.stringify([{ icon: 'trophy', label: 'Prestasi', value: 'Juara 1 OSN' }]));
    fd.append('bio', 'Bio dari uji kartu');
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(1500, 3)]);
    fd.append('cardPhoto', new Blob([png], { type: 'image/png' }), 'kartu.png');
    const put = await fetch(`${B}/candidates/me/card`, { method: 'PUT', headers: H, body: fd });
    const saved = await j(put);
    console.log('PUT me/card ->', put.status, saved.message, '| cardPhoto:', saved.card?.cardPhoto);
    const pub = await j(await fetch(`${B}/public/profile/zzujikartu`));
    console.log('publik: cover', pub.card.cover, '| aksen', pub.card.accent, '| info', pub.card.info.length, '| bio', pub.bio, '| foto kartu', pub.card.cardPhoto);
    for (const k of ['nisn', 'whatsappNumber', 'email', 'password', 'plainPassword', 'cardConfig']) if (k in pub) console.log('BOCOR:', k);
    if (saved.card?.cardPhoto) require('fs').rmSync('D:/RUDY/codeHaikal/PIK-R-MANSEKU/public' + saved.card.cardPhoto, { force: true });
  } finally {
    db.prepare('DELETE FROM Member WHERE id = ?').run(id);
    console.log('akun uji dihapus:', db.prepare("SELECT COUNT(*) n FROM Member WHERE nisn='9990009999'").get().n === 0);
  }
})();
