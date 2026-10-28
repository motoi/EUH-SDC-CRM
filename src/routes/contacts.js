import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one, tx } from '../db.js';
import { page, setFlash, takeFlash, fmtDay } from '../layout.js';
import { audit } from '../auth.js';
import { JOB_LEVELS, CONTACT_TYPES, PART_STATUS } from '../segment.js';

const app = new Hono();
const PER = 50;
const SOURCE_KINDS = ['名刺交換', 'イベント申込', '問い合わせ', '手入力', 'その他'];
const CONSENT = { business_card: '名刺など書面で受け取った', opt_in: 'フォーム等で案内の受信に同意', unknown: '不明' };

// 連絡先ごとの送信状態
const STATUS_SQL = `case
  when c.email is null then 'no_email'
  when exists (select 1 from suppressions s where s.email = c.email) then 'suppressed'
  when not exists (select 1 from contact_sources cs where cs.contact_id = c.id and cs.consent_basis in ('business_card','opt_in')) then 'no_consent'
  else 'ok' end`;
const STATUS_LABEL = {
  ok: html`<span class="pill ok">送信できる</span>`,
  suppressed: html`<span class="pill bad">配信停止</span>`,
  no_consent: html`<span class="pill warn">同意の根拠なし</span>`,
  no_email: html`<span class="pill">メールなし</span>`,
};

app.get('/', async (c) => {
  const kw = (c.req.query('q') ?? '').trim();
  const type = c.req.query('type') ?? '';
  const pg = Math.max(1, Number(c.req.query('page') ?? 1));
  const params = [];
  const where = ['c.merged_into_id is null', 'c.archived_at is null'];
  if (kw) {
    params.push(`%${kw}%`);
    where.push(`(c.last_name || coalesce(c.first_name,'') ilike $1 or coalesce(c.last_name_kana,'') || coalesce(c.first_name_kana,'') ilike $1
      or c.email::text ilike $1 or o.name ilike $1 or c.last_name || ' ' || coalesce(c.first_name,'') ilike $1)`);
  }
  if (CONTACT_TYPES.includes(type)) { params.push(type); where.push(`c.contact_type = $${params.length}`); }
  const base = `from contacts c left join organizations o on o.id = c.organization_id where ${where.join(' and ')}`;
  const [{ n }] = await q(`select count(*)::int n ${base}`, params);
  const rows = await q(`select c.id, c.last_name, c.first_name, c.email, c.job_title, o.name org_name, ${STATUS_SQL} status
    ${base} order by c.last_name_kana nulls last, c.id limit ${PER} offset ${(pg - 1) * PER}`, params);
  const pages = Math.max(1, Math.ceil(n / PER));
  const qs = (p) => `?q=${encodeURIComponent(kw)}&type=${encodeURIComponent(type)}&page=${p}`;

  return page(c, {
    title: '連絡先', active: '/contacts', flash: takeFlash(c),
    body: html`
<div class="row spread"><h1>連絡先</h1><a class="btn" href="/contacts/new">連絡先を追加</a></div>
<form class="card" method="get">
  <div class="row">
    <label style="flex:1 1 280px">名前・メール・所属で探す<input type="search" id="q" name="q" value="${kw}" placeholder="例：山田、example.co.jp"></label>
    <label style="flex:0 1 200px">種別<select id="type" name="type"><option value="">すべて</option>${CONTACT_TYPES.map((t) => html`<option ${t === type ? 'selected' : ''}>${t}</option>`)}</select></label>
    <button style="align-self:end">検索</button>
  </div>
</form>
<div class="card">
  <div class="row spread"><span class="muted">${n}件</span>
    <div class="pager">${pg > 1 ? html`<a href="${qs(pg - 1)}">前へ</a>` : ''}<span class="small muted">${pg} / ${pages}ページ</span>${pg < pages ? html`<a href="${qs(pg + 1)}">次へ</a>` : ''}</div></div>
  <div class="scroll"><table>
    <thead><tr><th>氏名</th><th>所属・役職</th><th>メール</th><th>状態</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><a href="/contacts/${r.id}">${r.last_name} ${r.first_name ?? ''}</a></td>
      <td>${r.org_name ?? ''}<div class="small muted">${r.job_title ?? ''}</div></td>
      <td class="small">${r.email ?? ''}</td>
      <td>${STATUS_LABEL[r.status]}</td></tr>`)}</tbody>
  </table></div>
  ${rows.length ? '' : html`<p class="muted">該当する連絡先はありません。</p>`}
</div>`,
  });
});

function contactForm(r = {}, orgs = [], { isNew } = {}) {
  return html`
<div class="grid2">
  <label>姓<input type="text" id="last_name" name="last_name" value="${r.last_name ?? ''}" required></label>
  <label>名<input type="text" id="first_name" name="first_name" value="${r.first_name ?? ''}"></label>
  <label>せい（ふりがな）<input type="text" id="last_name_kana" name="last_name_kana" value="${r.last_name_kana ?? ''}"></label>
  <label>めい（ふりがな）<input type="text" id="first_name_kana" name="first_name_kana" value="${r.first_name_kana ?? ''}"></label>
  <label>メールアドレス<input type="email" id="email" name="email" value="${r.email ?? ''}"></label>
  <label>電話<input type="text" id="phone" name="phone" value="${r.phone ?? ''}"></label>
  <label>所属<span class="hint">一覧にない場合は新しい名前を入力</span>
    <input type="text" id="org_name" name="org_name" value="${r.org_name ?? ''}" list="orgs"></label>
  <datalist id="orgs">${orgs.map((o) => html`<option value="${o.name}">`)}</datalist>
  <label>部署<input type="text" id="department" name="department" value="${r.department ?? ''}"></label>
  <label>役職（名刺どおり）<input type="text" id="job_title" name="job_title" value="${r.job_title ?? ''}"></label>
  <label>役職の区分<select id="job_level" name="job_level"><option value="">未設定</option>${JOB_LEVELS.map((j) => html`<option ${j === r.job_level ? 'selected' : ''}>${j}</option>`)}</select></label>
  <label>種別<select id="contact_type" name="contact_type"><option value="">未設定</option>${CONTACT_TYPES.map((t) => html`<option ${t === r.contact_type ? 'selected' : ''}>${t}</option>`)}</select></label>
</div>
<label>メモ<textarea id="notes" name="notes" style="min-height:90px">${r.notes ?? ''}</textarea></label>
${isNew ? html`
<fieldset><legend>どこで知り合ったか（必須）</legend>
  <div class="grid2">
    <label>経路<select id="source_kind" name="source_kind">${SOURCE_KINDS.map((s) => html`<option>${s}</option>`)}</select></label>
    <label>詳細<span class="hint">例：交換した先生の名前、イベント名</span><input type="text" id="source_detail" name="source_detail"></label>
    <label>メールを送ってよい根拠<select id="consent_basis" name="consent_basis" required>
      <option value="">選んでください</option>${Object.entries(CONSENT).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
    <label>日付<input type="date" id="acquired_on" name="acquired_on"></label>
  </div>
</fieldset>` : ''}`;
}

async function orgId(run, name) {
  name = (name ?? '').trim();
  if (!name) return null;
  const norm = normalizeOrg(name);
  const [hit] = await run(`select id from organizations where normalized_name = $1 limit 1`, [norm]);
  if (hit) return hit.id;
  const [o] = await run(`insert into organizations (name, normalized_name) values ($1, $2) returning id`, [name, norm]);
  return o.id;
}

export function normalizeOrg(s) {
  return s.normalize('NFKC').replace(/株式会社|\(株\)|（株）|有限会社|\(有\)|一般社団法人|公益財団法人|学校法人/g, '').replace(/\s+/g, '').toLowerCase();
}

const val = (b, k) => { const v = (b[k] ?? '').toString().trim(); return v === '' ? null : v; };

app.get('/new', async (c) => {
  const orgs = await q(`select name from organizations order by name`);
  return page(c, {
    title: '連絡先を追加', active: '/contacts',
    body: html`<h1>連絡先を追加</h1>
<form class="card" method="post" action="/contacts">${contactForm({}, orgs, { isNew: true })}
<div class="row"><button>追加する</button><a href="/contacts">やめる</a></div></form>`,
  });
});

app.post('/', async (c) => {
  const b = await c.req.parseBody();
  if (!val(b, 'last_name') || !val(b, 'consent_basis')) {
    setFlash(c, '姓と「メールを送ってよい根拠」は必須です。', 'bad');
    return c.redirect('/contacts/new');
  }
  try {
    const id = await tx(async (run) => {
      const oid = await orgId(run, b.org_name);
      const [r] = await run(`insert into contacts (email, last_name, first_name, last_name_kana, first_name_kana, organization_id, department, job_title, job_level, contact_type, phone, notes)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [val(b, 'email'), val(b, 'last_name'), val(b, 'first_name'), val(b, 'last_name_kana'), val(b, 'first_name_kana'), oid,
          val(b, 'department'), val(b, 'job_title'), val(b, 'job_level'), val(b, 'contact_type'), val(b, 'phone'), val(b, 'notes')]);
      await run(`insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on) values ($1,$2,$3,$4,$5)`,
        [r.id, val(b, 'source_kind') ?? '手入力', val(b, 'source_detail'), val(b, 'consent_basis'), val(b, 'acquired_on')]);
      return r.id;
    });
    await audit(c, 'contact.create', 'contact', id);
    setFlash(c, '連絡先を追加しました。');
    return c.redirect(`/contacts/${id}`);
  } catch (e) {
    if (e.code === '23505' || /contacts_email_active_uq/.test(e.message)) {
      const dup = await one(`select id from contacts where email = $1 and merged_into_id is null and archived_at is null`, [val(b, 'email')]);
      setFlash(c, 'このメールアドレスはすでに登録されています。既存の連絡先を開きました。', 'warn');
      return c.redirect(`/contacts/${dup?.id ?? ''}`);
    }
    throw e;
  }
});

app.get('/:id{[0-9]+}', async (c) => {
  const id = c.req.param('id');
  const r = await one(`select c.*, o.name org_name, ${STATUS_SQL} status from contacts c left join organizations o on o.id = c.organization_id where c.id = $1`, [id]);
  if (!r) return c.notFound();
  const [orgs, parts, events, ints, mine, sources, sup, sent] = await Promise.all([
    q(`select name from organizations order by name`),
    q(`select ep.*, e.name, e.held_on from event_participations ep join events e on e.id = ep.event_id where ep.contact_id = $1 order by e.held_on desc`, [id]),
    q(`select id, name, held_on from events order by held_on desc`),
    q(`select id, name from interests where active order by sort_order, id`),
    q(`select interest_id from contact_interests where contact_id = $1`, [id]),
    q(`select * from contact_sources where contact_id = $1 order by created_at`, [id]),
    r.email ? one(`select * from suppressions where email = $1`, [r.email]) : null,
    q(`select d.status, d.sent_at, cp.name, cp.id cid from deliveries d join campaigns cp on cp.id = d.campaign_id where d.contact_id = $1 order by d.queued_at desc limit 20`, [id]),
  ]);
  const has = new Set(mine.map((m) => m.interest_id));
  const SUP = { unsubscribe: '本人が配信停止', hard_bounce: '宛先不明で届かない', complaint: '迷惑メール報告', manual: '担当者が停止' };

  return page(c, {
    title: `${r.last_name} ${r.first_name ?? ''}`, active: '/contacts', flash: takeFlash(c),
    body: html`
<div class="row spread"><div><a href="/contacts" class="small">← 連絡先一覧</a><h1>${r.last_name} ${r.first_name ?? ''} ${STATUS_LABEL[r.status]}</h1>
<div class="muted">${r.org_name ?? ''} ${r.job_title ?? ''}</div></div></div>
${r.merged_into_id ? html`<div class="flash warn">この連絡先は <a href="/contacts/${r.merged_into_id}">別の連絡先</a> に統合されています。</div>` : ''}
${sup ? html`<div class="flash bad">このアドレスには送信しません（${SUP[sup.reason]}、${fmtDay(sup.created_at)}）。</div>` : ''}

<form class="card" method="post" action="/contacts/${r.id}"><h2>基本情報</h2>${contactForm(r, orgs)}
<div class="row"><button>保存する</button></div></form>

<div class="grid2">
<form class="card" method="post" action="/contacts/${r.id}/interests"><h2>興味関心</h2>
  <div class="checks">${ints.map((i) => html`<label><input type="checkbox" name="interests" value="${i.id}" ${has.has(i.id) ? 'checked' : ''}>${i.name}</label>`)}</div>
  <div><button class="sub">興味を保存</button></div></form>

<div class="card"><h2>イベント参加</h2>
  ${parts.length ? html`<table><tbody>${parts.map((p) => html`<tr><td>${p.name}<div class="small muted">${fmtDay(p.held_on)}</div></td><td>${PART_STATUS[p.status]}</td></tr>`)}</tbody></table>` : html`<p class="muted">記録はありません。</p>`}
  <form method="post" action="/contacts/${r.id}/participations" class="row">
    <select name="event_id" id="event_id" style="flex:1 1 200px">${events.map((e) => html`<option value="${e.id}">${e.name}（${fmtDay(e.held_on)}）</option>`)}</select>
    <select name="status" id="part_status" style="flex:0 1 120px">${Object.entries(PART_STATUS).map(([k, v]) => html`<option value="${k}" ${k === 'attended' ? 'selected' : ''}>${v}</option>`)}</select>
    <button class="sub">追加</button></form>
</div>
</div>

<div class="grid2">
<div class="card"><h2>どこで知り合ったか</h2>
  ${sources.map((s) => html`<div><b>${s.source_kind}</b> ${s.source_detail ?? ''} <span class="small muted">${fmtDay(s.acquired_on)}</span>
    <div class="small">送ってよい根拠：${CONSENT[s.consent_basis]}</div></div>`)}
</div>
<div class="card"><h2>最近の配信</h2>
  ${sent.length ? html`<table><tbody>${sent.map((d) => html`<tr><td><a href="/campaigns/${d.cid}">${d.name}</a></td><td class="small">${d.status === 'sent' ? '送信済み' : d.status === 'skipped' ? '送らなかった' : d.status === 'failed' ? '失敗' : '送信待ち'}</td></tr>`)}</tbody></table>` : html`<p class="muted">まだ送っていません。</p>`}
</div>
</div>

${r.email && !sup ? html`<form class="card" method="post" action="/contacts/${r.id}/suppress"><h2>配信を止める</h2>
  <p class="muted" style="margin:0">本人から「もう送らないで」と連絡があったときに使います。このアドレスには今後一切送信しません。</p>
  <div><button class="danger">このアドレスへの配信を止める</button></div></form>` : ''}`,
  });
});

app.post('/:id{[0-9]+}', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody();
  if (!val(b, 'last_name')) { setFlash(c, '姓は必須です。', 'bad'); return c.redirect(`/contacts/${id}`); }
  try {
    await tx(async (run) => {
      const oid = await orgId(run, b.org_name);
      await run(`update contacts set email=$2, last_name=$3, first_name=$4, last_name_kana=$5, first_name_kana=$6, organization_id=$7,
        department=$8, job_title=$9, job_level=$10, contact_type=$11, phone=$12, notes=$13, updated_at=now() where id=$1`,
        [id, val(b, 'email'), val(b, 'last_name'), val(b, 'first_name'), val(b, 'last_name_kana'), val(b, 'first_name_kana'), oid,
          val(b, 'department'), val(b, 'job_title'), val(b, 'job_level'), val(b, 'contact_type'), val(b, 'phone'), val(b, 'notes')]);
    });
  } catch (e) {
    if (e.code === '23505' || /contacts_email_active_uq/.test(e.message)) {
      setFlash(c, 'このメールアドレスは別の連絡先で使われています。', 'bad');
      return c.redirect(`/contacts/${id}`);
    }
    throw e;
  }
  await audit(c, 'contact.update', 'contact', Number(id));
  setFlash(c, '保存しました。');
  return c.redirect(`/contacts/${id}`);
});

app.post('/:id{[0-9]+}/interests', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody({ all: true });
  const chosen = [].concat(b.interests ?? []).map(Number);
  await tx(async (run) => {
    await run(`delete from contact_interests where contact_id = $1 and not (interest_id = any($2::bigint[]))`, [id, chosen]);
    for (const iid of chosen) {
      await run(`insert into contact_interests (contact_id, interest_id, origin) values ($1, $2, 'staff') on conflict do nothing`, [id, iid]);
    }
  });
  setFlash(c, '興味を保存しました。');
  return c.redirect(`/contacts/${id}`);
});

app.post('/:id{[0-9]+}/participations', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody();
  await q(`insert into event_participations (contact_id, event_id, status) values ($1, $2, $3)
    on conflict (contact_id, event_id) do update set status = excluded.status`, [id, b.event_id, b.status]);
  setFlash(c, 'イベント参加を記録しました。');
  return c.redirect(`/contacts/${id}`);
});

app.post('/:id{[0-9]+}/suppress', async (c) => {
  const id = c.req.param('id');
  const r = await one(`select email from contacts where id = $1`, [id]);
  if (r?.email) {
    await q(`insert into suppressions (email, reason, note) values ($1, 'manual', $2) on conflict do nothing`, [r.email, `${c.get('user').name}が手動で停止`]);
    await audit(c, 'contact.suppress', 'contact', Number(id));
  }
  setFlash(c, 'このアドレスへの配信を止めました。');
  return c.redirect(`/contacts/${id}`);
});

export default app;
