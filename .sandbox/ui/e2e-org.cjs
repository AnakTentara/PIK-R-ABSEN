const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';
// Uji HTTP end-to-end Anggota <-> Struktur lewat controller sungguhan.
// Memakai database LIVE, jadi semua perubahan dikembalikan di akhir dan hanya menyentuh anggota uji sementara.
const B = 'http://192.168.1.3:25552/api';
const assert = require('node:assert/strict');
let passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ✓', name); } catch (e) { process.exitCode = 1; console.log('  ✗', name, '\n    ', e.message); } };

(async () => {
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
  const login = await j(await fetch(`${B}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'pikr-manseku', password: `${ADMIN_PW}` }) }));
  const H = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };
  const api = async (method, path, body) => { const r = await fetch(B + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await j(r) }; };
  const members = async () => (await api('GET', '/admin/members')).body;
  const org = async () => (await api('GET', '/admin/org')).body;

  const snapshot = { members: await members(), org: await org() };
  const created = [];

  console.log('\nUrutan daftar anggota (Status -> Kelas)');
  await test('data /admin/members membawa jabatan & alumniLabel', async () => {
    const all = snapshot.members;
    assert.ok(all.some((m) => m.jabatan), 'ada yang punya jabatan');
    assert.ok(all.filter((m) => m.status === 'ALUMNI').every((m) => m.jabatan === null), 'alumni tanpa jabatan aktif');
    assert.equal(all.filter((m) => m.alumniLabel).length, 8);
  });

  console.log('\nTambah anggota dengan jabatan lewat API');
  let ketuaBaru;
  await test('POST /admin/members role KETUA tanpa jabatan -> Ketua Umum, pemegang lama diarsipkan', async () => {
    const before = (await org()).find((o) => o.isCurrent && o.jabatan === 'Ketua Umum');
    const r = await api('POST', '/admin/members', { nisn: '9990000001', name: 'ZZ Uji Ketua', className: 'XI-1', whatsappNumber: '0800', email: 'uji@x.id', gender: 'Laki-laki', role: 'KETUA' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ketuaBaru = r.body.member; created.push(ketuaBaru.id);
    assert.equal(ketuaBaru.role, 'KETUA');
    const cur = (await org()).filter((o) => o.isCurrent && o.jabatan === 'Ketua Umum');
    assert.equal(cur.length, 1);
    assert.equal(cur[0].memberId, ketuaBaru.id);
    if (before) assert.notEqual(before.memberId, ketuaBaru.id);
  });

  let anggotaUji;
  await test('POST /admin/members dengan jabatan "Ketua MedInfo" -> role KABINET otomatis', async () => {
    const r = await api('POST', '/admin/members', { nisn: '9990000002', name: 'ZZ Uji Medinfo', className: 'X-1', whatsappNumber: '0800', email: 'u2@x.id', gender: 'Perempuan', role: 'KABINET', jabatan: 'Ketua MedInfo' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    anggotaUji = r.body.member; created.push(anggotaUji.id);
    assert.equal(anggotaUji.role, 'KABINET');
    assert.equal((await org()).find((o) => o.memberId === anggotaUji.id).jabatan, 'Ketua MedInfo');
  });

  console.log('\nEdit anggota -> struktur ikut berubah');
  await test('PUT jabatan "Anggota Humas": role ANGGOTA, jabatan lama diganti (1 baris)', async () => {
    const r = await api('PUT', `/admin/members/${anggotaUji.id}`, { jabatan: 'Anggota Humas', role: 'ANGGOTA' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.member.role, 'ANGGOTA');
    const rows = (await org()).filter((o) => o.memberId === anggotaUji.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].jabatan, 'Anggota Humas');
  });
  await test('PUT ganti nama -> nama di struktur ikut', async () => {
    await api('PUT', `/admin/members/${anggotaUji.id}`, { name: 'ZZ Uji Renamed' });
    assert.equal((await org()).find((o) => o.memberId === anggotaUji.id).name, 'ZZ Uji Renamed');
  });
  await test('PUT role member -> jabatan dicabut (diarsipkan), jadi anggota biasa', async () => {
    const r = await api('PUT', `/admin/members/${anggotaUji.id}`, { role: 'member' });
    assert.equal(r.body.member.role, 'member');
    assert.equal((await org()).find((o) => o.memberId === anggotaUji.id).isCurrent, false);
  });
  await test('PUT role KABINET tanpa jabatan spesifik -> ditolak 400 (tidak menebak bidang)', async () => {
    const r = await api('PUT', `/admin/members/${anggotaUji.id}`, { role: 'KABINET' });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  console.log('\nJadi alumni');
  await test('PUT status ALUMNI -> jabatan ditutup, role member, masuk arsip dengan label', async () => {
    await api('PUT', `/admin/members/${ketuaBaru.id}`, { status: 'ALUMNI' });
    const m = (await members()).find((x) => x.id === ketuaBaru.id);
    assert.equal(m.status, 'ALUMNI');
    assert.equal(m.role, 'member');
    assert.equal(m.jabatan, null);
    assert.match(m.alumniLabel, /^ALUMNI KETUA UMUM \d{4}\/\d{4}$/);
    assert.equal((await org()).find((o) => o.memberId === ketuaBaru.id).isCurrent, false);
  });

  console.log('\nStruktur -> Anggota (arah sebaliknya)');
  await test('POST /admin/org memberId + "Wakil Ketua Umum" -> role anggota WAKIL, pemegang lama diarsipkan', async () => {
    const r = await api('POST', '/admin/org', { memberId: anggotaUji.id, jabatan: 'Wakil Ketua Umum', yearStart: new Date().getFullYear(), isCurrent: true });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await members()).find((m) => m.id === anggotaUji.id).role, 'WAKIL');
    assert.equal((await org()).filter((o) => o.isCurrent && o.jabatan === 'Wakil Ketua Umum').length, 1);
  });
  await test('PUT /admin/org arsipkan -> role anggota kembali member', async () => {
    const row = (await org()).find((o) => o.memberId === anggotaUji.id);
    await api('PUT', `/admin/org/${row.id}`, { isCurrent: false, yearEnd: new Date().getFullYear() });
    assert.equal((await members()).find((m) => m.id === anggotaUji.id).role, 'member');
  });
  await test('DELETE anggota -> baris struktur tetap sebagai arsip tanpa tautan', async () => {
    const r = await api('DELETE', `/admin/members/${anggotaUji.id}`);
    assert.equal(r.status, 200);
    created.splice(created.indexOf(anggotaUji.id), 1);
    const rows = (await org()).filter((o) => o.name.includes('ZZ Uji'));
    assert.ok(rows.every((o) => o.isCurrent === false));
  });

  console.log('\nSinkronisasi massal');
  await test('GET /admin/org/positions & sync-report responsif', async () => {
    const p = await api('GET', '/admin/org/positions');
    assert.equal(p.body.length, 19);
    const r = await api('GET', '/admin/org/sync-report');
    assert.ok(Array.isArray(r.body.fixes) && Array.isArray(r.body.needsPosition));
  });

  // ── pembersihan: kembalikan database ke keadaan awal ──
  const fs = require('node:fs');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('D:/RUDY/codeHaikal/PIK-R-MANSEKU/local.db');
  db.prepare("DELETE FROM OrgMember WHERE name LIKE 'ZZ Uji%'").run();
  db.prepare("DELETE FROM Member WHERE name LIKE 'ZZ Uji%' OR nisn LIKE '999000000%'").run();
  // pulihkan jabatan Ketua Umum / Wakil milik pemegang awal
  for (const o of snapshot.org) {
    db.prepare('UPDATE OrgMember SET isCurrent=?, yearEnd=?, yearStart=?, jabatan=?, role=?, name=? WHERE id=?')
      .run(o.isCurrent ? 1 : 0, o.yearEnd, o.yearStart, o.jabatan, o.role, o.name, o.id);
  }
  for (const m of snapshot.members) {
    db.prepare('UPDATE Member SET role=?, status=?, name=? WHERE id=?').run(m.role, m.status, m.name, m.id);
  }
  const after = { members: db.prepare('SELECT COUNT(*) n FROM Member').get().n, org: db.prepare('SELECT COUNT(*) n FROM OrgMember').get().n };
  console.log(`\nDatabase dipulihkan: Member ${after.members}/${snapshot.members.length}, OrgMember ${after.org}/${snapshot.org.length}`);
  console.log(`${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
})();
