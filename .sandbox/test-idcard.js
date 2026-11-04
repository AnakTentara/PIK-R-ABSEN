// Uji daftar ID Card via Excel: ekspor (berkode di atas), impor, reset, kode tidak lagi otomatis
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import prisma from './src/config/db.js';
import { buildRosterWorkbook, parseRosterSheet, planRosterImport, applyRosterImport, normalizeCode } from './src/utils/idcardExcel.js';
import { ensureMemberIdentity } from './src/utils/slug.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
for (const t of ['attendanceLog', 'attendance', 'attendanceSession', 'orgMember', 'member']) await prisma[t].deleteMany();

let n = 0;
const mk = (name, extra = {}) => prisma.member.create({
  data: { nisn: `00${String(++n).padStart(8, '0')}`, name, className: 'X-1', whatsappNumber: `0812000${n}`, email: `m${n}@x.id`, gender: 'Laki-laki', password: 'x', ...extra }
});
const toBuf = async (wb) => Buffer.from(await wb.xlsx.writeBuffer());
const sheet = async (headers, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Daftar ID Card');
  ws.addRow(headers); rows.forEach((r) => ws.addRow(r));
  return toBuf(wb);
};
const codeOf = async (id) => (await prisma.member.findUnique({ where: { id } })).memberCode;

const rafiqi = await mk('Ahmad Abdallah Rafiqi', { memberCode: 'PIKR_0002-26' });
const budi = await mk('Budi Santoso', { memberCode: 'PIKR_0001-26' });
const citra = await mk('Citra Lestari');
const andi = await mk('Andi Pratama');
const alumni = await mk('Dewi Alumni', { status: 'ALUMNI', memberCode: 'PIKR_0009-25' });

console.log('\nKode tidak lagi dibuat otomatis');
await test('ensureMemberIdentity mengisi slug saja, memberCode tetap kosong', async () => {
  await ensureMemberIdentity();
  const c = await prisma.member.findUnique({ where: { id: citra.id } });
  assert.ok(c.slug); assert.equal(c.memberCode, null);
  assert.equal(await codeOf(budi.id), 'PIKR_0001-26', 'kode yang ada tidak berubah');
});

console.log('\nEkspor');
let exported;
await test('berkode di atas (urut kode), belum berkode di bawah (A-Z), alumni tidak ikut', async () => {
  const wb = await buildRosterWorkbook();
  exported = await toBuf(wb);
  const ws = (await new ExcelJS.Workbook().xlsx.load(exported)).getWorksheet('Daftar ID Card');
  const hdr = ws.getRow(1).values.slice(1);
  assert.deepEqual(hdr, ['No', 'Kode ID Card', 'Nama Lengkap', 'NISN', 'Email', 'No. WhatsApp', 'Jenis Kelamin', 'Kelas', 'Link Profil']);
  const names = [], codes = [];
  ws.eachRow((r, i) => { if (i > 1) { codes.push(r.getCell(2).value || ''); names.push(r.getCell(3).value); } });
  assert.deepEqual(names, ['Budi Santoso', 'Ahmad Abdallah Rafiqi', 'Andi Pratama', 'Citra Lestari']);
  assert.deepEqual(codes, ['PIKR_0001-26', 'PIKR_0002-26', '', '']);
});
await test('NISN & WA tetap teks (nol di depan tidak hilang), link profil lengkap', async () => {
  const ws = (await new ExcelJS.Workbook().xlsx.load(exported)).getWorksheet('Daftar ID Card');
  assert.equal(String(ws.getRow(2).getCell(4).value), budi.nisn);
  assert.match(String(ws.getRow(2).getCell(9).value), /^https:\/\/pikr-manseku\.my\.id\/@budisantoso$/);
});
await test('hasil ekspor bisa diimpor balik tanpa perubahan', async () => {
  const { plan, errors } = await planRosterImport(await parseRosterSheet(exported));
  assert.equal(errors.length, 0);
  assert.ok(plan.every((p) => !p.changed));
});

console.log('\nImpor');
const H = ['No', 'Kode ID Card', 'Nama Lengkap', 'NISN'];
await test('format kode dinormalkan (pikr_5-26 -> PIKR_0005-26)', () => {
  assert.equal(normalizeCode('pikr_5-26'), 'PIKR_0005-26');
  assert.equal(normalizeCode('PIKR-0005-26'), null);
  assert.equal(normalizeCode(''), null);
});
await test('kode kosong tidak mengubah apa pun; isi kode baru lewat NISN', async () => {
  const buf = await sheet(H, [[1, 'PIKR_0003-26', 'nama salah ketik', citra.nisn], [2, '', 'Andi Pratama', andi.nisn]]);
  const r = await planRosterImport(await parseRosterSheet(buf));
  assert.equal(r.plan.length, 1); assert.equal(r.skipped, 1); assert.equal(r.errors.length, 0);
  assert.equal(await applyRosterImport(r.plan), 1);
  assert.equal(await codeOf(citra.id), 'PIKR_0003-26');
  assert.equal(await codeOf(andi.id), null);
});
await test('cadangan nama persis bila NISN kosong', async () => {
  const buf = await sheet(H, [[1, 'PIKR_0004-26', 'Andi Pratama', '']]);
  const r = await planRosterImport(await parseRosterSheet(buf));
  await applyRosterImport(r.plan);
  assert.equal(await codeOf(andi.id), 'PIKR_0004-26');
});
await test('kode dobel di file, kode dipakai orang lain, format salah, anggota tak ditemukan -> ditolak per baris', async () => {
  const buf = await sheet(H, [
    [1, 'PIKR_0010-26', 'x', citra.nisn], [2, 'PIKR_0010-26', 'x', andi.nisn],
    [3, 'PIKR_0001-26', 'x', rafiqi.nisn],
    [4, 'ABC', 'x', budi.nisn],
    [5, 'PIKR_0020-26', 'Tidak Ada', '9999999999'],
    [6, 'PIKR_0021-26', 'x', alumni.nisn]
  ]);
  const r = await planRosterImport(await parseRosterSheet(buf));
  assert.equal(r.plan.length, 0);
  const why = r.errors.map((e) => e.alasan).join(' | ');
  assert.match(why, /lebih dari satu baris/); assert.match(why, /sudah dipakai Budi/);
  assert.match(why, /Format kode/); assert.match(why, /tidak ditemukan/);
  assert.equal(r.errors.length, 6, why);
});
await test('tukar kode dua anggota dalam satu file berhasil (tanpa bentrok unik)', async () => {
  const buf = await sheet(H, [[1, 'PIKR_0002-26', 'x', budi.nisn], [2, 'PIKR_0001-26', 'x', rafiqi.nisn]]);
  const r = await planRosterImport(await parseRosterSheet(buf));
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  await applyRosterImport(r.plan);
  assert.equal(await codeOf(budi.id), 'PIKR_0002-26');
  assert.equal(await codeOf(rafiqi.id), 'PIKR_0001-26');
});
await test('satu baris salah tidak menggagalkan baris benar', async () => {
  const buf = await sheet(H, [[1, 'PIKR_0030-26', 'x', andi.nisn], [2, 'rusak', 'x', citra.nisn]]);
  const r = await planRosterImport(await parseRosterSheet(buf));
  assert.equal(r.plan.length, 1); assert.equal(r.errors.length, 1);
});
await test('file tanpa kolom Kode ID Card / kosong -> pesan jelas', async () => {
  await assert.rejects(async () => parseRosterSheet(await sheet(['Nama Lengkap', 'NISN'], [['A', '1']])), /Kode ID Card/);
  await assert.rejects(async () => parseRosterSheet(await sheet(['Kode ID Card', 'NISN'], [])), /Tidak ada baris/);
});

console.log('\nReset (mulai dari awal)');
await test('semua kode dikosongkan, slug dan data lain utuh', async () => {
  const before = await prisma.member.findMany({ select: { id: true, name: true, slug: true } });
  const r = await prisma.member.updateMany({ where: { memberCode: { not: null } }, data: { memberCode: null } });
  assert.ok(r.count >= 3);
  assert.equal(await prisma.member.count({ where: { memberCode: { not: null } } }), 0);
  const after = await prisma.member.findMany({ select: { id: true, name: true, slug: true } });
  assert.deepEqual(after.sort((a, b) => a.id.localeCompare(b.id)), before.sort((a, b) => a.id.localeCompare(b.id)));
});

console.log(`\n${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
for (const t of ['member']) await prisma[t].deleteMany();
await prisma.$disconnect();
