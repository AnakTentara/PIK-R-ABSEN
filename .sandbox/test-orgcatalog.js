// Uji katalog jabatan (hierarki) & mode penggantian pejabat (database sandbox)
import assert from 'node:assert/strict';
import prisma from './src/config/db.js';
import { getCatalog, saveCatalog, resetCatalog, DEFAULT_POSITIONS, OrgError } from './src/utils/orgCatalog.js';
import { assignPosition, saveOrgEntry } from './src/utils/orgSync.js';
import { formatPersonName } from './src/utils/nameUtils.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

for (const t of ['orgMember', 'member']) await prisma[t].deleteMany();
await prisma.setting.deleteMany({ where: { key: 'ORG_POSITIONS' } });
let n = 0;
const mk = (name, extra = {}) => prisma.member.create({
  data: { nisn: `8${String(++n).padStart(3, '0')}`, name, className: 'XI-1', whatsappNumber: '0', email: 'x@x', gender: 'L', password: 'x', ...extra }
});
const role = async (id) => (await prisma.member.findUnique({ where: { id } })).role;
const clone = () => JSON.parse(JSON.stringify(DEFAULT_POSITIONS));

console.log('\nKatalog bawaan');
await test('bawaan: 19 jabatan, Ketua Umum di atas Wakil, Sekretaris & Bendahara berdampingan (level sama)', async () => {
  const c = await getCatalog();
  assert.equal(c.length, 19);
  const lv = (l) => c.find((p) => p.label === l).level;
  assert.ok(lv('Ketua Umum') < lv('Wakil Ketua Umum'));
  assert.equal(lv('Sekretaris Umum'), lv('Bendahara Umum'));
  assert.equal(c.find((p) => p.label === 'Anggota Humas').parent, 'Ketua Humas');
});

console.log('\nUbah hierarki');
await test('tambah jabatan baru "Koordinator Acara" (level 5) dan geser Bendahara ke level 3 berdampingan Wakil', async () => {
  const list = clone();
  list.push({ label: 'Koordinator Acara', role: 'KABINET', level: 5, order: 9 });
  const b = list.find((p) => p.label === 'Bendahara Umum'); b.level = 3; b.order = 2;
  const r = await saveCatalog(list);
  assert.equal(r.catalog.length, 20);
  const c = await getCatalog();
  assert.equal(c.find((p) => p.label === 'Bendahara Umum').level, 3);
  assert.ok(c.find((p) => p.label === 'Koordinator Acara'));
});
await test('jabatan baru bisa langsung dipegang anggota (role KABINET)', async () => {
  const a = await mk('Aji');
  await assignPosition(a.id, 'Koordinator Acara');
  assert.equal(await role(a.id), 'KABINET');
});
await test('ganti nama jabatan yang sedang dipegang: pengurus aktif ikut, role tetap sinkron', async () => {
  const list = (await getCatalog()).map((p) => ({ ...p }));
  list.find((p) => p.label === 'Koordinator Acara').was = 'Koordinator Acara';
  list.find((p) => p.label === 'Koordinator Acara').label = 'Ketua Acara & Event';
  const r = await saveCatalog(list);
  assert.deepEqual(r.renamed, [{ from: 'Koordinator Acara', to: 'Ketua Acara & Event', count: 1 }]);
  assert.equal(await prisma.orgMember.count({ where: { jabatan: 'Ketua Acara & Event', isCurrent: true } }), 1);
  assert.equal(await prisma.orgMember.count({ where: { jabatan: 'Koordinator Acara' } }), 0);
});
await test('ganti nama Ketua bidang: anggota bidang (parent) ikut menunjuk nama baru', async () => {
  const list = (await getCatalog()).map((p) => ({ ...p }));
  const k = list.find((p) => p.label === 'Ketua MedInfo'); k.was = 'Ketua MedInfo'; k.label = 'Koordinator MedInfo';
  const r = await saveCatalog(list);
  assert.equal(r.catalog.find((p) => p.label === 'Anggota MedInfo').parent, 'Koordinator MedInfo');
});

console.log('\nPengaman');
await test('jabatan yang masih dipegang tidak boleh dihapus dari katalog', async () => {
  const list = (await getCatalog()).filter((p) => p.label !== 'Ketua Acara & Event');
  await assert.rejects(() => saveCatalog(list), /masih dipegang/);
});
await test('nama dobel, kosong, peran salah, induk tidak ada -> ditolak (OrgError)', async () => {
  const base = (await getCatalog()).map((p) => ({ ...p }));
  await assert.rejects(() => saveCatalog([...base, { label: ' ketua umum ', role: 'KABINET', level: 1 }]), /dobel/);
  await assert.rejects(() => saveCatalog([...base, { label: '  ', role: 'KABINET', level: 1 }]), OrgError);
  await assert.rejects(() => saveCatalog([...base, { label: 'Aneh', role: 'RAJA', level: 1 }]), /Peran tidak valid/);
  await assert.rejects(() => saveCatalog([...base, { label: 'Anggota Gaib', role: 'ANGGOTA', level: 5, parent: 'Ketua Hantu' }]), /Induk/);
});
await test('gagal simpan tidak mengubah katalog (atomik)', async () => {
  const before = JSON.stringify(await getCatalog());
  await assert.rejects(() => saveCatalog([{ label: 'X', role: 'KABINET', level: 1 }]));
  assert.equal(JSON.stringify(await getCatalog()), before);
});
await test('reset ditolak selama jabatan khusus masih dipegang pengurus aktif (tidak ada yang yatim)', async () => {
  await assert.rejects(() => resetCatalog(), /masih dipegang pengurus aktif.*Ketua Acara & Event/);
  assert.ok((await getCatalog()).some((p) => p.label === 'Ketua Acara & Event'), 'katalog tidak berubah');
});
await test('setelah pemegangnya dipindahkan, reset kembali ke bawaan tanpa menyentuh pengurus lain', async () => {
  await prisma.orgMember.updateMany({ where: { jabatan: 'Ketua Acara & Event' }, data: { isCurrent: false, yearEnd: 2026 } });
  const holders = await prisma.orgMember.count({ where: { isCurrent: true } });
  await resetCatalog();
  assert.equal((await getCatalog()).length, 19);
  assert.equal(await prisma.orgMember.count({ where: { isCurrent: true } }), holders);
});

console.log('\nGanti pejabat: arsipkan atau tidak');
const lama = await mk('Pejabat Lama'); const baru = await mk('Pejabat Baru'); const baru2 = await mk('Pejabat Baru Dua');
await assignPosition(lama.id, 'Sekretaris Umum');
await test('mode "archive": pemegang lama masuk arsip (baris tetap ada, isCurrent=false)', async () => {
  const r = await assignPosition(baru.id, 'Sekretaris Umum', { displaceMode: 'archive' });
  assert.deepEqual(r.displaced, ['Pejabat Lama']);
  const row = await prisma.orgMember.findUnique({ where: { memberId: lama.id } });
  assert.equal(row.isCurrent, false);
  assert.ok(row.yearEnd);
  assert.equal(await role(lama.id), 'member');
});
await test('mode "remove": pemegang lama hanya diganti, catatannya tidak masuk arsip', async () => {
  const r = await assignPosition(baru2.id, 'Sekretaris Umum', { displaceMode: 'remove' });
  assert.deepEqual(r.displaced, ['Pejabat Baru']);
  assert.equal(await prisma.orgMember.findUnique({ where: { memberId: baru.id } }), null);
  assert.equal(await role(baru.id), 'member');
  assert.equal(await role(baru2.id), 'KABINET');
});
await test('mode tidak dikenal dianggap archive (aman)', async () => {
  const z = await mk('Zed');
  const r = await saveOrgEntry({ memberId: z.id, jabatan: 'Sekretaris Umum', isCurrent: true, displaceMode: 'hapus-semua' });
  assert.deepEqual(r.displaced, ['Pejabat Baru Dua']);
  assert.equal((await prisma.orgMember.findUnique({ where: { memberId: baru2.id } })).isCurrent, false);
});

console.log('\nFormat nama');
await test('formatPersonName: huruf, inisial, spasi, gelar', () => {
  assert.equal(formatPersonName('M.hAlo'), 'M. Halo');
  assert.equal(formatPersonName('HAIKAL MABRUR'), 'Haikal Mabrur');
  assert.equal(formatPersonName('  nur   aini '), 'Nur Aini');
  assert.equal(formatPersonName('Panca Nopriansyah, S.Pd'), 'Panca Nopriansyah, S.Pd');
  assert.equal(formatPersonName('budi s.pd'), 'Budi S.Pd');
  assert.equal(formatPersonName(''), '');
});

console.log(`\n${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
await prisma.setting.deleteMany({ where: { key: 'ORG_POSITIONS' } });
await prisma.$disconnect();
