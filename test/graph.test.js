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

test('共有メールボックスから、テキストで、送信済みフォルダーに残さずに送る', async () => {
  await mailer.send({ to: 'a@example.com', subject: '件名', text: '本文\n2行目', deliveryId: 7 });
  const [tok, send] = calls;
  assert.match(tok.url, /login\.microsoftonline\.com\/tenant-test\/oauth2\/v2\.0\/token/);
  assert.equal(send.url, 'https://graph.microsoft.com/v1.0/users/social-design-center%40eikei.ac.jp/sendMail');
  assert.equal(send.init.headers.Authorization, 'Bearer token-test');
  const body = JSON.parse(send.init.body);
  assert.deepEqual(body.message.body, { contentType: 'Text', content: '本文\n2行目' });
  assert.deepEqual(body.message.toRecipients, [{ emailAddress: { address: 'a@example.com' } }]);
  assert.equal(body.saveToSentItems, false);
});

test('混雑（429）のときは、あとでやり直す', async () => {
  sendStatus = 429;
  await assert.rejects(mailer.send({ to: 'a@example.com', subject: 's', text: 't' }), (e) => e instanceof RetryLater && e.waitMs === 30000);
  sendStatus = 403;
  await assert.rejects(mailer.send({ to: 'a@example.com', subject: 's', text: 't' }), /Graph 送信に失敗（403）/);
});
