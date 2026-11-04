// Uji ekspor / impor Excel anggota dengan file .xlsx sungguhan (database sandbox)
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import prisma from './src/config/db.js';
import {
  buildMembersWorkbook, buildTemplateWorkbook, parseMembersSheet, planImport, applyImport,
  normalizeKelas, normalizeGender, normalizePhone
} from './src/utils/memberExcel.js';
import { assignPosition } from './src/utils/orgSync.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

for (const t of ['attendanceLog', 'attendance', 'attendanceSession', 'orgMember', 'member']) await prisma[t].deleteMany();
await prisma.setting.deleteMany({ where: { key: 'ORG_POSITIONS' } });

const toBuffer = async (wb) => Buffer.from(await wb.xlsx.writeBuffer());
async function sheetFrom(headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Anggota');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return toBuffer(wb);
}
const H = ['NISN', 'Nama Lengkap', 'Kelas', 'Jenis Kelamin', 'No. WhatsApp', 'Email', 'Asal Sekolah', 'Angkatan', 'Jabatan', 'Status', 'Bio'];

console.log('\nNormalisasi');
await test('kelas, gender, telepon', () => {
  assert.equal(normalizeKelas('x1'), 'X-1');
  assert.equal(normalizeKelas(' XI . 3 '), 'XI-3');
  assert.equal(normalizeKelas('12-2'), 'XII-2');
  assert.equal(normalizeKelas('Kelas A'), 'Kelas A');
  assert.equal(normalizeGender('L'), 'Laki-laki');
  assert.equal(normalizeGender('wanita'), 'Perempuan');
  assert.equal(normalizeGender('?'), '');
  assert.equal(normalizePhone('+62 812-3456-7890'), '081234567890');
  assert.equal(normalizePhone('6281234567890'), '081234567890');
  assert.equal(normalizePhone('81234567890'), '081234567890');
});

console.log('\nTemplat & ekspor');
await test('templat memuat kolom wajib bertanda * dan lembar Petunjuk', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await toBuffer(await buildTemplateWorkbook()));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Anggota', 'Petunjuk']);
  assert.equal(wb.getWorksheet('Anggota').getRow(1).getCell(1).value, 'NISN *');
});
await test('templat langsung bisa diimpor (2 baris contoh valid)', async () => {
  const rows = await parseMembersSheet(await toBuffer(await buildTemplateWorkbook()));
  const { summary } = await planImport(rows);
  assert.equal(summary.total, 2);
  assert.equal(summary.error, 0, JSON.stringify(summary));
});

console.log('\nImpor: pratinjau');
const good = [
  ['0100000001', 'budi SANTOSO', 'x1', 'L', '+62 812-1111-0001', 'budi@x.id', 'SMPN 1', 2026, '', 'AKTIF', 'Halo dunia'],
  ['0100000002', 'M.hAlo', 'XI 2', 'Perempuan', '6281222220002', 'halo@x.id', '', 2026, 'Ketua Humas', 'AKTIF', ''],
  ['0100000003', 'ANI ALUMNI', '12-1', 'P', '081333330003', 'ani@x.id', '', 2025, 'Anggota Humas', 'ALUMNI', ''],
  ['012', 'NISN Pendek', 'X-1', 'L', '081444440004', 'x@x.id', '', 2026, '', '', ''],
  ['0100000005', 'Jabatan Ngawur', 'X-1', 'L', '081555550005', 'j@x.id', '', 2026, 'Raja Iblis', '', ''],
  ['0100000001', 'Budi Dobel', 'X-1', 'L', '081666660006', 'd@x.id', '', 2026, '', '', '']
];
let planned;
await test('pratinjau: nama dirapikan, kelas/telepon dinormalkan, baris salah ditandai tanpa menyentuh database', async () => {
  const rows = await parseMembersSheet(await sheetFrom(H, good));
  planned = await planImport(rows);
  const p = planned.plan;
  assert.equal(p[0].data.name, 'Budi Santoso');
  assert.equal(p[0].data.className, 'X-1');
  assert.equal(p[0].data.whatsappNumber, '081211110001');
  assert.equal(p[1].data.name, 'M. Halo');
  assert.equal(p[1].data.className, 'XI-2');
  assert.equal(p[1].jabatan, 'Ketua Humas');
  assert.equal(p[2].jabatan, '');                       // alumni: jabatan diabaikan
  assert.match(p[2].warnings.join(), /Alumni tidak menerima jabatan/);
  assert.match(p[3].errors.join(), /NISN harus 10 digit/);
  assert.match(p[4].errors.join(), /Jabatan "Raja Iblis" tidak ada/);
  assert.match(p[5].errors.join(), /NISN dobel/);
  assert.deepEqual(planned.summary, { total: 6, create: 3, update: 0, error: 3, replacing: 0 });
  assert.equal(await prisma.member.count(), 0);          // pratinjau tidak menyimpan
});

console.log('\nImpor: terapkan');
await test('terapkan: 3 baris valid dibuat, 3 baris salah dilewati, jabatan terpasang, sandi acak dibuat', async () => {
  const r = await applyImport(planned.plan);
  assert.equal(r.created, 3);
  assert.equal(r.skipped, 3);
  assert.deepEqual(r.failed, []);
  const halo = await prisma.member.findUnique({ where: { nisn: '0100000002' }, include: { orgMember: true } });
  assert.equal(halo.role, 'KABINET');
  assert.equal(halo.orgMember.jabatan, 'Ketua Humas');
  assert.match(halo.plainPassword, /^\d{6}$/);
  assert.ok(halo.slug, 'link profil dibuat');
  assert.equal(halo.memberCode, null, 'kode ID Card tidak dibuat otomatis');
  const ani = await prisma.member.findUnique({ where: { nisn: '0100000003' }, include: { orgMember: true } });
  assert.equal(ani.status, 'ALUMNI');
  assert.equal(ani.orgMember, null);
  assert.equal((await prisma.member.findUnique({ where: { nisn: '0100000001' } })).bio, 'Halo dunia');
});
await test('impor ulang file yang sama = UPDATE (tidak membuat dobel), sandi lama tidak berubah', async () => {
  const before = (await prisma.member.findUnique({ where: { nisn: '0100000001' } })).plainPassword;
  const { plan, summary } = await planImport(await parseMembersSheet(await sheetFrom(H, good.slice(0, 3))));
  assert.deepEqual([summary.create, summary.update], [0, 3]);
  await applyImport(plan);
  assert.equal(await prisma.member.count(), 3);
  assert.equal((await prisma.member.findUnique({ where: { nisn: '0100000001' } })).plainPassword, before);
});

console.log('\nImpor: jabatan tunggal');
await test('jabatan yang dipegang orang lain dilaporkan "menggantikan"; mode archive memindahkan pemegang lama ke arsip', async () => {
  const rows = [['0100000009', 'Pengganti Baru', 'XI-1', 'L', '081777770009', 'p@x.id', '', 2026, 'Ketua Humas', 'AKTIF', '']];
  const { plan, summary } = await planImport(await parseMembersSheet(await sheetFrom(H, rows)));
  assert.deepEqual(plan[0].replaces, ['M. Halo']);
  assert.equal(summary.replacing, 1);
  await applyImport(plan, 'archive');
  const halo = await prisma.member.findUnique({ where: { nisn: '0100000002' }, include: { orgMember: true } });
  assert.equal(halo.orgMember.isCurrent, false);
  assert.equal(halo.role, 'member');
});
await test('dua baris mengklaim jabatan tunggal yang sama di satu file -> baris kedua ditolak', async () => {
  const rows = [
    ['0100000011', 'Calon Satu', 'X-1', 'L', '081888880011', 'a@x.id', '', 2026, 'Bendahara Umum', '', ''],
    ['0100000012', 'Calon Dua', 'X-1', 'L', '081888880012', 'b@x.id', '', 2026, 'Bendahara Umum', '', '']
  ];
  const { plan } = await planImport(await parseMembersSheet(await sheetFrom(H, rows)));
  assert.equal(plan[0].action, 'CREATE');
  assert.match(plan[1].errors.join(), /juga diklaim baris/);
});

console.log('\nEkspor');
await test('ekspor memuat anggota, jabatan aktif, kode ID Card; alumni di belakang, kelas terurut', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await toBuffer(await buildMembersWorkbook()));
  const ws = wb.getWorksheet('Anggota');
  const rows = [];
  ws.eachRow((row, n) => { if (n > 1) rows.push({ nama: row.getCell(2).value, kelas: row.getCell(3).value, jabatan: row.getCell(9).value, status: row.getCell(10).value, kode: row.getCell(12).value }); });
  assert.equal(rows.length, 4);
  assert.equal(rows.at(-1).status, 'ALUMNI');
  assert.ok(rows.slice(0, -1).every((r) => r.status === 'AKTIF'));
  const aktifKelas = rows.filter((r) => r.status === 'AKTIF').map((r) => r.kelas);
  assert.deepEqual(aktifKelas, [...aktifKelas].sort((a, b) => (a === b ? 0 : ['X-1', 'XI-1', 'XI-2'].indexOf(a) - ['X-1', 'XI-1', 'XI-2'].indexOf(b))));
  assert.ok(rows.every((r) => r.kode === '' || /^PIKR_\d{4}-\d{2}$/.test(r.kode)));
  assert.equal(rows.find((r) => r.nama === 'Pengganti Baru').jabatan, 'Ketua Humas');
  assert.equal(ws.getRow(1).getCell(1).value, 'NISN');
});
await test('ekspor hasil ekspor bisa langsung diimpor lagi tanpa kesalahan (round trip)', async () => {
  const buf = await toBuffer(await buildMembersWorkbook());
  const { summary } = await planImport(await parseMembersSheet(buf));
  assert.equal(summary.error, 0, JSON.stringify(summary));
  assert.equal(summary.create, 0);
});
await test('filter status ekspor', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await toBuffer(await buildMembersWorkbook({ status: 'ALUMNI' })));
  assert.equal(wb.getWorksheet('Anggota').rowCount, 2);
});

console.log('\nBerkas rusak');
await test('file bukan Excel / kolom wajib hilang / kosong -> error jelas', async () => {
  await assert.rejects(() => parseMembersSheet(Buffer.from('bukan excel')));
  const noCols = await sheetFrom(['Nama Lengkap'], [['x']]);
  const empty = await sheetFrom(H, []);
  await assert.rejects(() => parseMembersSheet(noCols), /Kolom wajib tidak ditemukan/);
  await assert.rejects(() => parseMembersSheet(empty), /Tidak ada baris data/);
});
await test('urutan kolom bebas & judul alias dikenali', async () => {
  const buf = await sheetFrom(['Email', 'Nama', 'NISN', 'JK', 'Hp', 'Kelas'], [['z@x.id', 'zed zed', '0100000099', 'P', '081999990099', 'x-3']]);
  const { plan } = await planImport(await parseMembersSheet(buf));
  assert.equal(plan[0].action, 'CREATE', JSON.stringify(plan[0].errors));
  assert.equal(plan[0].data.name, 'Zed Zed');
});

console.log(`\n${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
await prisma.$disconnect();
