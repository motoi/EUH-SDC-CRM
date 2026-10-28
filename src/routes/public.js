// ログイン不要のページ：配信停止
import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one } from '../db.js';
import { config } from '../config.js';

const app = new Hono();

const shell = (c, body) => c.html(html`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>配信停止 | ${config.footer.sender}</title>
<style>body{font:16px/1.8 "BIZ UDPGothic","Hiragino Sans",sans-serif;background:#f4f6f8;color:#1b2530;margin:0;padding:48px 16px}
.box{max-width:520px;margin:0 auto;background:#fff;border:1px solid #d8dfe6;border-radius:12px;padding:28px 32px;display:grid;gap:12px}
h1{font-size:20px;margin:0}p{margin:0}.muted{color:#5e6b78;font-size:14px}
button{font:inherit;font-weight:700;padding:10px 20px;border-radius:6px;border:1px solid #1d6b73;background:#1d6b73;color:#fff;cursor:pointer}</style></head>
<body><div class="box">${body}<p class="muted">${config.footer.sender}　${config.footer.contact}</p></div></body></html>`);

// メールのリンクを開いただけでは停止しない（メールソフトのリンク確認で勝手に停止されないように、ボタンで確定する）
app.get('/u/:token', async (c) => {
  const d = await one(`select email from deliveries where unsubscribe_token::text = $1`, [c.req.param('token')]);
  if (!d) return shell(c, html`<h1>リンクが見つかりません</h1><p>お手数ですが、お問い合わせ先までご連絡ください。</p>`);
  const done = await one(`select 1 from suppressions where email = $1`, [d.email]);
  if (done) return shell(c, html`<h1>配信は停止済みです</h1><p>${d.email} には今後ご案内をお送りしません。</p>`);
  return shell(c, html`<h1>配信停止</h1><p>${d.email} へのご案内メールを停止します。</p>
<form method="post"><button>配信を停止する</button></form>`);
});

app.post('/u/:token', async (c) => {
  const d = await one(`select id, email from deliveries where unsubscribe_token::text = $1`, [c.req.param('token')]);
  if (!d) return c.redirect(c.req.path);
  await q(`insert into suppressions (email, reason, delivery_id) values ($1, 'unsubscribe', $2) on conflict do nothing`, [d.email, d.id]);
  await q(`insert into mailbox_events (kind, email, delivery_id) values ('unsubscribe', $1, $2)`, [d.email, d.id]);
  return shell(c, html`<h1>配信を停止しました</h1><p>${d.email} には今後ご案内をお送りしません。これまでありがとうございました。</p>`);
});

export default app;
