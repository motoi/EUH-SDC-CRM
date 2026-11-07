// 配信の一連の流れ（リスト作成 → 配信作成 → 見本 →（任意）テスト用ファイル → 人数確認と送信ファイル → 途中で止まったときの取り込み）を通しで確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
process.env.SESSION_SECRET = 'test';

const { q, one } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { readXlsx } = await import('../src/xlsx-read.js');
const { writeXlsx } = await import('../src/xlsx-write.js');
const app = createApp();

await q(`insert into staff_users (entra_object_id, name, email) values ('t', 'テスト担当', 'staff@example.jp')`);
await q(`insert into events (name, held_on) values ('セミナーA', '2026-01-01')`);
for (const [email, basis] of [['a@example.com', 'opt_in'], ['b@example.com', 'business_card'], ['c@example.com', 'unknown'], ['d@example.com', 'opt_in'], ['e@example.com', 'opt_in']]) {
  const r = await one(`insert into contacts (email, full_name) values ($1, $2) returning id`, [email, `試験 ${email[0]}`]);
  await q(`insert into contact_sources (contact_id, source_kind, consent_basis) values ($1, '手入力', $2)`, [r.id, basis]);
  if (email !== 'd@example.com') await q(`insert into event_participations (contact_id, event_id, status) values ($1, 1, 'attended')`, [r.id]);
}

let cookie = '';
async function req(path, form) {
  const init = { headers: { cookie }, redirect: 'manual' };
  if (form) { init.method = 'POST'; init.body = form instanceof FormData ? form : new URLSearchParams(form); }
  const res = await app.request(path, init);
  const set = res.headers.getSetCookie?.() ?? [];
  for (const s of set) if (s.startsWith('sid=')) cookie = s.split(';')[0];
  return res;
}
const flash = (res) => decodeURIComponent((res.headers.getSetCookie().find((s) => s.startsWith('flash=')) ?? '').split(';')[0].slice(6));
const sheet = async (res) => readXlsx(await res.arrayBuffer())[0];
// Power Automate が送り終えたあとのファイルを作る（状態の列に「送信済み」を入れる）
function finished(rows, sentEmails) {
  const [head, ...body] = rows;
  const i = head.indexOf('状態'), m = head.indexOf('宛先');
  const out = body.map((r) => r.map((v, k) => (k === i && sentEmails.includes(r[m]) ? '送信済み' : v)));
  const form = new FormData();
  form.set('file', new File([writeXlsx({ sheet: '送信', table: '送信', headers: head, rows: out })], '配信.xlsx'));
  return form;
}

test('ログインしないと管理画面は見られない', async () => {
  const res = await req('/contacts');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('配信の一連の流れ', async () => {
  await req('/login', { id: '1' });
  assert.equal((await req('/contacts')).status, 200);

  // 根拠不明の c は対象外。セミナーA参加者は a, b, e の3人
  const cnt = await (await req('/segments/count', { events: '1', event_status: 'attended' })).json();
  assert.equal(cnt.n, 3);

  await req('/segments', { name: 'セミナーA参加者', events: '1', event_status: 'attended' });
  let res = await req('/campaigns', { name: '案内', subject: '{{氏名}}様へご案内', body_text: '{{氏名}} 様\n本文 <b>&</b>', segment_id: '1' });
  assert.equal(res.headers.get('location'), '/campaigns/1');

  // 見本は実際のメールと同じ HTML（記号はエスケープ済み）で表示される
  const pageHtml = await (await req('/campaigns/1')).text();
  assert.match(pageHtml, /<div class="mail"><div lang="ja">試験 a 様<br>\n本文 &lt;b&gt;&amp;&lt;\/b&gt;<br>/);

  // 任意のテスト用ファイル：自分あて1行。本文は HTML で、末尾に署名と配信停止の案内
  res = await req('/campaigns/1/test-file', { to: 'staff@example.jp' });
  assert.match(res.headers.get('content-disposition'), /attachment/);
  let s = await sheet(res);
  assert.equal(s.name, '送信');
  assert.deepEqual(s.rows[0], ['宛先', '件名', '本文', '状態', '番号']);
  assert.deepEqual([s.rows.length, s.rows[1][0], s.rows[1][4]], [2, 'staff@example.jp', 'テスト']);
  assert.match(s.rows[1][1], /^\[テスト\] /);
  assert.match(s.rows[1][2], /叡啓大学<br>[\s\S]*「配信停止」とご返信ください。<\/div>$/);
  assert.equal((await one(`select count(*)::int n from deliveries`)).n, 0);   // テストでは誰にも送ったことにならない

  // 見本確認のチェックがない／人数が違うと書き出せない
  res = await req('/campaigns/1/send-file', { confirm_count: '3' });
  assert.match(flash(res), /見本を確認/);
  res = await req('/campaigns/1/send-file', { confirm_count: '4', preview_checked: '1' });
  assert.match(flash(res), /実際の人数/);

  // 書き出し前に b が配信停止 → 人数から外れ、送信ファイルにも入らない。書き出した人は送信済みとして記録
  await q(`insert into suppressions (email, reason) values ('b@example.com', 'unsubscribe')`);
  res = await req('/campaigns/1/send-file', { confirm_count: '3', preview_checked: '1' });
  assert.match(flash(res), /実際の人数（2人）/);
  res = await req('/campaigns/1/send-file', { confirm_count: '2', preview_checked: '1' });
  s = await sheet(res);
  assert.deepEqual(s.rows.slice(1).map((r) => r[0]), ['a@example.com', 'e@example.com']);
  assert.equal(s.rows[1][1], '試験 a様へご案内');
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'sent');
  let ds = await q(`select email, status from deliveries order by email`);
  assert.deepEqual(ds.map((d) => [d.email, d.status]), [['a@example.com', 'sent'], ['e@example.com', 'sent']]);

  // 二度は書き出せない
  res = await req('/campaigns/1/send-file', { confirm_count: '2', preview_checked: '1' });
  assert.match(flash(res), /もう送信ファイルを書き出しています/);

  // 途中で止まったとき：テスト用・ほかの配信のファイルは取り込めない。e が送れていなければ送り残しに戻る
  res = await req('/campaigns/1/result', finished([['宛先', '件名', '本文', '状態', '番号'], ['staff@example.jp', 'x', 'x', '', 'テスト']], []));
  assert.match(flash(res), /テスト用のファイル/);
  res = await req('/campaigns/1/result', finished([['宛先', '件名', '本文', '状態', '番号'], ['z@example.com', 'x', 'x', '', '999']], []));
  assert.match(flash(res), /別の配信/);
  res = await req('/campaigns/1/result', finished(s.rows, ['a@example.com']));
  assert.match(flash(res), /1人が送り残し/);
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'exported');

  // 送り残しだけのファイル
  s = await sheet(await req('/campaigns/1/rest-file', {}));
  assert.deepEqual(s.rows.slice(1).map((r) => r[0]), ['e@example.com']);
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'sent');
  ds = await q(`select email, status from deliveries where status = 'sent' order by email`);
  assert.deepEqual(ds.map((d) => d.email), ['a@example.com', 'e@example.com']);
  assert.equal((await req('/campaigns/1')).status, 200);
});

test('送り残しには送らずに終えられる', async () => {
  await req('/campaigns', { name: '案内2', subject: '件名', body_text: '本文', segment_id: '1' });
  const s = await sheet(await req('/campaigns/2/send-file', { confirm_count: '2', preview_checked: '1' }));
  await req('/campaigns/2/result', finished(s.rows, []));   // 誰にも送れなかった
  assert.equal((await one(`select count(*)::int n from deliveries where campaign_id = 2 and status = 'queued'`)).n, 2);
  await req('/campaigns/2/cancel', {});
  assert.equal((await one(`select status from campaigns where id = 2`)).status, 'cancelled');
  assert.equal((await one(`select count(*)::int n from deliveries where campaign_id = 2 and status = 'queued'`)).n, 0);
  assert.equal((await req('/campaigns/2/rest-file', {})).status, 302);   // もう書き出せない
});

test('同じ配信で同じアドレスに二度は送らない', async () => {
  await assert.rejects(q(`insert into deliveries (campaign_id, email) values (1, 'A@EXAMPLE.COM')`));
});

test('管理画面は管理者だけが開ける', async () => {
  await q(`insert into staff_users (entra_object_id, name, email, role) values ('a', '管理テスト', 'admin@example.jp', 'admin')`);
  await req('/login', { id: '1' });
  assert.equal((await req('/admin')).status, 403);
  await req('/login', { id: '2' });
  assert.equal((await req('/admin')).status, 200);
  await req('/admin/suppressions/lift', { email: 'b@example.com' });
  assert.equal(await one(`select 1 from suppressions where email = 'b@example.com'`), undefined);
});

test('興味分類はカンマ区切りで入力でき、新しい単語は興味の一覧に加わる', async () => {
  await req('/login', { id: '1' });
  const res = await req('/contacts', {
    full_name: 'サンプル 花子', org_name: '株式会社サンプル商事', department: '新規事業部', job_title: '部長', email: 'hanako@example.jp',
    location: '広島県広島市中区', size_class: '中堅企業', industry: 'サービス', interests: '新規事業,リベラルアーツ、 新規事業',
    source_kind: '名刺交換', consent_basis: 'business_card',
  });
  const id = res.headers.get('location').split('/').pop();
  const names = await q(`select i.name from contact_interests ci join interests i on i.id = ci.interest_id where ci.contact_id = $1 order by i.name`, [id]);
  assert.deepEqual(names.map((n) => n.name), ['リベラルアーツ', '新規事業']);
  const org = await one(`select size_class, industry, location from organizations where name = '株式会社サンプル商事'`);
  assert.deepEqual(org, { size_class: '中堅企業', industry: 'サービス', location: '広島県広島市中区' });

  // 企業分類1・企業分類2・所在地（都道府県）・興味分類で絞り込める
  const ints = await q(`select id from interests where name = '新規事業'`);
  const cnt = await (await req('/segments/count', { interests: String(ints[0].id), size_classes: '中堅企業', industries: 'サービス', prefectures: '広島県' })).json();
  assert.equal(cnt.n, 1);
});
