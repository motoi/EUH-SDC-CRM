// 配信の一連の流れ（リスト作成 → 配信作成 → テスト用ファイル → 人数確認 → 送信ファイル → 結果の取り込み）を通しで確かめる
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

  // テスト前は確定できない
  res = await req('/campaigns/1/confirm', { confirm_count: '3', test_checked: '1' });
  assert.match(flash(res), /テストが済んでいません/);

  // テスト用ファイル：自分あて1行。本文は HTML（改行は <br>、記号はエスケープ）で、末尾に署名と配信停止の案内
  res = await req('/campaigns/1/test-file', { to: 'staff@example.jp' });
  assert.match(res.headers.get('content-disposition'), /attachment/);
  let s = await sheet(res);
  assert.equal(s.name, '送信');
  assert.deepEqual(s.rows[0], ['宛先', '件名', '本文', '状態', '番号']);
  assert.equal(s.rows.length, 2);
  assert.deepEqual([s.rows[1][0], s.rows[1][3], s.rows[1][4]], ['staff@example.jp', '', 'テスト']);
  assert.match(s.rows[1][1], /^\[テスト\] /);
  assert.match(s.rows[1][2], /^<div lang="ja">.* 様<br>\n本文 &lt;b&gt;&amp;&lt;\/b&gt;<br>/);
  assert.match(s.rows[1][2], /叡啓大学<br>[\s\S]*「配信停止」とご返信ください。<\/div>$/);
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'test_sent');

  // テストメールの確認にチェックがないと確定できない／人数を間違えると確定できない
  res = await req('/campaigns/1/confirm', { confirm_count: '3' });
  assert.match(flash(res), /テストメールが届いた/);
  res = await req('/campaigns/1/confirm', { confirm_count: '4', test_checked: '1' });
  assert.match(flash(res), /実際の人数/);
  await req('/campaigns/1/confirm', { confirm_count: '3', test_checked: '1' });
  assert.equal((await one(`select count(*)::int n from deliveries where campaign_id = 1`)).n, 3);

  // 確定後に b が配信停止 → 送信ファイルに入らない
  await q(`insert into suppressions (email, reason) values ('b@example.com', 'unsubscribe')`);
  s = await sheet(await req('/campaigns/1/file'));
  assert.deepEqual(s.rows.slice(1).map((r) => r[0]), ['a@example.com', 'e@example.com']);
  assert.equal(s.rows[1][1], '試験 a様へご案内');

  // テスト用のファイルや、ほかの配信のファイルは取り込めない
  res = await req('/campaigns/1/result', finished([['宛先', '件名', '本文', '状態', '番号'], ['staff@example.jp', 'x', 'x', '送信済み', 'テスト']], ['staff@example.jp']));
  assert.match(flash(res), /テスト用のファイル/);
  res = await req('/campaigns/1/result', finished([['宛先', '件名', '本文', '状態', '番号'], ['z@example.com', 'x', 'x', '送信済み', '999']], ['z@example.com']));
  assert.match(flash(res), /別の配信/);

  // a だけ送れた結果を取り込む → 次の送信ファイルには e だけ
  res = await req('/campaigns/1/result', finished(s.rows, ['a@example.com']));
  assert.match(flash(res), /1人を送信済み.*まだ送っていない人が1人/);
  s = await sheet(await req('/campaigns/1/file'));
  assert.deepEqual(s.rows.slice(1).map((r) => r[0]), ['e@example.com']);

  res = await req('/campaigns/1/result', finished(s.rows, ['e@example.com']));
  assert.match(flash(res), /送信完了/);
  const ds = await q(`select email, status from deliveries order by email`);
  assert.deepEqual(ds.map((d) => [d.email, d.status]), [['a@example.com', 'sent'], ['b@example.com', 'skipped'], ['e@example.com', 'sent']]);
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'sent');
  assert.equal((await req('/campaigns/1')).status, 200);
});

test('途中で終えると、残りは送らなかったことになる', async () => {
  await req('/campaigns', { name: '案内2', subject: '件名', body_text: '本文', segment_id: '1' });
  await req('/campaigns/2/test-file', { to: 'staff@example.jp' });
  await req('/campaigns/2/confirm', { confirm_count: '2', test_checked: '1' });   // b は配信停止済みなので2人
  await req('/campaigns/2/cancel', {});
  assert.equal((await one(`select status from campaigns where id = 2`)).status, 'cancelled');
  assert.equal((await one(`select count(*)::int n from deliveries where campaign_id = 2 and status = 'queued'`)).n, 0);
  assert.equal((await req('/campaigns/2/file')).status, 302);   // もう書き出せない
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
