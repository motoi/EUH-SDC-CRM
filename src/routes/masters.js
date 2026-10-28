import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one } from '../db.js';
import { page, setFlash, takeFlash, fmtDay } from '../layout.js';
import { PART_STATUS } from '../segment.js';

const app = new Hono();
const KINDS = ['セミナー', 'ワークショップ', '講座', 'シンポジウム', '交流会', 'その他'];
const FORMATS = ['対面', 'オンライン', 'ハイブリッド'];

app.get('/', async (c) => {
  const [events, interests] = await Promise.all([
    q(`select e.*, (select count(*)::int from event_participations ep where ep.event_id = e.id and ep.status = 'attended') attended,
         (select count(*)::int from event_participations ep where ep.event_id = e.id) total
       from events e order by held_on desc nulls last`),
    q(`select i.*, (select count(*)::int from contact_interests ci where ci.interest_id = i.id) n from interests i order by sort_order, id`),
  ]);
  return page(c, {
    title: 'イベント・興味', active: '/masters', flash: takeFlash(c),
    body: html`
<h1>イベント・興味</h1>
<p class="lead">配信先リストの条件に使うイベントと興味の一覧です。</p>
<div class="card"><h2>イベント</h2>
  <div class="scroll"><table><thead><tr><th>開催日</th><th>名称</th><th>種類</th><th class="num">参加</th><th class="num">申込など含む</th></tr></thead>
  <tbody>${events.map((e) => html`<tr><td>${e.held_on ? fmtDay(e.held_on) : html`<span class="pill warn">日付なし</span>`}</td><td><a href="/masters/events/${e.id}">${e.name}</a></td><td>${e.kind ?? ''} ${e.format ? html`<span class="small muted">${e.format}</span>` : ''}</td><td class="num">${e.attended}</td><td class="num">${e.total}</td></tr>`)}</tbody></table></div>
  <p class="small muted" style="margin:0">Excel の取り込みで作られたイベントは日付が空なので、名前を押して入れてください。名前を変えると、次に同じシート名で取り込んだときは別のイベントとして作られます。</p>
  <form method="post" action="/masters/events" class="grid2">
    <label>名称<input type="text" id="ev_name" name="name" required></label>
    <label>開催日<input type="date" id="ev_held_on" name="held_on"></label>
    <label>種類<select id="ev_kind" name="kind">${KINDS.map((k) => html`<option>${k}</option>`)}</select></label>
    <label>形式<select id="ev_format" name="format">${FORMATS.map((k) => html`<option>${k}</option>`)}</select></label>
    <div><button class="sub">イベントを追加</button></div>
  </form>
</div>
<div class="card"><h2>興味分類</h2>
  <p class="small muted" style="margin:0">連絡先の「興味分類」にカンマ区切りで書くと、新しい単語は自動でここに加わります。</p>
  <div class="checks">${interests.map((i) => html`<span class="pill info">${i.name} ${i.n}人</span>`)}</div>
  <form method="post" action="/masters/interests" class="row">
    <label style="flex:1 1 240px">新しい興味<input type="text" id="int_name" name="name" required placeholder="例：地域創生"></label>
    <button class="sub" style="align-self:end">追加</button>
  </form>
</div>`,
  });
});

app.post('/events', async (c) => {
  const b = await c.req.parseBody();
  const name = String(b.name ?? '').trim();
  if (name) {
    await q(`insert into events (name, held_on, kind, format) values ($1, $2, $3, $4)`, [name, b.held_on || null, b.kind, b.format]);
    setFlash(c, `イベント「${name}」を追加しました。`);
  }
  return c.redirect('/masters');
});

app.get('/events/:id{[0-9]+}', async (c) => {
  const e = await one(`select *, to_char(held_on, 'YYYY-MM-DD') as day from events where id = $1`, [c.req.param('id')]);
  if (!e) return c.notFound();
  const parts = await q(`select ep.status, c.id, c.full_name, o.name org_name from event_participations ep join contacts c on c.id = ep.contact_id
    left join organizations o on o.id = c.organization_id where ep.event_id = $1 order by ep.status, o.name, c.full_name`, [e.id]);
  return page(c, {
    title: e.name, active: '/masters', flash: takeFlash(c),
    body: html`<div><a href="/masters" class="small">← イベント・興味</a><h1>${e.name}</h1></div>
<form class="card grid2" method="post" action="/masters/events/${e.id}">
  <label>名称<input type="text" id="ev_name" name="name" value="${e.name}" required></label>
  <label>開催日<input type="date" id="ev_held_on" name="held_on" value="${e.day ?? ''}"></label>
  <label>種類<select id="ev_kind" name="kind"><option value="">未設定</option>${KINDS.map((k) => html`<option ${k === e.kind ? 'selected' : ''}>${k}</option>`)}</select></label>
  <label>形式<select id="ev_format" name="format"><option value="">未設定</option>${FORMATS.map((k) => html`<option ${k === e.format ? 'selected' : ''}>${k}</option>`)}</select></label>
  <div><button>保存する</button></div>
</form>
<div class="card"><h2>参加者 ${parts.length}人</h2>
  ${parts.length ? html`<div class="scroll"><table><tbody>${parts.map((p) => html`<tr><td><a href="/contacts/${p.id}">${p.full_name}</a></td><td class="small">${p.org_name ?? ''}</td><td>${PART_STATUS[p.status]}</td></tr>`)}</tbody></table></div>`
    : html`<p class="muted">まだいません。</p>`}
</div>`,
  });
});

app.post('/events/:id{[0-9]+}', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody();
  const name = String(b.name ?? '').trim();
  if (!name) { setFlash(c, '名称は必須です。', 'bad'); return c.redirect(`/masters/events/${id}`); }
  await q(`update events set name = $2, held_on = $3, kind = $4, format = $5 where id = $1`, [id, name, b.held_on || null, b.kind || null, b.format || null]);
  setFlash(c, '保存しました。');
  return c.redirect('/masters');
});

app.post('/interests', async (c) => {
  const b = await c.req.parseBody();
  const name = String(b.name ?? '').trim();
  if (name) {
    await q(`insert into interests (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from interests)) on conflict (name) do nothing`, [name]);
    setFlash(c, `興味「${name}」を追加しました。`);
  }
  return c.redirect('/masters');
});

export default app;
