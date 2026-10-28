import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one, tx } from '../db.js';
import { page, setFlash, takeFlash, fmtDay } from '../layout.js';
import { audit } from '../auth.js';
import { SIZE_CLASSES, PART_STATUS, splitInterests } from '../segment.js';

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
  const size = c.req.query('size') ?? '';
  const pg = Math.max(1, Number(c.req.query('page') ?? 1));
  const params = [];
  const where = ['c.merged_into_id is null', 'c.archived_at is null'];
  if (kw) {
    params.push(`%${kw}%`);
    where.push(`(c.full_name ilike $1 or c.email::text ilike $1 or o.name ilike $1 or coalesce(c.department,'') ilike $1)`);
  }
  if (SIZE_CLASSES.includes(size)) { params.push(size); where.push(`o.size_class = $${params.length}`); }
  const base = `from contacts c left join organizations o on o.id = c.organization_id where ${where.join(' and ')}`;
  const [{ n }] = await q(`select count(*)::int n ${base}`, params);
  const rows = await q(`select c.id, c.full_name, c.email, c.department, c.job_title, o.name org_name, o.size_class, o.industry, ${STATUS_SQL} status
    ${base} order by o.name nulls last, c.full_name, c.id limit ${PER} offset ${(pg - 1) * PER}`, params);
  const pages = Math.max(1, Math.ceil(n / PER));
  const qs = (p) => `?q=${encodeURIComponent(kw)}&size=${encodeURIComponent(size)}&page=${p}`;

  return page(c, {
    title: '連絡先', active: '/contacts', flash: takeFlash(c),
    body: html`
<div class="row spread"><h1>連絡先</h1><a class="btn" href="/contacts/new">連絡先を追加</a></div>
<form class="card" method="get">
  <div class="row">
    <label style="flex:1 1 280px">氏名・企業・団体名・部署・メールで探す<input type="search" id="q" name="q" value="${kw}" placeholder="例：サンプル、example.jp"></label>
    <label style="flex:0 1 200px">企業分類1<select id="size" name="size"><option value="">すべて</option>${SIZE_CLASSES.map((t) => html`<option ${t === size ? 'selected' : ''}>${t}</option>`)}</select></label>
    <button style="align-self:end">検索</button>
  </div>
</form>
<div class="card">
  <div class="row spread"><span class="muted">${n}件</span>
    <div class="pager">${pg > 1 ? html`<a href="${qs(pg - 1)}">前へ</a>` : ''}<span class="small muted">${pg} / ${pages}ページ</span>${pg < pages ? html`<a href="${qs(pg + 1)}">次へ</a>` : ''}</div></div>
  <div class="scroll"><table>
    <thead><tr><th>氏名</th><th>企業・団体名／部署・役職</th><th>企業分類</th><th>メールアドレス</th><th>状態</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><a href="/contacts/${r.id}">${r.full_name}</a></td>
      <td>${r.org_name ?? ''}<div class="small muted">${[r.department, r.job_title].filter(Boolean).join('　')}</div></td>
      <td class="small">${r.size_class ?? ''}<div class="muted">${r.industry ?? ''}</div></td>
      <td class="small">${r.email ?? ''}</td>
      <td>${STATUS_LABEL[r.status]}</td></tr>`)}</tbody>
  </table></div>
  ${rows.length ? '' : html`<p class="muted">該当する連絡先はありません。</p>`}
</div>`,
  });
});

// 項目の並びは事務局の Excel と同じ（氏名・企業・団体名・部署・役職・メールアドレス・団体所在地・企業分類1・企業分類2・興味分類）
function contactForm(r = {}, opts = {}) {
  const { orgs = [], industries = [], interestNames = [], isNew } = opts;
  return html`
<div class="grid2">
  <label>氏名<input type="text" id="full_name" name="full_name" value="${r.full_name ?? ''}" required></label>
  <label>企業・団体名<span class="hint">一覧にない場合は新しい名前を入力</span>
    <input type="text" id="org_name" name="org_name" value="${r.org_name ?? ''}" list="orgs"></label>
  <datalist id="orgs">${orgs.map((o) => html`<option value="${o.name}">`)}</datalist>
  <label>部署<input type="text" id="department" name="department" value="${r.department ?? ''}"></label>
  <label>役職<input type="text" id="job_title" name="job_title" value="${r.job_title ?? ''}"></label>
  <label>メールアドレス<input type="email" id="email" name="email" value="${r.email ?? ''}"></label>
</div>
<fieldset><legend>企業・団体の情報</legend>
  <p class="small muted" style="margin:0">同じ企業・団体に所属する全員に反映されます。</p>
  <div class="grid2">
    <label>団体所在地<input type="text" id="location" name="location" value="${r.location ?? ''}" placeholder="例：広島県広島市中区"></label>
    <label>企業分類1<select id="size_class" name="size_class"><option value="">未設定</option>${SIZE_CLASSES.map((t) => html`<option ${t === r.size_class ? 'selected' : ''}>${t}</option>`)}</select></label>
    <label>企業分類2<input type="text" id="industry" name="industry" value="${r.industry ?? ''}" list="industries" placeholder="例：自動車、電力、サービス"></label>
    <datalist id="industries">${industries.map((v) => html`<option value="${v}">`)}</datalist>
  </div>
</fieldset>
<label>興味分類<span class="hint">カンマ区切りで複数書けます（例：新規事業,リベラルアーツ）。これまでの例：${interestNames.join('、')}</span>
  <input type="text" id="interests" name="interests" value="${r.interest_text ?? ''}"></label>
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

async function formOptions() {
  const [orgs, industries, ints] = await Promise.all([
    q(`select name from organizations order by name`),
    q(`select distinct industry v from organizations where industry is not null order by 1`),
    q(`select name from interests where active order by sort_order, id`),
  ]);
  return { orgs, industries: industries.map((r) => r.v), interestNames: ints.map((i) => i.name) };
}

// 興味分類の文字列どおりに、その人の興味をそろえる。初めて出てきた単語は興味の一覧に追加する
export async function setInterests(run, contactId, text, origin = 'staff') {
  const names = splitInterests(text);
  const ids = [];
  for (const name of names) {
    const [hit] = await run(`select id from interests where name = $1`, [name]);
    const id = hit?.id ?? (await run(`insert into interests (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from interests)) returning id`, [name]))[0].id;
    ids.push(id);
    await run(`insert into contact_interests (contact_id, interest_id, origin) values ($1, $2, $3) on conflict do nothing`, [contactId, id, origin]);
  }
  await run(`delete from contact_interests where contact_id = $1 and not (interest_id = any($2::bigint[]))`, [contactId, ids]);
}

// 企業・団体を名前で探し（なければ作り）、所在地・企業分類を入力どおりに更新する
async function orgId(run, b) {
  const name = (b.org_name ?? '').trim();
  if (!name) return null;
  const norm = normalizeOrg(name);
  const [hit] = await run(`select id from organizations where normalized_name = $1 limit 1`, [norm]);
  const id = hit?.id ?? (await run(`insert into organizations (name, normalized_name) values ($1, $2) returning id`, [name, norm]))[0].id;
  await run(`update organizations set location = $2, size_class = $3, industry = $4, updated_at = now() where id = $1`,
    [id, val(b, 'location'), val(b, 'size_class'), val(b, 'industry')]);
  return id;
}

export function normalizeOrg(s) {
  return s.normalize('NFKC').replace(/株式会社|\(株\)|（株）|有限会社|\(有\)|一般社団法人|公益財団法人|学校法人/g, '').replace(/\s+/g, '').toLowerCase();
}

const val = (b, k) => { const v = (b[k] ?? '').toString().trim(); return v === '' ? null : v; };

app.get('/new', async (c) => {
  const opts = await formOptions();
  return page(c, {
    title: '連絡先を追加', active: '/contacts',
    body: html`<h1>連絡先を追加</h1>
<form class="card" method="post" action="/contacts">${contactForm({}, { ...opts, isNew: true })}
<div class="row"><button>追加する</button><a href="/contacts">やめる</a></div></form>`,
  });
});

app.post('/', async (c) => {
  const b = await c.req.parseBody();
  if (!val(b, 'full_name') || !val(b, 'consent_basis')) {
    setFlash(c, '氏名と「メールを送ってよい根拠」は必須です。', 'bad');
    return c.redirect('/contacts/new');
  }
  try {
    const id = await tx(async (run) => {
      const oid = await orgId(run, b);
      const [r] = await run(`insert into contacts (full_name, email, organization_id, department, job_title, notes)
        values ($1,$2,$3,$4,$5,$6) returning id`,
        [val(b, 'full_name'), val(b, 'email'), oid, val(b, 'department'), val(b, 'job_title'), val(b, 'notes')]);
      await setInterests(run, r.id, b.interests);
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
  const r = await one(`select c.*, o.name org_name, o.location, o.size_class, o.industry, ${STATUS_SQL} status,
      (select string_agg(i.name, ',' order by i.sort_order, i.id) from contact_interests ci join interests i on i.id = ci.interest_id where ci.contact_id = c.id) interest_text
    from contacts c left join organizations o on o.id = c.organization_id where c.id = $1`, [id]);
  if (!r) return c.notFound();
  const [opts, parts, events, sources, sup, sent] = await Promise.all([
    formOptions(),
    q(`select ep.*, e.name, e.held_on from event_participations ep join events e on e.id = ep.event_id where ep.contact_id = $1 order by e.held_on desc`, [id]),
    q(`select id, name, held_on from events order by held_on desc`),
    q(`select * from contact_sources where contact_id = $1 order by created_at`, [id]),
    r.email ? one(`select * from suppressions where email = $1`, [r.email]) : null,
    q(`select d.status, d.sent_at, cp.name, cp.id cid from deliveries d join campaigns cp on cp.id = d.campaign_id where d.contact_id = $1 order by d.queued_at desc limit 20`, [id]),
  ]);
  const SUP = { unsubscribe: '本人が配信停止', hard_bounce: '宛先不明で届かない', complaint: '迷惑メール報告', manual: '担当者が停止' };

  return page(c, {
    title: r.full_name, active: '/contacts', flash: takeFlash(c),
    body: html`
<div class="row spread"><div><a href="/contacts" class="small">← 連絡先一覧</a><h1>${r.full_name} ${STATUS_LABEL[r.status]}</h1>
<div class="muted">${[r.org_name, r.department, r.job_title].filter(Boolean).join('　')}</div></div></div>
${r.merged_into_id ? html`<div class="flash warn">この連絡先は <a href="/contacts/${r.merged_into_id}">別の連絡先</a> に統合されています。</div>` : ''}
${sup ? html`<div class="flash bad">このアドレスには送信しません（${SUP[sup.reason]}、${fmtDay(sup.created_at)}）。</div>` : ''}

<form class="card" method="post" action="/contacts/${r.id}"><h2>基本情報</h2>${contactForm(r, opts)}
<div class="row"><button>保存する</button></div></form>

<div class="grid2">
<div class="card"><h2>どこで知り合ったか</h2>
  ${sources.map((s) => html`<div><b>${s.source_kind}</b> ${s.source_detail ?? ''} <span class="small muted">${fmtDay(s.acquired_on)}</span>
    <div class="small">送ってよい根拠：${CONSENT[s.consent_basis]}</div></div>`)}
</div>
<div class="card"><h2>イベント参加</h2>
  ${parts.length ? html`<table><tbody>${parts.map((p) => html`<tr><td>${p.name}<div class="small muted">${fmtDay(p.held_on)}</div></td><td>${PART_STATUS[p.status]}</td></tr>`)}</tbody></table>` : html`<p class="muted">記録はありません。</p>`}
  <form method="post" action="/contacts/${r.id}/participations" class="row">
    <select name="event_id" id="event_id" style="flex:1 1 200px">${events.map((e) => html`<option value="${e.id}">${e.name}（${fmtDay(e.held_on)}）</option>`)}</select>
    <select name="status" id="part_status" style="flex:0 1 120px">${Object.entries(PART_STATUS).map(([k, v]) => html`<option value="${k}" ${k === 'attended' ? 'selected' : ''}>${v}</option>`)}</select>
    <button class="sub">追加</button></form>
</div>
</div>

<div class="grid2">
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
  if (!val(b, 'full_name')) { setFlash(c, '氏名は必須です。', 'bad'); return c.redirect(`/contacts/${id}`); }
  try {
    await tx(async (run) => {
      const oid = await orgId(run, b);
      await run(`update contacts set full_name=$2, email=$3, organization_id=$4, department=$5, job_title=$6, notes=$7, updated_at=now() where id=$1`,
        [id, val(b, 'full_name'), val(b, 'email'), oid, val(b, 'department'), val(b, 'job_title'), val(b, 'notes')]);
      await setInterests(run, id, b.interests);
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
