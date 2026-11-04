// Uji sinkronisasi Anggota <-> Struktur Organisasi (database sandbox)
import assert from 'node:assert/strict';
import prisma from './src/config/db.js';
import {
  saveOrgEntry, assignPosition, clearPosition, deleteOrgEntry, archiveBeforeDelete,
  buildSyncReport, applySyncFixes, findPosition, defaultJabatanForRole, OrgError
} from './src/utils/orgSync.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

for (const t of ['attendanceLog', 'attendance', 'attendanceSession', 'orgMember', 'member']) await prisma[t].deleteMany();
let n = 0;
const mk = (name, extra = {}) => prisma.member.create({
  data: { nisn: `9${String(++n).padStart(3, '0')}`, name, className: 'XI-1', whatsappNumber: '0', email: 'x@x', gender: 'L', password: 'x', ...extra }
});
const role = async id => (await prisma.member.findUnique({ where: { id } })).role;
const current = id => prisma.orgMember.findFirst({ where: { memberId: id, isCurrent: true } });
const year = new Date().getFullYear();

const a = await mk('Andi'), b = await mk('Budi'), c = await mk('Cici'), d = await mk('Dedi');

console.log('\nPemberian jabatan');
await test('assignPosition: anggota jadi Ketua MedInfo -> OrgMember aktif + role KABINET', async () => {
  const r = await assignPosition(a.id, 'Ketua MedInfo');
  assert.equal(r.org.jabatan, 'Ketua MedInfo');
  assert.equal(r.org.isCurrent, true);
  assert.equal(await role(a.id), 'KABINET');
});
await test('jabatan tunggal: pemegang baru menggantikan lama (lama diarsipkan, role kembali member)', async () => {
  const r = await assignPosition(b.id, 'Ketua MedInfo');
  assert.deepEqual(r.displaced, ['Andi']);
  assert.equal(await role(b.id), 'KABINET');
  assert.equal(await role(a.id), 'member');
  const old = await prisma.orgMember.findUnique({ where: { memberId: a.id } });
  assert.equal(old.isCurrent, false);
  assert.ok(old.yearEnd);
});
await test('jabatan non-tunggal (Anggota Humas) boleh banyak orang', async () => {
  await assignPosition(c.id, 'Anggota Humas');
  const r = await assignPosition(d.id, 'Anggota Humas');
  assert.deepEqual(r.displaced, []);
  assert.equal(await role(c.id), 'ANGGOTA');
  assert.equal(await role(d.id), 'ANGGOTA');
});
await test('ganti jabatan: 1 anggota tetap 1 baris OrgMember (tidak dobel)', async () => {
  await assignPosition(c.id, 'Ketua Humas');
  assert.equal(await prisma.orgMember.count({ where: { memberId: c.id } }), 1);
  assert.equal((await current(c.id)).jabatan, 'Ketua Humas');
  assert.equal(await role(c.id), 'KABINET');
});
await test('jabatan tidak dikenal ditolak', async () => {
  await assert.rejects(() => assignPosition(c.id, 'Raja Iblis'), OrgError);
});

console.log('\nCabut jabatan & alumni');
await test('clearPosition: jadi anggota biasa, jabatan diarsipkan', async () => {
  assert.equal(await clearPosition(c.id), 1);
  assert.equal(await role(c.id), 'member');
  assert.equal(await current(c.id), null);
  assert.equal((await prisma.orgMember.findUnique({ where: { memberId: c.id } })).jabatan, 'Ketua Humas');
});
await test('alumni tidak boleh diberi jabatan aktif', async () => {
  const x = await mk('Eko', { status: 'ALUMNI' });
  await assert.rejects(() => assignPosition(x.id, 'Anggota Humas'), /Alumni/);
});
await test('saveOrgEntry untuk alumni selalu arsip (isCurrent dipaksa false)', async () => {
  const x = await mk('Fani', { status: 'ALUMNI' });
  const r = await saveOrgEntry({ memberId: x.id, jabatan: 'Bendahara Umum', isCurrent: true, yearStart: 2025, yearEnd: 2026 });
  assert.equal(r.org.isCurrent, false);
  assert.equal(await role(x.id), 'member');
});
await test('membuka lagi baris arsip = periode baru (yearStart tahun ini, yearEnd kosong)', async () => {
  const row = await prisma.orgMember.findUnique({ where: { memberId: c.id } });
  const r = await saveOrgEntry({ id: row.id, jabatan: 'Ketua Humas', isCurrent: true });
  assert.equal(r.org.isCurrent, true);
  assert.equal(r.org.yearEnd, null);
  assert.equal(r.org.yearStart, year);
  assert.equal(await role(c.id), 'KABINET');
});

console.log('\nLepas tautan & hapus');
await test('hapus baris struktur aktif: role anggota kembali member', async () => {
  const row = await current(c.id);
  await deleteOrgEntry(row.id);
  assert.equal(await role(c.id), 'member');
});
await test('archiveBeforeDelete: jabatan diarsipkan sebelum anggota dihapus, nama tetap di arsip', async () => {
  const y = await mk('Gita');
  await assignPosition(y.id, 'Sekretaris Umum');
  await archiveBeforeDelete(y.id);
  await prisma.member.delete({ where: { id: y.id } });
  const after = await prisma.orgMember.findFirst({ where: { name: 'Gita' } });
  assert.equal(after.memberId, null);
  assert.equal(after.isCurrent, false);
});
await test('memberId=NONE melepas tautan dan mengembalikan role anggota lama', async () => {
  const row = await current(d.id);
  assert.equal(await role(d.id), 'ANGGOTA');
  await saveOrgEntry({ id: row.id, memberId: 'NONE', name: 'Dedi (manual)', jabatan: row.jabatan });
  assert.equal(await role(d.id), 'member');
});

console.log('\nLaporan & perbaikan otomatis');
await test('buildSyncReport menemukan data tidak sinkron, applySyncFixes memperbaikinya', async () => {
  const k = await mk('Kiki', { role: 'KETUA' });
  const l = await mk('Lola', { role: 'ANGGOTA' });
  const m = await mk('Mimi', { status: 'ALUMNI', role: 'KABINET' });
  const rep = await buildSyncReport();
  const types = rep.fixes.map(f => `${f.name}:${f.type}`);
  assert.ok(types.includes('Kiki:BUAT_JABATAN'), types.join());
  assert.ok(types.includes('Mimi:ALUMNI_PERAN'), types.join());
  assert.ok(rep.needsPosition.some(p => p.name === 'Lola'));
  const res = await applySyncFixes();
  assert.ok(res.applied >= 2);
  assert.equal((await current(k.id)).jabatan, 'Ketua Umum');
  assert.equal(await role(k.id), 'KETUA');
  assert.equal(await role(m.id), 'member');
  assert.ok(res.remaining.some(p => p.name === 'Lola'));
  assert.equal(await role(l.id), 'ANGGOTA');
});
await test('applySyncFixes idempoten: tidak ada lagi perbaikan otomatis tersisa', async () => {
  assert.equal((await buildSyncReport()).fixes.length, 0);
});
await test('findPosition & defaultJabatanForRole', () => {
  assert.equal(findPosition(' ketua umum ').role, 'KETUA');
  assert.equal(defaultJabatanForRole('WAKIL'), 'Wakil Ketua Umum');
  assert.equal(defaultJabatanForRole('KABINET'), null);
});

console.log(`\n${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
await prisma.$disconnect();
