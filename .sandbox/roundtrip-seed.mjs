// Menyiapkan Excel ekspor (dari sandbox) dan memeriksa impor balik data_anggota.xlsx hasil generator
import fs from 'node:fs';
import prisma from './src/config/db.js';
import { buildRosterWorkbook, parseRosterSheet, planRosterImport } from './src/utils/idcardExcel.js';
import { ensureMemberIdentity } from './src/utils/slug.js';

const mode = process.argv[2];
if (mode === 'export') {
  for (const t of ['attendanceLog', 'attendance', 'attendanceSession', 'orgMember', 'member']) await prisma[t].deleteMany();
  const mk = (nisn, name, extra = {}) => prisma.member.create({ data: { nisn, name, className: 'X-1', whatsappNumber: '0812', email: `${nisn}@x.id`, gender: 'L', password: 'x', ...extra } });
  await mk('1001', 'Budi Santoso', { memberCode: 'PIKR_0001-26' });
  await mk('1002', 'Ahmad Abdallah Rafiqi');
  await mk('1003', 'Citra Lestari');
  await ensureMemberIdentity();
  await (await buildRosterWorkbook()).xlsx.writeFile(process.argv[3]);
  console.log('ekspor ok');
} else {
  const { plan, errors, skipped } = await planRosterImport(await parseRosterSheet(fs.readFileSync(process.argv[3])));
  console.log('impor balik: plan', plan.map((p) => `${p.name}=${p.code}${p.changed ? '*' : ''}`).join(', '), '| errors', JSON.stringify(errors), '| skipped', skipped);
}
await prisma.$disconnect();
