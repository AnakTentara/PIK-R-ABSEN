// Uji desain situs & kartu biodata (sanitasi, tema, kartu anggota) di sandbox
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from './src/config/db.js';
import {
  sanitizeDesign, sanitizeCardConfig, toCssVars, getDesign, saveDesign, THEMES, DEFAULT_DESIGN, deriveTheme
} from './src/utils/designConfig.js';
import { getPublicDesign, getMyCard, updateMyCard, adminUpdateMemberCard } from './src/controllers/design.js';
import { getPublicProfile } from './src/controllers/absen.js';
import { ensureMemberIdentity } from './src/utils/slug.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}
for (const t of ['orgMember', 'member']) await prisma[t].deleteMany();
await prisma.setting.deleteMany({ where: { key: 'SITE_DESIGN' } });

console.log('\nSanitasi desain');
await test('nilai di luar daftar putih jatuh ke bawaan; tidak ada nilai bebas yang lolos', () => {
  const d = sanitizeDesign({ theme: '<script>', font: 'comic', radius: 'x', shadow: 'url(javascript:1)', customAccent: 'red; background:url(x)', card: { style: 'aneh', cover: 'foto', defaultThumb: 'http://evil.com/x.png', hidden: ['bio', 'rahasia'] } });
  assert.equal(d.theme, 'jingga');
  assert.equal(d.font, 'bawaan');
  assert.equal(d.customAccent, null);
  assert.equal(d.card.style, 'portofolio');
  assert.equal(d.card.cover, 'gradasi');            // "foto" tidak sah sebagai cover global
  assert.equal(d.card.defaultThumb, null);          // hanya /uploads/...
  assert.deepEqual(d.card.hidden, ['bio']);
});
await test('warna bebas hanya hex 6 digit; tema turunan dihitung', () => {
  assert.equal(sanitizeDesign({ customAccent: '#ABCDEF' }).customAccent, '#abcdef');
  assert.equal(sanitizeDesign({ customAccent: '#abc' }).customAccent, null);
  const t = deriveTheme('#0ea5e9');
  assert.match(t.soft, /^rgba\(14,165,233,/);
  assert.match(t.hover, /^#[0-9a-f]{6}$/);
});
await test('toCssVars: variabel tema + tema gelap menimpa warna latar', () => {
  const v = toCssVars(sanitizeDesign({ theme: 'laut' }));
  assert.equal(v['--color-accent'], THEMES.laut.accent);
  assert.equal(v['--color-bg'], undefined);
  const dark = toCssVars(sanitizeDesign({ theme: 'malam' }));
  assert.equal(dark['--color-bg'], '#0f172a');
  const custom = toCssVars(sanitizeDesign({ theme: 'malam', customAccent: '#16a34a' }));
  assert.equal(custom['--color-bg'], undefined);     // warna bebas tidak ikut menggelapkan situs
  for (const val of Object.values(toCssVars(sanitizeDesign({ theme: 'mawar', font: 'klasik' })))) assert.ok(!/[<>]|javascript:/i.test(val), val);
});
await test('simpan & baca desain dari database', async () => {
  assert.deepEqual(await getDesign(), DEFAULT_DESIGN);
  await saveDesign({ theme: 'hutan', radius: 'bulat', card: { style: 'kaca', hidden: ['gender'] } });
  const d = await getDesign();
  assert.equal(d.theme, 'hutan');
  assert.equal(d.radius, 'bulat');
  assert.equal(d.card.style, 'kaca');
  assert.deepEqual(d.card.hidden, ['gender']);
});

console.log('\nSanitasi kartu anggota');
await test('kartu: info dibatasi 6 butir & disaring HTML, ikon tidak dikenal -> star, foto hanya /uploads', () => {
  const c = sanitizeCardConfig({
    cover: 'gelombang', accent: '#FF0000', cardPhoto: '/uploads/photos/a.png', coverPhoto: 'https://evil/x.png',
    hidden: ['kelas', 'x'],
    info: [
      { icon: 'trophy', label: 'Prestasi', value: 'Juara <b>1</b> OSN' },
      { icon: 'bom', label: 'Hobi', value: 'Membaca' },
      { icon: 'star', label: '', value: 'tanpa label' },
      ...Array.from({ length: 10 }, (_, i) => ({ icon: 'star', label: `L${i}`, value: `V${i}` }))
    ]
  });
  assert.equal(c.cover, 'gelombang');
  assert.equal(c.accent, '#ff0000');
  assert.equal(c.cardPhoto, '/uploads/photos/a.png');
  assert.equal(c.coverPhoto, null);
  assert.deepEqual(c.hidden, ['kelas']);
  assert.equal(c.info.length, 6);
  assert.equal(c.info[0].value, 'Juara b1/b OSN');
  assert.equal(c.info[1].icon, 'star');
  assert.ok(c.info.every((i) => i.label && i.value));
});
await test('path foto dengan ".." atau skema lain ditolak', () => {
  assert.equal(sanitizeCardConfig({ cardPhoto: '/uploads/../.env' }).cardPhoto, null);
  assert.equal(sanitizeCardConfig({ cardPhoto: 'javascript:alert(1)' }).cardPhoto, null);
});

console.log('\nEndpoint');
const app = express();
app.use(express.json());
const SECRET = process.env.JWT_SECRET || 'supersecretkeypikrmanseku123';
const authAs = (id) => (req, res, next) => { req.candidate = { id, role: 'candidate' }; next(); };
let currentId = null;
app.use((req, res, next) => authAs(currentId)(req, res, next));
app.get('/api/public/design', getPublicDesign);
app.get('/api/me/card', getMyCard);
app.put('/api/me/card', updateMyCard);
app.put('/api/admin/members/:id/card', adminUpdateMemberCard);
app.get('/api/public/profile/:slug', getPublicProfile);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json(), headers: r.headers };
};

const mk = (nisn, name, extra = {}) => prisma.member.create({ data: { nisn, name, className: 'XI-1', whatsappNumber: '0', email: 'x@x', gender: 'L', password: 'x', ...extra } });
const a = await mk('7001', 'Anggota Kartu');
const b = await mk('7002', 'Anggota Lain');
await ensureMemberIdentity();

await test('GET /public/design: desain + variabel CSS, di-cache 60 dtk', async () => {
  const r = await call('GET', '/api/public/design');
  assert.equal(r.status, 200);
  assert.equal(r.body.design.theme, 'hutan');
  assert.equal(r.body.vars['--color-accent'], THEMES.hutan.accent);
  assert.match(r.headers.get('cache-control'), /max-age=60/);
});
await test('anggota mengatur kartunya sendiri: cover, info, sembunyikan bagian, bio dari profil', async () => {
  currentId = a.id;
  const put = await call('PUT', '/api/me/card', { cover: 'titik', accent: '#8b5cf6', hidden: ['asalSekolah'], bio: 'Motto saya', info: [{ icon: 'music', label: 'Hobi', value: 'Bermain gitar' }] });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  const get = await call('GET', '/api/me/card');
  assert.equal(get.body.card.cover, 'titik');
  assert.equal(get.body.card.info[0].value, 'Bermain gitar');
  assert.equal(get.body.bio, 'Motto saya');
  assert.equal(get.body.allowEdit, true);
});
await test('profil publik membawa kartu + desain kartu; data pribadi tetap tidak bocor', async () => {
  const slug = (await prisma.member.findUnique({ where: { id: a.id } })).slug;
  const r = await call('GET', `/api/public/profile/${slug}`);
  assert.equal(r.body.card.cover, 'titik');
  assert.deepEqual(r.body.card.hidden, ['asalSekolah']);
  assert.equal(r.body.bio, 'Motto saya');
  assert.equal(r.body.cardDesign.style, 'kaca');
  for (const k of ['nisn', 'whatsappNumber', 'email', 'password', 'plainPassword', 'cardConfig']) assert.equal(r.body[k], undefined, k);
});
await test('cover "foto" tanpa foto dikembalikan ke bawaan; payload jahat disaring', async () => {
  currentId = a.id;
  await call('PUT', '/api/me/card', { cover: 'foto', info: [{ icon: 'x', label: '<img onerror=1>', value: 'ok' }], accent: 'url(x)' });
  const c = (await call('GET', '/api/me/card')).body.card;
  assert.equal(c.cover, null);
  assert.equal(c.accent, null);
  assert.ok(!/[<>]/.test(c.info[0].label));
});
await test('admin mengunci pengaturan kartu: anggota ditolak 403', async () => {
  await saveDesign({ ...(await getDesign()), card: { ...(await getDesign()).card, allowMemberEdit: false } });
  currentId = a.id;
  assert.equal((await call('PUT', '/api/me/card', { cover: 'garis' })).status, 403);
  await saveDesign({ ...(await getDesign()), card: { ...(await getDesign()).card, allowMemberEdit: true } });
});
await test('admin mereset kartu anggota ke bawaan', async () => {
  const r = await call('PUT', `/api/admin/members/${a.id}/card`, { reset: true });
  assert.equal(r.status, 200);
  assert.equal((await prisma.member.findUnique({ where: { id: a.id } })).cardConfig, null);
  assert.equal((await call('PUT', '/api/admin/members/tidak-ada/card', { reset: true })).status, 404);
});
await test('kandidat/akun tanpa Member -> 404, anggota lain tidak terpengaruh', async () => {
  currentId = 'bukan-member';
  assert.equal((await call('GET', '/api/me/card')).status, 404);
  currentId = b.id;
  assert.equal((await call('GET', '/api/me/card')).body.card.cover, null);
});

console.log(`\n${passed} test lulus${process.exitCode ? ', ADA YANG GAGAL' : ''}.`);
server.close();
await prisma.setting.deleteMany({ where: { key: 'SITE_DESIGN' } });
await prisma.$disconnect();
