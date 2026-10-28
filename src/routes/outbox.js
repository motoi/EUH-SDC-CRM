// 確認用：送信方式が outbox のとき、「送ったことにした」メールを画面で読めるようにする
import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one } from '../db.js';
import { page, fmtDate } from '../layout.js';
import { config } from '../config.js';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await q(`select id, to_address, subject, created_at from outbox_messages order by id desc limit 300`);
  const [{ n }] = await q(`select count(*)::int n from outbox_messages`);
  const pick = Number(c.req.query('id'));
  const m = pick ? await one(`select * from outbox_messages where id = $1`, [pick]) : null;
  return page(c, {
    title: '送信箱（確認用）', active: '/outbox',
    body: html`<h1>送信箱（確認用）</h1>
<p class="lead">確認用の設定では実際にはメールを送らず、ここに保存します。全${n}通。</p>
<div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:start">
<div class="card" style="max-height:70vh;overflow:auto;gap:0">${rows.length ? rows.map((r) => html`<a href="/outbox?id=${r.id}" style="display:block;padding:8px 0;border-bottom:1px solid var(--line);text-decoration:none;${r.id === pick ? 'font-weight:700' : ''}">
  <span class="small muted">${fmtDate(r.created_at)}　${r.to_address}</span><br>${r.subject}</a>`) : html`<p class="muted">まだありません。</p>`}</div>
<div class="card">${m ? html`<div class="small muted">差出人：${config.fromAddress}<br>宛先：${m.to_address}<br>日時：${fmtDate(m.created_at)}</div>
  <div><b>件名：</b>${m.subject}</div><pre class="mail">${m.body_text}</pre>` : html`<p class="muted">左の一覧から選んでください。</p>`}</div>
</div>`,
  });
});

export default app;
