// Mengisi DB SANDBOX dengan N anggota sintetis (default 300). Tidak menyentuh DB live.
import prisma from './src/config/db.js';
import { ensureMemberIdentity } from './src/utils/slug.js';

const N = Number(process.argv[2] || 300);
const first = ['Ahmad', 'Aisyah', 'Andi', 'Anisa', 'Bayu', 'Budi', 'Citra', 'Dimas', 'Eka', 'Fajar', 'Gita', 'Hana', 'Indra', 'Joko', 'Kirana', 'Lukman', 'Maya', 'Nadia', 'Rizki', 'Salsa', 'Tegar', 'Wulan', 'Yoga', 'Zahra', 'Abdallah', 'Rafiqi', 'Ratu', 'Syakira', 'Kenzie', 'Dede', 'Yiara', 'Muhammad'];
const last = ['Fauzi', 'Putri', 'Pratama', 'Rahma', 'Saputra', 'Santoso', 'Ayu', 'Arya', 'Nugraha', 'Lestari', 'Safitri', 'Wijaya', 'Susilo', 'Dewi', 'Hakim', 'Sari', 'Zahra', 'Ramadhan', 'Billa', 'Amelia', 'Rafiqi', 'Anugrah', 'Harizon', 'Mahardika'];
const cls = ['X-1', 'X-2', 'X-3', 'XI-1', 'XI-2', 'XI-3', 'XII-1'];
for (const t of ['attendanceLog', 'attendance', 'attendanceSession', 'orgMember', 'member']) await prisma[t].deleteMany();
const used = new Set();
let made = 0;
for (let i = 0; made < N; i++) {
  const name = `${first[i % first.length]} ${first[(i * 7 + 3) % first.length]} ${last[(i * 5 + 1) % last.length]}`;
  if (used.has(name)) continue;
  used.add(name);
  await prisma.member.create({
    data: {
      nisn: `9${String(made).padStart(9, '0')}`, name, className: cls[made % cls.length], whatsappNumber: '0', email: `s${made}@x`,
      gender: made % 2 ? 'P' : 'L', password: 'x', memberCode: `PIKR_${String(made + 1).padStart(4, '0')}-26`,
      createdAt: new Date(Date.now() - 30 * 864e5 + made * 6e4)
    }
  });
  made++;
}
await ensureMemberIdentity();
console.log('anggota sandbox:', await prisma.member.count());
await prisma.$disconnect();
