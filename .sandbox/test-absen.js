// Uji end-to-end modul absensi di sandbox (database terpisah: .sandbox/local.db)
import express from 'express';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import prisma from './src/config/db.js';
import absenRoutes from './src/routes/absen.js';
import { getPublicProfile } from './src/controllers/absen.js';
import { ensureAbsenAccount } from './src/middlewares/authAbsen.js';
import { ensureMemberIdentity, slugify } from './src/utils/slug.js';
import { wibDate, wibTime, wibWeekday, fromWib } from './src/utils/wib.js';
const ABSEN_PW = process.env.ABSEN_PW || 'sandi-uji-absen';
const ADMIN_PW = process.env.ADMIN_PW || 'sandi-uji-admin';

const app = express();
app.use(express.json());
app.use('/api/absen', absenRoutes);
app.get('/api/public/profile/:slug', getPublicProfile);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

async function call(method, path, body, token, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

const today = wibDate();
const yesterday = wibDate(new Date(Date.now() - 864e5));
const twoDaysAgo = wibDate(new Date(Date.now() - 2 * 864e5));

// ─── Seed ───────────────────────────────────────────────────────────────────
for (const t of ['attendanceLog', 'attendance', 'attendanceSession', 'orgMember', 'member', 'admin', 'setting']) {
  await prisma[t].deleteMany();
}
const pw = await bcrypt.hash('rahasia', 10);
// createdAt berurutan (1 menit per anggota) supaya urutan pembagian ID/slug = urutan daftar, seperti data asli
let seq = 0;
const mk = (nisn, name, extra = {}) => prisma.member.create({
  data: {
    nisn, name, className: 'X-1', whatsappNumber: '08123', email: `${nisn}@x.id`, gender: 'L', password: pw,
    createdAt: new Date(Date.now() - 10 * 864e5 + seq++ * 60000), ...extra
  }
});
const ketua = await mk('1001', 'Budi Santoso', { joinYear: 2025 });
const andi = await mk('1003', 'Andi Pratama');
const andi2 = await mk('1004', 'Andi  Pratama');
const alumni = await mk('1005', 'Dewi Lestari', { status: 'ALUMNI', joinYear: 2024 });
await mk('1006', 'Ahmad Fauzi');
await prisma.orgMember.create({ data: { name: ketua.name, role: 'KETUA', jabatan: 'Ketua Umum', yearStart: 2026, isCurrent: true, memberId: ketua.id } });
await prisma.admin.create({ data: { username: 'admintest', password: pw, role: 'DEVELOPER' } });
await ensureAbsenAccount();
await ensureMemberIdentity();
// Kode ID Card tidak lagi dibuat otomatis (diisi admin lewat Excel): isi manual seperti hasil impor
for (const [m, code] of [[alumni, 'PIKR_0001-24'], [ketua, 'PIKR_0001-25'], [andi, 'PIKR_0001-26'], [andi2, 'PIKR_0002-26']]) {
  await prisma.member.update({ where: { id: m.id }, data: { memberCode: code } });
}
await prisma.member.update({ where: { nisn: '1006' }, data: { memberCode: 'PIKR_0003-26' } });
// Hari wajib = hari ini, supaya scan langsung jalan tanpa popup kegiatan baru
await prisma.setting.create({ data: { key: 'absen_wajib_day', value: String(wibWeekday(today)) } });

console.log('\nUtils & identitas anggota');
await test('slugify membuang aksen & simbol', () => {
  assert.equal(slugify("  Nur 'Aini Ç. Putri "), 'nurainicputri');
});
await test('WIB (UTC+7): 17:30 UTC = 00:30 WIB besoknya', () => {
  const d = new Date('2026-10-30T17:30:00Z');
  assert.equal(wibDate(d), '2026-10-31');
  assert.equal(wibTime(d), '00:30');
  assert.equal(wibWeekday('2026-10-30'), 5); // Jum'at
  assert.equal(fromWib('2026-10-31', '00:30').toISOString(), d.toISOString());
  assert.equal(fromWib('2026-10-31', '24:00'), null);
});
await test('kode per tahun masuk: PIKR_0001-24, PIKR_0001-25, PIKR_0001..0003-26', async () => {
  const get = async id => (await prisma.member.findUnique({ where: { id } })).memberCode;
  assert.equal(await get(alumni.id), 'PIKR_0001-24');
  assert.equal(await get(ketua.id), 'PIKR_0001-25');
  const codes = (await prisma.member.findMany({ where: { joinYear: 2026 }, orderBy: { memberCode: 'asc' } })).map(m => m.memberCode);
  assert.deepEqual(codes, ['PIKR_0001-26', 'PIKR_0002-26', 'PIKR_0003-26']);
});
await test('slug nama kembar: yang terdaftar duluan dapat slug asli, berikutnya -2', async () => {
  assert.equal((await prisma.member.findUnique({ where: { id: andi.id } })).slug, 'andipratama');
  assert.equal((await prisma.member.findUnique({ where: { id: andi2.id } })).slug, 'andipratama2');
});
await test('anggota baru dapat link profil tapi TIDAK dapat kode otomatis, kode lama tidak berubah', async () => {
  const baru = await mk('1007', 'Eka Putri');
  try {
    await ensureMemberIdentity();
    const e = await prisma.member.findUnique({ where: { id: baru.id } });
    assert.equal(e.memberCode, null);
    assert.equal(e.slug, 'ekaputri');
    await prisma.member.update({ where: { id: andi.id }, data: { name: 'Andi Pratama Putra' } });
    await ensureMemberIdentity();
    const a = await prisma.member.findUnique({ where: { id: andi.id } });
    assert.equal(a.slug, 'andipratama');
    assert.equal(a.memberCode, 'PIKR_0001-26');
  } finally {
    // selalu dikembalikan supaya tes lain tidak ikut gagal
    await prisma.member.update({ where: { id: andi.id }, data: { name: 'Andi Pratama' } });
    await prisma.member.delete({ where: { id: baru.id } });
  }
});

console.log('\nLogin akun bersama');
let token;
await test(`pikrmanseku01 / ${ABSEN_PW} berhasil, password salah ditolak`, async () => {
  assert.equal((await call('POST', '/api/absen/login', { username: 'pikrmanseku01', password: 'salah' })).status, 401);
  const r = await call('POST', '/api/absen/login', { username: 'pikrmanseku01', password: `${ABSEN_PW}` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.officer.kind, 'shared');
  token = r.body.token;
});
await test('akun bersama disimpan di Setting, bukan tabel Admin (aman dari seedDefaultAdmin)', async () => {
  assert.equal(await prisma.admin.findUnique({ where: { username: 'pikrmanseku01' } }), null);
});
await test('admin website juga bisa login', async () => {
  const r = await call('POST', '/api/absen/login', { username: 'admintest', password: 'rahasia' });
  assert.equal(r.body.officer.kind, 'admin');
});
await test('anggota biasa (NISN) tidak bisa login', async () => {
  assert.equal((await call('POST', '/api/absen/login', { username: '1003', password: 'rahasia' })).status, 401);
});
await test('token tanpa Bearer ditolak 401', async () => {
  assert.equal((await call('GET', '/api/absen/members')).status, 401);
});

console.log('\nKegiatan wajib & tambahan');
await test('hari wajib: sesi WAJIB dibuat otomatis dengan jam 15:00', async () => {
  const r = await call('GET', '/api/absen/session/today', null, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.isWajibDay, true);
  assert.equal(r.body.session.type, 'PERTEMUAN');
  assert.equal(r.body.session.startTime, '15:00');
});
await test('bukan hari wajib: session null (popup kegiatan baru), absen ditolak NO_SESSION', async () => {
  await prisma.setting.update({ where: { key: 'absen_wajib_day' }, data: { value: String((wibWeekday(yesterday) + 3) % 7) } });
  const r = await call('POST', '/api/absen/records', { memberId: andi.id, action: 'IN', date: yesterday, time: '08:00' }, token);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'NO_SESSION');
});
await test('buat kegiatan tambahan: judul wajib, deskripsi opsional', async () => {
  assert.equal((await call('POST', '/api/absen/sessions', { title: '  ', date: yesterday }, token)).status, 400);
  const r = await call('POST', '/api/absen/sessions', { title: 'Rapat Pengurus', date: yesterday }, token);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.type, 'TAMBAHAN');
  assert.equal(r.body.description, null);
  assert.equal((await call('POST', '/api/absen/sessions', { title: 'Lagi', date: yesterday }, token)).status, 409);
});
await test('kegiatan di masa depan ditolak', async () => {
  assert.equal((await call('POST', '/api/absen/sessions', { title: 'X', date: '2099-01-01' }, token)).status, 400);
});
// kembalikan hari wajib = hari ini
await prisma.setting.update({ where: { key: 'absen_wajib_day' }, data: { value: String(wibWeekday(today)) } });

console.log('\nDaftar anggota & scan');
await test('daftar anggota aktif per huruf, alumni tidak ikut', async () => {
  const r = await call('GET', '/api/absen/members', null, token);
  assert.equal(r.body.total, 4);
  assert.deepEqual(r.body.groups.A.map(m => m.name), ['Ahmad Fauzi', 'Andi  Pratama', 'Andi Pratama']);
  assert.equal(r.body.groups.D, undefined);
  assert.equal(r.body.groups.B[0].jabatan, 'Ketua Umum');
  assert.equal(r.body.groups.B[0].memberCode, 'PIKR_0001-25');
});
await test('scan barcode batang (ID anggota) dan QR (link profil) sama-sama dikenali', async () => {
  const code = (await prisma.member.findUnique({ where: { id: andi.id } })).memberCode;
  const a = await call('POST', '/api/absen/scan', { code }, token);
  const b = await call('POST', '/api/absen/scan', { code: 'https://pikr-manseku.my.id/@andipratama?utm=x' }, token);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.member.id, andi.id);
  assert.equal(b.body.member.id, andi.id);
  assert.equal(a.body.suggested, 'IN');
});
await test('kode tidak valid -> 400, tidak dikenal -> 404, alumni -> 409', async () => {
  assert.equal((await call('POST', '/api/absen/scan', { code: '<script>' }, token)).status, 400);
  assert.equal((await call('POST', '/api/absen/scan', { code: 'PIKR_9999-99' }, token)).status, 404);
  assert.equal((await call('POST', '/api/absen/scan', { code: 'pikr_1-24' }, token)).status, 409);
});

console.log('\nRekam absensi');
let recId;
await test('scan 1 -> absen masuk tercatat', async () => {
  const r = await call('POST', '/api/absen/records', { memberId: andi.id, action: 'IN', time: '00:01', clientId: 'hp1-001' }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.record.status, 'HADIR');
  recId = r.body.record.id;
});
await test('kirim ulang clientId yang sama (offline) tidak dobel', async () => {
  const r = await call('POST', '/api/absen/records', { memberId: andi.id, action: 'IN', clientId: 'hp1-001' }, token);
  assert.equal(r.body.duplicate, true);
  assert.equal(await prisma.attendance.count(), 1);
});
await test('scan 2 langsung menyarankan OUT (tanpa jeda)', async () => {
  const r = await call('POST', '/api/absen/scan', { code: '@andipratama' }, token);
  assert.equal(r.body.suggested, 'OUT');
});
await test('absen keluar tanpa masuk ditolak; jam format salah ditolak', async () => {
  assert.equal((await call('POST', '/api/absen/records', { memberId: andi2.id, action: 'OUT' }, token)).status, 400);
  assert.equal((await call('POST', '/api/absen/records', { memberId: andi2.id, action: 'IN', time: '9:5' }, token)).status, 400);
});
await test('scan 2 -> keluar; scan 3 -> DONE', async () => {
  const r = await call('POST', '/api/absen/records', { memberId: andi.id, action: 'OUT' }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await call('POST', '/api/absen/scan', { code: '@andipratama' }, token)).body.suggested, 'DONE');
});
await test('scan 3 + Edit Waktu: keluar sebelum masuk ditolak, valid tersimpan + log', async () => {
  assert.equal((await call('PATCH', `/api/absen/records/${recId}`, { checkIn: '00:10', checkOut: '00:05' }, token)).status, 400);
  const ok = await call('PATCH', `/api/absen/records/${recId}`, { checkIn: '00:01', checkOut: '00:02' }, token);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.record.checkOut, '00:02');
  const logs = await call('GET', `/api/absen/records/${recId}/logs`, null, token);
  assert.deepEqual(logs.body.map(l => l.action), ['IN', 'OUT', 'EDIT']);
});
await test('SAKIT + keterangan mengganti jam; edit jam lalu ditolak', async () => {
  const r = await call('POST', '/api/absen/records', { memberId: andi2.id, action: 'SAKIT', note: '  Izin demam  ' }, token);
  assert.equal(r.body.record.note, 'Izin demam');
  assert.equal(r.body.record.checkIn, null);
  assert.equal((await call('PATCH', `/api/absen/records/${r.body.record.id}`, { checkIn: '00:01' }, token)).status, 400);
});
await test('kegiatan tambahan kemarin: ketua hadir, Ahmad diisi Alfa manual', async () => {
  const ahmad = await prisma.member.findFirst({ where: { name: 'Ahmad Fauzi' } });
  assert.equal((await call('POST', '/api/absen/records', { memberId: ketua.id, action: 'IN', date: yesterday, time: '08:00' }, token)).status, 200);
  assert.equal((await call('POST', '/api/absen/records', { memberId: ahmad.id, action: 'ALFA', date: yesterday }, token)).status, 200);
});

console.log('\nRekap & export');
await test('Alfa otomatis hanya di kegiatan WAJIB, kegiatan TAMBAHAN tidak', async () => {
  await prisma.attendanceSession.create({ data: { date: twoDaysAgo, type: 'PERTEMUAN', title: 'Rutin', openedBy: 'x' } });
  const r = await call('GET', `/api/absen/recap?from=${today}&to=${twoDaysAgo}`, null, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.from, twoDaysAgo);
  assert.deepEqual(r.body.sessions.map(s => s.type), ['PERTEMUAN', 'TAMBAHAN', 'PERTEMUAN']);
  const row = name => r.body.rows.find(x => x.name === name);
  assert.deepEqual(row('Andi Pratama').counts, { HADIR: 1, SAKIT: 0, IZIN: 0, ALFA: 1 });
  assert.equal(row('Andi Pratama').days[1].status, null); // tambahan, tidak diisi -> kosong
  assert.deepEqual(row('Andi  Pratama').counts, { HADIR: 0, SAKIT: 1, IZIN: 0, ALFA: 1 });
  assert.deepEqual(row('Budi Santoso').counts, { HADIR: 1, SAKIT: 0, IZIN: 0, ALFA: 2 });
  assert.deepEqual(row('Ahmad Fauzi').counts, { HADIR: 0, SAKIT: 0, IZIN: 0, ALFA: 3 });
  assert.equal(row('Ahmad Fauzi').days[1].auto, undefined); // alfa manual
  assert.equal(row('Dewi Lestari'), undefined);
});
await test('anggota yang baru dibuat setelah tanggal kegiatan tidak dihitung Alfa', async () => {
  const baru = await mk('1008', 'Fajar Baru', { createdAt: new Date() });
  const r = await call('GET', `/api/absen/recap?from=${twoDaysAgo}&to=${twoDaysAgo}`, null, token);
  assert.equal(r.body.rows.find(x => x.id === baru.id).counts.ALFA, 0);
  await prisma.member.delete({ where: { id: baru.id } });
});
await test('daftar kegiatan berisi jenis & hitungan status', async () => {
  const r = await call('GET', '/api/absen/sessions', null, token);
  assert.equal(r.body[0].date, today);
  assert.deepEqual(r.body[0].counts, { HADIR: 1, SAKIT: 1, IZIN: 0, ALFA: 0 });
  assert.equal(r.body[1].type, 'TAMBAHAN');
});
await test('export Excel menghasilkan file xlsx (zip)', async () => {
  const r = await call('GET', `/api/absen/recap/excel?from=${twoDaysAgo}&to=${today}`, null, token);
  assert.equal(r.status, 200);
  assert.equal(String.fromCharCode(...new Uint8Array(r.body).slice(0, 2)), 'PK');
});

console.log('\nPengaturan, akun & tool');
await test('pengaturan default Jumat 15:00, bisa diubah, input salah ditolak', async () => {
  await prisma.setting.delete({ where: { key: 'absen_wajib_day' } });
  const g = await call('GET', '/api/absen/settings', null, token);
  assert.equal(g.body.wajibDay, 5);
  assert.equal(g.body.wajibDayName, "Jum'at");
  assert.equal(g.body.wajibTime, '15:00');
  assert.equal((await call('PUT', '/api/absen/settings', { wajibDay: 7 }, token)).status, 400);
  assert.equal((await call('PUT', '/api/absen/settings', { wajibTime: '25:00' }, token)).status, 400);
  const p = await call('PUT', '/api/absen/settings', { wajibDay: 6, wajibTime: '14:30' }, token);
  assert.equal(p.body.wajibDayName, 'Sabtu');
  assert.equal(p.body.wajibTime, '14:30');
});
await test('ganti password akun bersama, lalu login dengan password baru', async () => {
  assert.equal((await call('PUT', '/api/absen/account', { currentPassword: 'salah', newPassword: 'barubaru1' }, token)).status, 401);
  assert.equal((await call('PUT', '/api/absen/account', { currentPassword: `${ABSEN_PW}`, newPassword: 'pendek' }, token)).status, 400);
  assert.equal((await call('PUT', '/api/absen/account', { currentPassword: `${ABSEN_PW}`, newPassword: 'barubaru1' }, token)).status, 200);
  assert.equal((await call('POST', '/api/absen/login', { username: 'pikrmanseku01', password: 'barubaru1' })).status, 200);
  assert.equal((await call('POST', '/api/absen/login', { username: 'pikrmanseku01', password: `${ABSEN_PW}` })).status, 401);
});

console.log('\nProfil publik');
await test('profil /@slug hanya foto, nama, kelas, jabatan', async () => {
  const r = await call('GET', '/api/public/profile/budisantoso');
  assert.equal(r.status, 200);
  for (const k of ['nisn', 'whatsappNumber', 'email', 'password']) assert.equal(r.body[k], undefined, k);
  assert.equal(r.body.jabatan, 'Ketua Umum');
  assert.equal((await call('GET', '/api/public/profile/tidak-ada')).status, 404);
  assert.equal((await call('GET', '/api/public/profile/PIKR_0001-25')).status, 404);
});

console.log('\nDashboard admin');
const jwt = (await import('jsonwebtoken')).default;
const SECRET = process.env.JWT_SECRET || 'supersecretkeypikrmanseku123';
const mkAdmin = async (username, role) => {
  const a = await prisma.admin.create({ data: { username, password: pw, role } });
  return jwt.sign({ id: a.id, role: 'admin' }, SECRET, { expiresIn: '1h' });
};
const devTok = await mkAdmin('dev-dash', 'DEVELOPER');
const medTok = await mkAdmin('med-dash', 'MEDINFO');
await test('token dashboard admin diterima: overview, rekap, ID Card', async () => {
  const o = await call('GET', '/api/absen/overview', null, devTok);
  assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.ok(o.body.sessionCount >= 1);
  assert.ok(o.body.topAlfa.some(x => x.name === 'Ahmad Fauzi'));
  const c = await call('GET', '/api/absen/idcards', null, devTok);
  assert.ok(c.body.every(m => m.url.includes('/@')));
  const flags = c.body.map(m => (m.memberCode ? 1 : 0));
  assert.deepEqual(flags, [...flags].sort((x, y) => y - x), 'yang berkode di atas');
});
await test('MEDINFO boleh lihat rekap, tidak boleh absen/hapus/reset', async () => {
  assert.equal((await call('GET', '/api/absen/recap', null, medTok)).status, 200);
  assert.equal((await call('POST', '/api/absen/records', { memberId: andi.id, action: 'IZIN' }, medTok)).status, 403);
  const s = (await call('GET', '/api/absen/sessions', null, devTok)).body[0];
  assert.equal((await call('DELETE', `/api/absen/sessions/${s.id}`, null, medTok)).status, 403);
  assert.equal((await call('PUT', '/api/absen/account/reset', { newPassword: 'abcdefgh' }, medTok)).status, 403);
});
await test('akun bersama web absen tidak boleh hapus kegiatan', async () => {
  const t = (await call('POST', '/api/absen/login', { username: 'pikrmanseku01', password: 'barubaru1' })).body.token;
  const s = (await call('GET', '/api/absen/sessions', null, t)).body[0];
  assert.equal((await call('DELETE', `/api/absen/sessions/${s.id}`, null, t)).status, 403);
});
await test('riwayat per anggota', async () => {
  const r = await call('GET', `/api/absen/members/${andi.id}/history`, null, devTok);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.days.some(d => d.status === 'HADIR' && d.session));
});
await test('reset password akun absen oleh admin (tanpa password lama)', async () => {
  assert.equal((await call('PUT', '/api/absen/account/reset', { newPassword: 'reset1234' }, devTok)).status, 200);
  assert.equal((await call('POST', '/api/absen/login', { username: 'pikrmanseku01', password: 'reset1234' })).status, 200);
});
await test('hapus kegiatan oleh DEVELOPER menghapus absennya juga', async () => {
  const s = await prisma.attendanceSession.findFirst({ where: { date: yesterday } });
  const r = await call('DELETE', `/api/absen/sessions/${s.id}`, null, devTok);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await prisma.attendance.count({ where: { sessionId: s.id } }), 0);
});

console.log('\nDaftar ID Card lewat Excel (HTTP)');
const ExcelJS = (await import('exceljs')).default;
const xlsxBuf = async (rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daftar ID Card');
  ws.addRow(['No', 'Kode ID Card', 'Nama Lengkap', 'NISN']);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
};
async function upload(path, buf, tok) {
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'daftar.xlsx');
  const res = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
  return { status: res.status, body: await res.json() };
}
await test('ekspor Excel: berkode di atas, yang belum berkode di bawah', async () => {
  const res = await fetch(base + '/api/absen/idcards/export', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const ws = (await new ExcelJS.Workbook().xlsx.load(Buffer.from(await res.arrayBuffer()))).getWorksheet('Daftar ID Card');
  const codes = [];
  ws.eachRow((r, i) => { if (i > 1) codes.push(r.getCell(2).value || ''); });
  assert.deepEqual(codes.map(Boolean), [...codes.map(Boolean)].sort((x, y) => y - x));
  assert.ok(codes.some(Boolean));
});
await test('impor Excel hanya untuk admin (Developer/Kabinet Umum): akun bersama & MEDINFO ditolak', async () => {
  const buf = await xlsxBuf([[1, 'PIKR_0040-26', 'x', '1006']]);
  assert.equal((await upload('/api/absen/idcards/import', buf, token)).status, 403);
  assert.equal((await upload('/api/absen/idcards/import', buf, medTok)).status, 403);
});
await test('pratinjau (dryRun) tidak menyimpan; impor sungguhan menyimpan lewat NISN', async () => {
  const buf = await xlsxBuf([[1, 'PIKR_0040-26', 'nama bebas', '1006']]);
  const dry = await upload('/api/absen/idcards/import?dryRun=1', buf, devTok);
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.changed, 1);
  assert.equal((await prisma.member.findUnique({ where: { nisn: '1006' } })).memberCode, 'PIKR_0003-26');
  const r = await upload('/api/absen/idcards/import', buf, devTok);
  assert.equal(r.body.saved, 1, JSON.stringify(r.body));
  assert.equal((await prisma.member.findUnique({ where: { nisn: '1006' } })).memberCode, 'PIKR_0040-26');
  const s = await call('POST', '/api/absen/scan', { code: 'PIKR_0040-26' }, token);
  assert.equal(s.body.member.name, 'Ahmad Fauzi');
});
await test('file Excel tanpa kolom Kode ID Card -> 400 dengan pesan jelas', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('x').addRow(['Nama', 'NISN']);
  const r = await upload('/api/absen/idcards/import?dryRun=1', Buffer.from(await wb.xlsx.writeBuffer()), devTok);
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Kode ID Card/);
});
await test('hapus semua kode: wajib konfirmasi HAPUS, hanya admin, data lain utuh', async () => {
  const del = (tok, body) => call('DELETE', '/api/absen/idcards/codes', body, tok);
  assert.equal((await del(devTok, {})).status, 400);
  assert.equal((await del(token, { confirm: 'HAPUS' })).status, 403);
  const before = await prisma.member.count();
  const r = await del(devTok, { confirm: 'HAPUS' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await prisma.member.count({ where: { memberCode: { not: null } } }), 0);
  assert.equal(await prisma.member.count(), before);
  assert.equal((await call('POST', '/api/absen/scan', { code: 'PIKR_0040-26' }, token)).status, 404);
  // slug (QR belakang) tetap jalan
  assert.equal((await call('POST', '/api/absen/scan', { code: 'https://pikr-manseku.my.id/@ahmadfauzi' }, token)).status, 200);
});


console.log('\nMode Cepat & kosongkan absen');
{
  // Sesi hari ini sudah ada dari tes sebelumnya (hari wajib = hari ini); pakai anggota yang masih kosong
  const qm = await prisma.member.create({ data: { nisn: '1900', name: 'Qori Cepat', className: 'X-2', whatsappNumber: '08', email: 'q@x.id', gender: 'P', password: pw, memberCode: 'PIKR_0090-26' } });
  await ensureMemberIdentity();
  const quick = (code = 'PIKR_0090-26', tok = token) => call('POST', '/api/absen/scan', { code, quick: true }, tok);
  const rec = async () => prisma.attendance.findFirst({ where: { memberId: qm.id }, include: { logs: true } });

  await test('scan biasa (tanpa quick) tidak menyimpan apa pun', async () => {
    const r = await call('POST', '/api/absen/scan', { code: 'PIKR_0090-26' }, token);
    assert.equal(r.status, 200); assert.equal(r.body.quick, undefined);
    assert.equal(await rec(), null);
  });
  await test('Mode Cepat scan 1 -> langsung absen MASUK', async () => {
    const r = await quick();
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.quick.result, 'IN');
    assert.equal(r.body.record.status, 'HADIR'); assert.ok(r.body.record.checkIn);
    const row = await rec();
    assert.equal(row.logs.length, 1); assert.equal(row.logs[0].action, 'IN');
  });
  await test('scan kedua beruntun (kartu masih di depan kamera) = DUPLICATE, bukan keluar', async () => {
    const r = await quick();
    assert.equal(r.body.quick.result, 'DUPLICATE');
    assert.equal((await rec()).checkOut, null);
  });
  await test('scan lagi setelah > 1 menit -> absen KELUAR', async () => {
    const row = await rec();
    await prisma.attendance.update({ where: { id: row.id }, data: { checkIn: new Date(Date.now() - 5 * 60000) } });
    const r = await quick();
    assert.equal(r.body.quick.result, 'OUT', JSON.stringify(r.body));
    assert.ok((await rec()).checkOut);
  });
  await test('scan ketiga -> DONE, tidak mengubah apa pun', async () => {
    const before = await rec();
    const r = await quick();
    assert.equal(r.body.quick.result, 'DONE');
    const after = await rec();
    assert.equal(+after.checkOut, +before.checkOut); assert.equal(after.logs.length, before.logs.length);
  });
  await test('anggota berstatus Izin discan cepat -> jadi HADIR, status lama dilaporkan', async () => {
    const row = await rec();
    await prisma.attendance.update({ where: { id: row.id }, data: { status: 'IZIN', checkIn: null, checkOut: null, note: 'acara keluarga' } });
    const r = await quick();
    assert.equal(r.body.quick.result, 'IN'); assert.equal(r.body.quick.previous, 'IZIN');
    const now = await rec(); assert.equal(now.status, 'HADIR'); assert.equal(now.note, null);
  });
  await test('kode salah 400/404, anggota alumni 409 (sama seperti scan biasa)', async () => {
    assert.equal((await quick('@@@')).status, 400);
    assert.equal((await quick('PIKR_0777-26')).status, 404);
    assert.equal((await quick('https://pikr-manseku.my.id/@tidakadaorang')).status, 404);
  });
  await test('dua scan cepat bersamaan tidak membuat baris dobel (satu IN, satu DUPLICATE)', async () => {
    await prisma.attendance.deleteMany({ where: { memberId: qm.id } });
    const [a, b] = await Promise.all([quick(), quick()]);
    const results = [a.body.quick?.result, b.body.quick?.result].sort();
    assert.ok(results.includes('IN') && results.every((x) => ['IN', 'DUPLICATE'].includes(x)), results.join());
    assert.equal(await prisma.attendance.count({ where: { memberId: qm.id } }), 1);
  });

  console.log('\nKosongkan absen (batal pilih)');
  await test('akun bersama (petugas) boleh mengosongkan; data kembali "belum diisi"', async () => {
    const row = await rec();
    const r = await call('DELETE', `/api/absen/records/${row.id}`, null, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await rec(), null);
    assert.equal(await prisma.attendanceLog.count({ where: { attendanceId: row.id } }), 0);
  });
  await test('setelah dikosongkan, scan cepat mulai lagi dari MASUK', async () => {
    assert.equal((await quick()).body.quick.result, 'IN');
  });
  await test('mengosongkan id yang tidak ada -> 404; MEDINFO tetap tidak boleh (hanya lihat)', async () => {
    assert.equal((await call('DELETE', '/api/absen/records/tidak-ada', null, token)).status, 404);
    const row = await rec();
    assert.equal((await call('DELETE', `/api/absen/records/${row.id}`, null, medTok)).status, 403);
    assert.ok(await rec());
  });
  await test('rekap: sesi wajib yang dikosongkan kembali menghitung Alfa otomatis', async () => {
    const row = await rec();
    await call('DELETE', `/api/absen/records/${row.id}`, null, token);
    const today = wibDate();
    const r = await call('GET', `/api/absen/recap?from=${today}&to=${today}`, null, token);
    const me = r.body.rows.find((x) => x.name === 'Qori Cepat');
    assert.ok(me, 'anggota ada di rekap');
    assert.ok(['ALFA', null].includes(me.days[0].status), JSON.stringify(me.days[0]));
  });
}


console.log('\nBiodata publik');
await test('biodata: bio, gender, asal sekolah; tanpa data pribadi', async () => {
  await prisma.member.update({ where: { id: ketua.id }, data: { bio: 'Remaja berencana!', asalSekolah: 'MTsN 1' } });
  const r = await call('GET', '/api/public/profile/budisantoso');
  assert.equal(r.body.bio, 'Remaja berencana!');
  assert.equal(r.body.gender, 'L');
  assert.equal(r.body.asalSekolah, 'MTsN 1');
  for (const k of ['nisn', 'whatsappNumber', 'email', 'password', 'plainPassword', 'id']) assert.equal(r.body[k], undefined, k);
});

console.log('\nAturan alumni: jabatan & struktur');
const { memberTitle, alumniLabel, closeOrgForMembers } = await import('./src/utils/memberUtils.js');
await test('alumniLabel: tim inti diberi label berperiode, anggota bidang tidak', () => {
  assert.equal(alumniLabel({ role: 'KETUA', jabatan: 'Ketua Umum', yearStart: 2025, yearEnd: 2026 }), 'ALUMNI KETUA UMUM 2025/2026');
  assert.equal(alumniLabel({ role: 'KABINET', jabatan: 'Ketua MedInfo', yearStart: 2025, yearEnd: null }), 'ALUMNI KETUA MEDINFO 2025/2026');
  assert.equal(alumniLabel({ role: 'KABINET', jabatan: 'Sekretaris Umum', yearStart: 2026, yearEnd: 2026 }), 'ALUMNI SEKRETARIS UMUM 2026/2027');
  assert.equal(alumniLabel({ role: 'ANGGOTA', jabatan: 'Anggota Humas', yearStart: 2025, yearEnd: 2026 }), null);
  assert.equal(alumniLabel(null), null);
});
await test('memberTitle: aktif = jabatan struktur / Anggota, alumni = label / Alumni', () => {
  assert.equal(memberTitle({ status: 'ACTIVE', orgMember: { jabatan: 'Bendahara Umum', isCurrent: true } }), 'Bendahara Umum');
  assert.equal(memberTitle({ status: 'ACTIVE', orgMember: null }), 'Anggota');
  assert.equal(memberTitle({ status: 'ALUMNI', orgMember: { role: 'ANGGOTA', jabatan: 'Anggota Humas', isCurrent: false, yearStart: 2025, yearEnd: 2026 } }), 'Alumni');
  assert.equal(memberTitle({ status: 'ALUMNI', orgMember: { role: 'KETUA', jabatan: 'Ketua Umum', isCurrent: false, yearStart: 2025, yearEnd: 2026 } }), 'ALUMNI KETUA UMUM 2025/2026');
  // jabatan lama yang belum sempat ditutup tetap tidak boleh tampil sebagai jabatan aktif untuk alumni
  assert.equal(memberTitle({ status: 'ALUMNI', orgMember: { role: 'ANGGOTA', jabatan: 'Anggota MedInfo', isCurrent: true } }), 'Alumni');
});
await test('API profil publik & scan: alumni ketua berlabel, alumni biasa "Alumni", tanpa jabatan aktif', async () => {
  const ketuaLama = await mk('2001', 'Kakak Ketua');
  const biasa = await mk('2002', 'Kakak Biasa');
  await prisma.orgMember.create({ data: { name: ketuaLama.name, role: 'KETUA', jabatan: 'Ketua Umum', yearStart: 2025, isCurrent: true, memberId: ketuaLama.id } });
  await prisma.orgMember.create({ data: { name: biasa.name, role: 'ANGGOTA', jabatan: 'Anggota Humas', yearStart: 2025, isCurrent: true, memberId: biasa.id } });
  await ensureMemberIdentity();
  await prisma.member.updateMany({ where: { id: { in: [ketuaLama.id, biasa.id] } }, data: { status: 'ALUMNI' } });
  await closeOrgForMembers([ketuaLama.id, biasa.id], 2026);

  const a = (await call('GET', '/api/public/profile/kakakketua')).body;
  assert.equal(a.jabatan, 'ALUMNI KETUA UMUM 2025/2026');
  assert.equal(a.alumniLabel, 'ALUMNI KETUA UMUM 2025/2026');
  assert.equal(a.isAlumni, true);
  const b = (await call('GET', '/api/public/profile/kakakbiasa')).body;
  assert.equal(b.jabatan, 'Alumni');
  assert.equal(b.alumniLabel, null);
  // alumni tidak muncul di daftar anggota aktif web absen
  const list = (await call('GET', '/api/absen/members', null, token)).body;
  assert.ok(!Object.values(list.groups).flat().some(m => m.name === 'Kakak Ketua' || m.name === 'Kakak Biasa'));
  // jabatan struktur mereka sudah ditutup
  const orgs = await prisma.orgMember.findMany({ where: { memberId: { in: [ketuaLama.id, biasa.id] } } });
  assert.ok(orgs.every(o => o.isCurrent === false && o.yearEnd === 2026));
});

console.log('\nKegiatan wajib bertanggal (lebih dari satu)');
const dayBefore = (n) => wibDate(new Date(Date.now() - n * 864e5));
await test('simpan 2 kegiatan wajib bertanggal; tanggal dobel / judul kosong / jam salah ditolak', async () => {
  const okList = [
    { date: dayBefore(5), title: 'Latihan Konseling', time: '09:00' },
    { date: dayBefore(4), title: 'Pelantikan' }
  ];
  const ok = await call('PUT', '/api/absen/settings', { kegiatanWajib: okList }, token);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.kegiatanWajib.length, 2);
  assert.equal(ok.body.kegiatanWajib[0].time, '09:00');
  assert.equal(ok.body.kegiatanWajib[1].time, null);
  assert.equal((await call('PUT', '/api/absen/settings', { kegiatanWajib: [okList[0], okList[0]] }, token)).status, 400);
  assert.equal((await call('PUT', '/api/absen/settings', { kegiatanWajib: [{ date: dayBefore(3), title: '  ' }] }, token)).status, 400);
  assert.equal((await call('PUT', '/api/absen/settings', { kegiatanWajib: [{ date: dayBefore(3), title: 'x', time: '25:00' }] }, token)).status, 400);
});
await test('kegiatan wajib yang sudah lewat otomatis jadi sesi WAJIB di rekap, tanpa ada yang membuka aplikasi', async () => {
  const r = await call('GET', `/api/absen/recap?from=${dayBefore(5)}&to=${dayBefore(4)}`, null, token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.sessions.map((x) => [x.type, x.title]), [['WAJIB', 'Latihan Konseling'], ['WAJIB', 'Pelantikan']]);
  assert.equal(r.body.rows.find((x) => x.name === 'Ahmad Fauzi').counts.ALFA, 2);
  assert.equal(r.body.sessions[0].startTime, '09:00');
});
await test('absen di tanggal wajib: sesi sudah ada, tidak minta Kegiatan Baru', async () => {
  const r = await call('POST', '/api/absen/records', { memberId: andi.id, action: 'IN', date: dayBefore(4), time: '10:00' }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await test('Alfa otomatis hanya untuk PERTEMUAN dan WAJIB, tidak untuk TAMBAHAN', async () => {
  // sesi tambahan di tanggal yang tidak terdaftar wajib & bukan hari pertemuan
  const extra = dayBefore(3);
  // kosongkan tanggal itu dulu (sesi dari tes lain bisa menempatinya, tergantung hari tes dijalankan)
  const old = await prisma.attendanceSession.findMany({ where: { date: extra }, select: { id: true } });
  await prisma.attendance.deleteMany({ where: { sessionId: { in: old.map((x) => x.id) } } });
  await prisma.attendanceSession.deleteMany({ where: { date: extra } });
  await prisma.setting.update({ where: { key: 'absen_wajib_day' }, data: { value: String((wibWeekday(extra) + 1) % 7) } });
  const made = await call('POST', '/api/absen/sessions', { title: 'Rapat Dadakan', date: extra }, token);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.type, 'TAMBAHAN');
  const r = await call('GET', `/api/absen/recap?from=${dayBefore(5)}&to=${today}`, null, token);
  const types = r.body.sessions.map((x) => x.type);
  assert.ok(types.includes('WAJIB') && types.includes('PERTEMUAN') && types.includes('TAMBAHAN'), types.join());
  const idx = types.indexOf('TAMBAHAN');
  assert.equal(r.body.rows.find((x) => x.name === 'Ahmad Fauzi').days[idx].auto, undefined);
});
await test('hapus dari daftar wajib: sesi lama tetap ada (riwayat)', async () => {
  await call('PUT', '/api/absen/settings', { kegiatanWajib: [] }, token);
  assert.deepEqual((await call('GET', '/api/absen/settings', null, token)).body.kegiatanWajib, []);
  const r = await call('GET', `/api/absen/recap?from=${dayBefore(5)}&to=${dayBefore(4)}`, null, token);
  assert.equal(r.body.sessions.length, 2);
});

console.log(`\n${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
server.close();
await prisma.$disconnect();
