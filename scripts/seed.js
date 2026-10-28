// 使い方: npm run seed   （既存のデータベースを消して、ダミーデータで作り直す）
import { rm } from 'node:fs/promises';

if (!process.env.DATABASE_URL) await rm(process.env.PGLITE_DIR ?? '.data/pglite', { recursive: true, force: true });
const { q } = await import('../src/db.js');
const { seed } = await import('../src/seed-data.js');

await seed(q);
const [{ n }] = await q(`select count(*)::int n from contacts`);
const [{ m }] = await q(`select count(*)::int m from sendable_contacts`);
console.log(`ダミーデータを作成しました：連絡先 ${n}件（うち送信できる ${m}件）`);
process.exit(0);
