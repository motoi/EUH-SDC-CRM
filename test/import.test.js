// Excel 取り込み：ファイルを読む → 確認画面 → 取り込む、を通しで確かめる（データはすべて架空）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';

process.env.PGLITE_DIR = 'memory://';
process.env.SESSION_SECRET = 'test';
const { q, one } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { readXlsx } = await import('../src/xlsx-read.js');
const app = createApp();

// テスト用に、最小限の .xlsx（無圧縮の zip）を作る
function makeXlsx(sheetName, rows, more = []) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col = (i) => String.fromCharCode(65 + i);
  const all = [[sheetName, rows], ...more];
  const sheetXml = (rs) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    rs.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === '' ? '' : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')
  }</sheetData></worksheet>`;
  const files = {
    'xl/workbook.xml': `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${all.map(([n], i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${all.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ...Object.fromEntries(all.map(([, rs], i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(rs)])),
  };
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text), nm = Buffer.from(name), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const H = ['氏名', '企業・団体名', '部署', '役職', 'メールアドレス', '団体所在地', '企業分類1', '企業分類2', '興味分類'];
const ROWS = [H,
  ['見本 一郎', '株式会社サンプル物産', '経営企画部', '代表取締役', 'Ichiro@Example.jp', '広島県広島市中区', '中堅企業', '卸売', '新規事業,DX'],
  ['見本 二郎', '株式会社サンプル物産', 'なし', '課長', 'jiro@example.jp', '', '', '', 'リベラルアーツ、新規事業'],
  ['見本 三郎', '株式会社サンプル物産', '営業部', '主任', 'jiro@example.jp', '', '', '', ''],
  ['', '株式会社サンプル食品', '総務部', '部長', 'nanashi@example.jp', '', '', '', ''],
  ['見本 四子', '株式会社サンプル食品', '総務部', '一般', 'shiko@example', '', '零細', '', ''],
  ['既存 太郎', '株式会社サンプル既存', '', 'シニアマネージャー', 'kizon@example.jp', '', '', '', '新規事業'],
];

let cookie = '';
async function req(path, body) {
  const res = await app.request(path, { method: body ? 'POST' : 'GET', body, headers: { cookie }, redirect: 'manual' });
  for (const s of res.headers.getSetCookie?.() ?? []) if (s.startsWith('sid=')) cookie = s.split(';')[0];
  return res;
}

await q(`insert into staff_users (entra_object_id, name, email) values ('t', 'テスト担当', 'staff@example.jp')`);
const org = await one(`insert into organizations (name, normalized_name) values ('株式会社サンプル既存', 'サンプル既存') returning id`);
const old = await one(`insert into contacts (full_name, email, organization_id, department, job_title) values ('既存 太郎', 'kizon@example.jp', $1, '人事部', '課長') returning id`, [org.id]);
await q(`insert into interests (name) values ('人材育成')`);
await q(`insert into contact_interests (contact_id, interest_id) values ($1, 1)`, [old.id]);

test('作った .xlsx を読み戻せる', () => {
  const [s] = readXlsx(makeXlsx('顧客', ROWS));
  assert.equal(s.name, '顧客');
  assert.deepEqual(s.rows[0], H);
  assert.equal(s.rows[1][0], '見本 一郎');
});

test('Excel を取り込む：確認画面ではまだ変わらず、取り込むと判定どおりに入る', async () => {
  await req('/login', new URLSearchParams({ id: '1' }));
  const form = new FormData();
  form.set('file', new File([makeXlsx('顧客', ROWS)], '名刺.xlsx'));
  form.set('source_kind', '名刺交換');
  form.set('consent_basis', 'business_card');
  const res = await req('/contacts/import', form);
  const id = res.headers.get('location').split('/').pop();

  const b = await one(`select * from import_batches where id = $1`, [id]);
  assert.deepEqual(b.staged.summary, { total: 6, create: 2, update: 1, skip: 1, error: 2 });
  const byLine = Object.fromEntries(b.staged.rows.map((r) => [r.line, r.action]));
  assert.deepEqual(byLine, { 2: 'create', 3: 'create', 4: 'skip', 5: 'error', 6: 'error', 7: 'update' });
  assert.equal((await one(`select count(*)::int n from contacts`)).n, 1);   // 確認画面の時点ではまだ1人

  assert.equal((await req(`/contacts/import/${id}`)).status, 200);
  await req(`/contacts/import/${id}/apply`, new URLSearchParams());

  const ichiro = await one(`select c.*, o.size_class, o.location from contacts c join organizations o on o.id = c.organization_id where c.email = 'ichiro@example.jp'`);
  assert.equal(ichiro.job_level, '経営層');
  assert.equal(ichiro.size_class, '中堅企業');
  const jiro = await one(`select department from contacts where email = 'jiro@example.jp'`);
  assert.equal(jiro.department, null);   // 「なし」は空欄扱い

  // 既存の人：空欄で消さず、役職は上書き、興味は足される
  const k = await one(`select department, job_title, job_level from contacts where id = $1`, [old.id]);
  assert.deepEqual(k, { department: '人事部', job_title: 'シニアマネージャー', job_level: '課長級' });
  const ints = await q(`select i.name from contact_interests ci join interests i on i.id = ci.interest_id where ci.contact_id = $1 order by i.name`, [old.id]);
  assert.deepEqual(ints.map((i) => i.name).sort(), ['人材育成', '新規事業'].sort());

  const src = await one(`select count(*)::int n from contact_sources where import_batch_id = $1 and consent_basis = 'business_card'`, [id]);
  assert.equal(src.n, 3);
  const done = await one(`select status, staged, created_count, updated_count, skipped_count from import_batches where id = $1`, [id]);
  assert.deepEqual(done, { status: 'done', staged: null, created_count: 2, updated_count: 1, skipped_count: 3 });
});

test('必要な列がないファイルは確認画面に進めない', async () => {
  const form = new FormData();
  form.set('file', new File([makeXlsx('Sheet1', [['名前', '会社'], ['見本', 'サンプル']])], 'x.xlsx'));
  form.set('consent_basis', 'opt_in');
  const res = await req('/contacts/import', form);
  assert.equal(res.headers.get('location'), '/contacts/import');
  const flash = decodeURIComponent(res.headers.getSetCookie().find((s) => s.startsWith('flash=')).split(';')[0].slice(6));
  assert.match(flash, /Sheet1.*メールアドレス/);
});

test('顧客以外のシートは、シート名のイベントの参加者として記録する（メールアドレスで照合）', async () => {
  const EV = [['メールアドレス', '氏名', '企業・団体名', '参加状況'],
    ['ICHIRO@example.jp', '', '', ''],                       // 登録済み（前のテストで追加）→ 参加
    ['kizon@example.jp', '', '', 'キャンセル'],              // 登録済み → キャンセル
    ['shinki@example.jp', '見本 新子', '株式会社サンプル新規', '申込'],   // 新しい人 → 追加して申込
    ['nanashi2@example.jp', '', '', ''],                    // 未登録で氏名なし → エラー
    ['', '見本 無名', '', ''],                               // メールなし → エラー
    ['hachi@example.jp', '見本 八子', '', '見学'],           // 参加状況が不正 → エラー
  ];
  const form = new FormData();
  form.set('file', new File([makeXlsx('顧客', [H, ['見本 九郎', '株式会社サンプル物産', '', '', 'kuro@example.jp', '', '', '', '']], [['DXセミナー 2026冬', EV]])], 'イベント.xlsx'));
  form.set('source_kind', '名刺交換');
  form.set('consent_basis', 'opt_in');
  const res = await req('/contacts/import', form);
  const id = res.headers.get('location').split('/').pop();
  const b = await one(`select staged from import_batches where id = $1`, [id]);
  const ev = b.staged.sheets.find((x) => x.event);
  assert.deepEqual([ev.event, ev.eventNote, ev.create, ev.update, ev.error], ['DXセミナー 2026冬', '新しく作るイベント', 1, 2, 3]);

  await req(`/contacts/import/${id}/apply`, new URLSearchParams());
  const parts = await q(`select c.email::text, ep.status from event_participations ep join contacts c on c.id = ep.contact_id
    join events e on e.id = ep.event_id where e.name = 'DXセミナー 2026冬' order by c.email`);
  assert.deepEqual(parts.map((p) => [p.email, p.status]), [['ichiro@example.jp', 'attended'], ['kizon@example.jp', 'cancelled'], ['shinki@example.jp', 'applied']]);
  assert.ok(await one(`select 1 from contacts where email = 'kuro@example.jp'`));
  const src = await one(`select c.source_kind, c.source_detail from contact_sources c join contacts p on p.id = c.contact_id where p.email = 'shinki@example.jp'`);
  assert.deepEqual(src, { source_kind: 'イベント申込', source_detail: 'DXセミナー 2026冬' });
});

test('連絡先はメールアドレスなしでは登録できない', async () => {
  await assert.rejects(q(`insert into contacts (full_name) values ('メールなし')`));
});

test('取り込みで作られたイベントに、あとから日付を入れられる', async () => {
  const ev = await one(`select id from events where name = 'DXセミナー 2026冬'`);
  assert.equal((await req(`/masters/events/${ev.id}`)).status, 200);
  await req(`/masters/events/${ev.id}`, new URLSearchParams({ name: 'DXセミナー 2026冬', held_on: '2026-12-05', kind: 'セミナー', format: '対面' }));
  const e = await one(`select to_char(held_on, 'YYYY-MM-DD') d, kind from events where id = $1`, [ev.id]);
  assert.deepEqual(e, { d: '2026-12-05', kind: 'セミナー' });
});
