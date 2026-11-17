// Graph での送信部分：実際には通信せず、送ろうとした中身を確かめる（値はすべてテスト用）
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SEND_MODE = 'graph';
process.env.GRAPH_TENANT_ID = 'tenant-test';
process.env.GRAPH_CLIENT_ID = 'client-test';
process.env.GRAPH_CLIENT_SECRET = 'secret-test';

const calls = [];
let sendStatus = 202;
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/oauth2/')) return new Response(JSON.stringify({ access_token: 'token-test', expires_in: 3600 }), { status: 200 });
  return new Response(sendStatus === 202 ? null : '{"error":{"code":"x"}}', { status: sendStatus, headers: { 'retry-after': '30' } });
};
const { mailer, RetryLater } = await import('../src/mailer.js');

test('共有メールボックスから、UTF-8 のテキストメールをまるごと組み立てて送る', async () => {
  await mailer.send({ to: 'a@example.com', subject: '件名\nBcc: x@example.com', text: '本文\n2行目', deliveryId: 7 });
  const [tok, send] = calls;
  assert.match(tok.url, /login\.microsoftonline\.com\/tenant-test\/oauth2\/v2\.0\/token/);
  assert.equal(send.url, 'https://graph.microsoft.com/v1.0/users/social-design-center%40eikei.ac.jp/sendMail');
  assert.equal(send.init.headers.Authorization, 'Bearer token-test');
  assert.equal(send.init.headers['Content-Type'], 'text/plain');
  const [head, body] = Buffer.from(send.init.body, 'base64').toString('utf8').split('\r\n\r\n');
  const h = head.split('\r\n');
  assert.ok(h.includes('To: a@example.com'));
  assert.ok(h.includes('X-SDC-Delivery: 7'));
  assert.ok(h.includes('Content-Type: text/plain; charset=UTF-8'));
  assert.equal(h.filter((l) => /^Bcc:/i.test(l)).length, 0);   // 件名に改行を入れてもヘッダーを足せない
  const subject = h.find((l) => l.startsWith('Subject: ')).match(/=\?UTF-8\?B\?(.+)\?=/)[1];
  assert.equal(Buffer.from(subject, 'base64').toString('utf8'), '件名 Bcc: x@example.com');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), '本文\r\n2行目');
});

test('混雑（429）のときは、あとでやり直す', async () => {
  sendStatus = 429;
  await assert.rejects(mailer.send({ to: 'a@example.com', subject: 's', text: 't' }), (e) => e instanceof RetryLater && e.waitMs === 30000);
  sendStatus = 403;
  await assert.rejects(mailer.send({ to: 'a@example.com', subject: 's', text: 't' }), /Graph 送信に失敗（403）/);
});
