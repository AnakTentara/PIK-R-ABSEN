// Server uji untuk frontend: API absensi di port 25552 dengan data contoh
import express from 'express';
import prisma from './src/config/db.js';
import absenRoutes from './src/routes/absen.js';
import { ensureAbsenAccount } from './src/middlewares/authAbsen.js';
import { ensureMemberIdentity } from './src/utils/slug.js';

const names = ['Ahmad Fauzi','Aisyah Putri','Andi Pratama','Anisa Rahma','Bayu Saputra','Budi Santoso','Citra Ayu','Dimas Arya','Eka Putri','Fajar Nugraha','Gita Lestari','Hana Safitri','Indra Wijaya','Joko Susilo','Kirana Dewi','Lukman Hakim','Maya Sari','Nadia Zahra','Rizki Ramadhan','Salsa Billa','Tegar Pratama','Wulan Sari','Yoga Pratama','Zahra Amelia'];
if (!(await prisma.member.count({ where: { nisn: { startsWith: 'demo' } } }))) {
  for (const t of ['attendanceLog','attendance','attendanceSession','orgMember','member']) await prisma[t].deleteMany();
  for (const [i, n] of names.entries()) {
    await prisma.member.create({ data: { nisn: `demo${i}`, name: n, className: ['X-1','X-2','XI-1','XI-3'][i % 4], whatsappNumber: '0', email: `d${i}@x`, gender: i % 2 ? 'P' : 'L', password: 'x', createdAt: new Date(Date.now() - 30*864e5 + i*6e4) } });
  }
  const b = await prisma.member.findFirst({ where: { name: 'Budi Santoso' } });
  await prisma.orgMember.create({ data: { name: b.name, role: 'KETUA', jabatan: 'Ketua Umum', yearStart: 2026, isCurrent: true, memberId: b.id } });
}
await prisma.setting.deleteMany({ where: { key: { startsWith: 'absen_' } } });
await ensureAbsenAccount();
await ensureMemberIdentity();

const app = express();
app.use(express.json());
app.use('/api/absen', absenRoutes);
app.listen(25552, () => console.log('SANDBOX API READY 25552'));
