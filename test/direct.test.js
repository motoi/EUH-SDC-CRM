// 直接送る形（送り方 outbox）の一連の流れ：リスト作成 → 配信作成 → テスト送信 → 人数確認と予約 → 少しずつ送信。送信箱に保存されるだけで実際には送らない
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
process.env.SESSION_SECRET = 'test';
process.env.SEND_PER_MINUTE = '2';
process.env.SEND_MODE = 'outbox';

const { q, one } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');
const { tick } = await import('../src/sender.js');
const app = createApp();

await q(`insert into staff_users (entra_object_id, name, email) values ('t', 'テスト担当', 'staff@example.jp')`);
await q(`insert into events (name, held_on) values ('セミナーA', '2026-01-01')`);
for (const [email, basis] of [['a@example.com', 'opt_in'], ['b@example.com', 'business_card'], ['c@example.com', 'unknown'], ['d@example.com', 'opt_in']]) {
  const r = await one(`insert into contacts (email, full_name) values ($1, $2) returning id`, [email, `試験 ${email[0]}`]);
  await q(`insert into contact_sources (contact_id, source_kind, consent_basis) values ($1, '手入力', $2)`, [r.id, basis]);
  if (email !== 'd@example.com') await q(`insert into event_participations (contact_id, event_id, status) values ($1, 1, 'attended')`, [r.id]);
}

let cookie = '';
async function req(path, form) {
  const init = { headers: { cookie }, redirect: 'manual' };
  if (form) { init.method = 'POST'; init.body = new URLSearchParams(form); }
  const res = await app.request(path, init);
  const set = res.headers.getSetCookie?.() ?? [];
  for (const s of set) if (s.startsWith('sid=')) cookie = s.split(';')[0];
  return res;
}
const flash = (res) => decodeURIComponent((res.headers.getSetCookie().find((s) => s.startsWith('flash=')) ?? '').split(';')[0].slice(6));

test('直接送る形：配信の一連の流れ', async () => {
  await req('/login', { id: '1' });
  assert.equal((await req('/contacts')).status, 200);

  // 根拠不明の c は対象外。セミナーA参加者は a, b の2人
  const cnt = await (await req('/segments/count', { events: '1', event_status: 'attended' })).json();
  assert.equal(cnt.n, 2);

  await req('/segments', { name: 'セミナーA参加者', events: '1', event_status: 'attended' });
  let res = await req('/campaigns', { name: '案内', subject: '{{氏名}}様へご案内', body_text: '{{氏名}} 様\n本文', segment_id: '1' });
  assert.equal(res.headers.get('location'), '/campaigns/1');

  // テスト送信前は予約できない
  res = await req('/campaigns/1/confirm', { confirm_count: '2' });
  assert.match(flash(res), /テスト送信が済んでいません/);

  await req('/campaigns/1/test', { to: 'staff@example.jp' });
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'test_sent');

  // 人数を間違えると予約できない
  res = await req('/campaigns/1/confirm', { confirm_count: '3' });
  assert.match(flash(res), /実際の人数/);

  await req('/campaigns/1/confirm', { confirm_count: '2' });
  assert.equal((await one(`select count(*)::int n from deliveries where campaign_id = 1`)).n, 2);

  // 予約後に b が配信停止（返信を見て担当者が止めた）→ 送らない
  await q(`insert into suppressions (email, reason) values ('b@example.com', 'unsubscribe')`);

  await tick();
  const ds = await q(`select email, status from deliveries order by email`);
  assert.deepEqual(ds.map((d) => [d.email, d.status]), [['a@example.com', 'sent'], ['b@example.com', 'skipped']]);
  assert.equal((await one(`select status from campaigns where id = 1`)).status, 'sent');

  const sent = await q(`select to_address::text, subject from outbox_messages order by id`);
  assert.deepEqual(sent.map((m) => m.to_address), ['staff@example.jp', 'a@example.com']);   // テスト送信 1通 + 本番 1通
  assert.equal(sent[1].subject, '試験 a様へご案内');
});

test('送信箱（確認用）で、送ったことにしたメールを読める', async () => {
  const res = await req('/outbox');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /試験 a様へご案内/);
  const m = await one(`select body_text from outbox_messages where to_address = 'a@example.com'`);
  assert.match(m.body_text, /「配信停止」とご返信ください。$/);   // 配信停止は返信で受け付ける
});
