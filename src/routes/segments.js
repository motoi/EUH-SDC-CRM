import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { q, one } from '../db.js';
import { page, setFlash, takeFlash, fmtDay } from '../layout.js';
import { audit } from '../auth.js';
import { fromForm, count, members, describe, JOB_LEVELS, CONTACT_TYPES, ORG_TYPES, PART_STATUS } from '../segment.js';

const app = new Hono();

app.get('/', async (c) => {
  const rows = await q(`select * from segments order by updated_at desc`);
  const withCounts = await Promise.all(rows.map(async (s) => ({ ...s, n: await count(s.definition), text: await describe(s.definition) })));
  return page(c, {
    title: '配信先リスト', active: '/segments', flash: takeFlash(c),
    body: html`
<div class="row spread"><h1>配信先リスト</h1><a class="btn" href="/segments/new">新しいリストを作る</a></div>
<p class="lead">「誰に送るか」の条件を保存したものです。人数は今の連絡先から毎回数え直します。</p>
<div class="card">
  ${withCounts.length ? html`<table><thead><tr><th>名前</th><th>条件</th><th class="num">人数</th></tr></thead><tbody>
  ${withCounts.map((s) => html`<tr><td><a href="/segments/${s.id}">${s.name}</a></td><td class="small">${s.text}</td><td class="num">${s.n}人</td></tr>`)}
  </tbody></table>` : html`<p class="muted">まだリストはありません。「新しいリストを作る」から作れます。</p>`}
</div>`,
  });
});

async function editor(c, seg) {
  const def = seg?.definition ?? {};
  const [events, interests] = await Promise.all([
    q(`select id, name, held_on from events order by held_on desc nulls last`),
    q(`select id, name from interests where active order by sort_order, id`),
  ]);
  const on = (arr, v) => (arr ?? []).includes(v) ? 'checked' : '';
  const n = await count(def);
  return page(c, {
    title: seg ? seg.name : '新しい配信先リスト', active: '/segments', flash: takeFlash(c),
    body: html`
<div><a href="/segments" class="small">← 配信先リスト</a><h1>${seg ? 'リストを編集' : '新しい配信先リスト'}</h1></div>
<p class="lead">条件を選ぶと、右上の人数がすぐ変わります。何も選ばなければ「送信できる連絡先すべて」です。</p>
<form method="post" action="${seg ? `/segments/${seg.id}` : '/segments'}" id="segform" class="grid2" style="grid-template-columns:minmax(0,2fr) minmax(240px,1fr);align-items:start">
<div class="card">
  <label>リストの名前<input type="text" id="name" name="name" value="${seg?.name ?? ''}" required placeholder="例：DXセミナー参加者（経営層）"></label>

  <fieldset><legend>参加したイベント（どれか）</legend>
    <div class="checks">${events.map((e) => html`<label><input type="checkbox" name="events" value="${e.id}" ${on(def.events, e.id)}>${e.name} <span class="small muted">${fmtDay(e.held_on)}</span></label>`)}</div>
    <div class="checks small"><span class="muted">対象にする状態：</span>${['attended', 'applied'].map((k) => html`<label><input type="checkbox" name="event_status" value="${k}" ${(def.event_status ?? ['attended']).includes(k) ? 'checked' : ''}>${PART_STATUS[k]}</label>`)}</div>
  </fieldset>

  <fieldset><legend>興味関心（どれか）</legend>
    <div class="checks">${interests.map((i) => html`<label><input type="checkbox" name="interests" value="${i.id}" ${on(def.interests, i.id)}>${i.name}</label>`)}</div>
  </fieldset>

  <fieldset><legend>役職の区分（どれか）</legend>
    <div class="checks">${JOB_LEVELS.map((j) => html`<label><input type="checkbox" name="job_levels" value="${j}" ${on(def.job_levels, j)}>${j}</label>`)}</div>
  </fieldset>

  <fieldset><legend>種別（どれか）</legend>
    <div class="checks">${CONTACT_TYPES.map((j) => html`<label><input type="checkbox" name="contact_types" value="${j}" ${on(def.contact_types, j)}>${j}</label>`)}</div>
  </fieldset>

  <fieldset><legend>所属組織の種類（どれか）</legend>
    <div class="checks">${ORG_TYPES.map((j) => html`<label><input type="checkbox" name="org_types" value="${j}" ${on(def.org_types, j)}>${j}</label>`)}</div>
  </fieldset>

  <fieldset><legend>除外する人：このイベントに申込・参加した人</legend>
    <div class="checks">${events.map((e) => html`<label><input type="checkbox" name="exclude_events" value="${e.id}" ${on(def.exclude_events, e.id)}>${e.name}</label>`)}</div>
  </fieldset>

  <div class="row"><button>保存する</button><a href="/segments">やめる</a></div>
</div>
<div class="card" style="position:sticky;top:12px">
  <div class="muted small">この条件で送る人数</div>
  <div class="big" id="count">${n}<span style="font-size:18px">人</span></div>
  <p class="small muted" id="desc" style="margin:0"></p>
  <p class="small muted" style="margin:0">配信停止・宛先不明の人と、送ってよい根拠がない人は自動で除かれています。</p>
  ${seg ? html`<a href="/segments/${seg.id}/members">対象者を一覧で見る</a>` : ''}
</div>
</form>
<script>${raw(`
const f = document.getElementById('segform');
let t;
f.addEventListener('change', () => { clearTimeout(t); t = setTimeout(async () => {
  const r = await fetch('/segments/count', { method: 'POST', body: new FormData(f) });
  if (!r.ok) return;
  const j = await r.json();
  document.getElementById('count').firstChild.textContent = j.n;
  document.getElementById('desc').textContent = j.text;
}, 150); });`)}</script>`,
  });
}

app.get('/new', (c) => editor(c, null));

app.get('/:id{[0-9]+}', async (c) => {
  const seg = await one(`select * from segments where id = $1`, [c.req.param('id')]);
  return seg ? editor(c, seg) : c.notFound();
});

app.post('/count', async (c) => {
  const def = fromForm(await c.req.parseBody({ all: true }));
  return c.json({ n: await count(def), text: await describe(def) });
});

app.post('/', async (c) => {
  const b = await c.req.parseBody({ all: true });
  const r = await one(`insert into segments (name, definition, created_by) values ($1, $2, $3) returning id`,
    [String(b.name || '名前なしのリスト'), JSON.stringify(fromForm(b)), c.get('user').id]);
  await audit(c, 'segment.create', 'segment', r.id);
  setFlash(c, 'リストを保存しました。');
  return c.redirect('/segments');
});

app.post('/:id{[0-9]+}', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody({ all: true });
  await q(`update segments set name = $2, definition = $3, updated_at = now() where id = $1`,
    [id, String(b.name || '名前なしのリスト'), JSON.stringify(fromForm(b))]);
  await audit(c, 'segment.update', 'segment', Number(id));
  setFlash(c, 'リストを保存しました。');
  return c.redirect('/segments');
});

app.get('/:id{[0-9]+}/members', async (c) => {
  const seg = await one(`select * from segments where id = $1`, [c.req.param('id')]);
  if (!seg) return c.notFound();
  const rows = await members(seg.definition, { limit: 500 });
  const n = await count(seg.definition);
  return page(c, {
    title: seg.name, active: '/segments',
    body: html`<div><a href="/segments/${seg.id}" class="small">← ${seg.name}</a><h1>対象者 ${n}人</h1></div>
<div class="card"><div class="scroll"><table><thead><tr><th>氏名</th><th>所属</th><th>メール</th></tr></thead><tbody>
${rows.map((r) => html`<tr><td><a href="/contacts/${r.id}">${r.last_name} ${r.first_name ?? ''}</a></td><td>${r.org_name ?? ''}</td><td class="small">${r.email}</td></tr>`)}
</tbody></table></div>${n > rows.length ? html`<p class="small muted">先頭の${rows.length}人を表示しています。</p>` : ''}</div>`,
  });
});

export default app;
