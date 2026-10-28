// 確認用サイトに載るダミーデータが、実在の人・組織と取り違えようのないものだけかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.PGLITE_DIR = 'memory://';
const { q, tx } = await import('../src/db.js');
const { seed } = await import('../src/seed-data.js');
await tx((run) => seed(run));

test('メールアドレスは送信されない予約ドメイン（example.com / example.jp）だけ', async () => {
  const bad = await q(`select email from contacts where email is not null and email::text !~ '@example\\.(com|jp)$'
    union all select email from staff_users where email::text !~ '@example\\.(com|jp)$'`);
  assert.deepEqual(bad, []);
});

test('組織名はすべて架空と分かる名前', async () => {
  const bad = await q(`select name from organizations where name not like '%サンプル%'`);
  assert.deepEqual(bad, []);
});

test('確認用サイトの入口は、ダミーデータ以外を読み込まない', async () => {
  const src = await readFile(new URL('../demo/main.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/import[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['../db/schema.sql', '../src/app.js', '../src/db.js', '../src/seed-data.js', '../src/sender.js', './pglite/contrib/citext.js', './pglite/index.js'].sort());
});
