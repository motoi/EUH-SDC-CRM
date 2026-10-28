import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one, tx } from '../db.js';
import { page, setFlash, takeFlash, fmtDate } from '../layout.js';
import { audit } from '../auth.js';
import { count, members, describe, toSql } from '../segment.js';
import { compose, MERGE_FIELDS } from '../mail.js';
import { mailer } from '../mailer.js';
import { config } from '../config.js';

const app = new Hono();

const STATUS = {
  draft: html`<span class="pill">作成中</span>`,
  test_sent: html`<span class="pill info">テスト送信済み</span>`,
  scheduled: html`<span class="pill warn">予約済み</span>`,
  sending: html`<span class="pill warn">送信中</span>`,
  sent: html`<span class="pill ok">送信完了</span>`,
  cancelled: html`<span class="pill bad">取り消し</span>`,
};

async function progress(id) {
  const rows = await q(`select status, count(*)::int n from deliveries where campaign_id = $1 group by status`, [id]);
  const m = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return { queued: m.queued ?? 0, sent: m.sent ?? 0, failed: m.failed ?? 0, skipped: m.skipped ?? 0, bounced: m.bounced ?? 0,
    total: rows.reduce((a, r) => a + r.n, 0) };
}

app.get('/', async (c) => {
  const rows = await q(`select cp.*, s.name segment_name from campaigns cp left join segments s on s.id = cp.segment_id order by cp.created_at desc`);
  const list = await Promise.all(rows.map(async (r) => ({ ...r, p: await progress(r.id) })));
  return page(c, {
    title: '配信', active: '/campaigns', flash: takeFlash(c),
    body: html`
<div class="row spread"><h1>配信</h1><a class="btn" href="/campaigns/new">新しい配信を作る</a></div>
<div class="card">
${list.length ? html`<div class="scroll"><table><thead><tr><th>配信</th><th>送り先</th><th>状態</th><th class="num">送信済み</th><th>日時</th></tr></thead><tbody>
${list.map((r) => html`<tr><td><a href="/campaigns/${r.id}">${r.name}</a><div class="small muted">${r.subject}</div></td>
  <td class="small">${r.segment_name ?? '未設定'}</td><td>${STATUS[r.status]}</td>
  <td class="num">${r.p.total ? `${r.p.sent} / ${r.p.total}` : '—'}</td>
  <td class="small">${fmtDate(r.completed_at ?? r.scheduled_at ?? r.created_at)}</td></tr>`)}
</tbody></table></div>` : html`<p class="muted">まだ配信はありません。</p>`}
</div>`,
  });
});

function steps(status) {
  const order = ['draft', 'test_sent', 'scheduled', 'sent'];
  const labels = ['1. 本文を書く', '2. テスト送信', '3. 人数を確認して予約', '4. 送信'];
  const cur = status === 'sending' ? 3 : status === 'cancelled' ? -1 : order.indexOf(status);
  return html`<ol class="steps">${labels.map((l, i) => html`<li class="${i < cur || status === 'sent' ? 'done' : i === cur ? 'now' : ''}">${l}</li>`)}</ol>`;
}

async function sampleContact(def) {
  const [m] = await members(def ?? {}, { limit: 1 });
  return m ?? { full_name: 'サンプル 太郎', org_name: '株式会社サンプル', department: '新規事業部', job_title: '部長' };
}

app.get('/new', async (c) => form(c, null));

async function form(c, cp) {
  const segs = await q(`select id, name from segments order by updated_at desc`);
  return page(c, {
    title: cp ? cp.name : '新しい配信', active: '/campaigns', flash: takeFlash(c),
    body: html`
<div><a href="/campaigns" class="small">← 配信一覧</a><h1>${cp ? '配信を編集' : '新しい配信'}</h1></div>
${steps(cp?.status ?? 'draft')}
${cp?.status === 'test_sent' ? html`<div class="flash warn">本文を変更して保存すると、テスト送信をやり直す必要があります。</div>` : ''}
<form class="card" method="post" action="${cp ? `/campaigns/${cp.id}` : '/campaigns'}">
  <label>管理用の名前<span class="hint">受け取る人には見えません</span><input type="text" id="name" name="name" value="${cp?.name ?? ''}" required placeholder="例：11月 DXセミナー案内"></label>
  <label>送り先<select id="segment_id" name="segment_id" required><option value="">選んでください</option>
    ${segs.map((s) => html`<option value="${s.id}" ${s.id === cp?.segment_id ? 'selected' : ''}>${s.name}</option>`)}</select>
    <span class="hint">送り先は「配信先リスト」で作ります。</span></label>
  <label>件名<input type="text" id="subject" name="subject" value="${cp?.subject ?? ''}" required></label>
  <label>本文
    <span class="hint">差し込みできる項目：${Object.keys(MERGE_FIELDS).join('　')}。末尾の送信者情報と配信停止の案内は自動で付きます。</span>
    <textarea id="body_text" name="body_text" required>${cp?.body_text ?? '{{氏名}} 様\n\n'}</textarea></label>
  <div class="row"><button>保存する</button><a href="${cp ? `/campaigns/${cp.id}` : '/campaigns'}">やめる</a></div>
</form>`,
  });
}

app.post('/', async (c) => {
  const b = await c.req.parseBody();
  const r = await one(`insert into campaigns (name, subject, body_text, segment_id, from_address, created_by) values ($1,$2,$3,$4,$5,$6) returning id`,
    [b.name, b.subject, b.body_text, b.segment_id || null, config.fromAddress, c.get('user').id]);
  await audit(c, 'campaign.create', 'campaign', r.id);
  setFlash(c, '保存しました。次はテスト送信です。');
  return c.redirect(`/campaigns/${r.id}`);
});

app.get('/:id{[0-9]+}/edit', async (c) => {
  const cp = await one(`select * from campaigns where id = $1`, [c.req.param('id')]);
  if (!cp) return c.notFound();
  if (!['draft', 'test_sent'].includes(cp.status)) return c.redirect(`/campaigns/${cp.id}`);
  return form(c, cp);
});

app.post('/:id{[0-9]+}', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody();
  const cp = await one(`select * from campaigns where id = $1`, [id]);
  if (!['draft', 'test_sent'].includes(cp?.status)) { setFlash(c, '予約後の配信は変更できません。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const changed = cp.subject !== b.subject || cp.body_text !== b.body_text || String(cp.segment_id) !== String(b.segment_id);
  await q(`update campaigns set name=$2, subject=$3, body_text=$4, segment_id=$5 ${changed ? `, status='draft', test_sent_at=null` : ''} where id=$1`,
    [id, b.name, b.subject, b.body_text, b.segment_id || null]);
  await audit(c, 'campaign.update', 'campaign', Number(id));
  setFlash(c, changed && cp.status === 'test_sent' ? '保存しました。内容が変わったので、もう一度テスト送信してください。' : '保存しました。', changed && cp.status === 'test_sent' ? 'warn' : 'ok');
  return c.redirect(`/campaigns/${id}`);
});

app.get('/:id{[0-9]+}', async (c) => {
  const cp = await one(`select cp.*, s.name segment_name, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [c.req.param('id')]);
  if (!cp) return c.notFound();
  const def = cp.segment_definition ?? cp.definition ?? {};
  const [n, text, sample, p] = await Promise.all([count(def), describe(def), sampleContact(def), progress(cp.id)]);
  const preview = compose(cp, sample, '（配信停止用のリンク）');
  const user = c.get('user');
  const editable = ['draft', 'test_sent'].includes(cp.status);

  return page(c, {
    title: cp.name, active: '/campaigns', flash: takeFlash(c),
    body: html`
<div class="row spread"><div><a href="/campaigns" class="small">← 配信一覧</a><h1>${cp.name} ${STATUS[cp.status]}</h1></div>
  ${editable ? html`<a class="btn sub" href="/campaigns/${cp.id}/edit">本文・送り先を編集</a>` : ''}</div>
${steps(cp.status)}

<div class="grid2" style="grid-template-columns:minmax(0,3fr) minmax(260px,2fr);align-items:start">
<div class="card"><h2>届くメールの見本</h2>
  <div class="small muted">差出人：${cp.from_address}　／　見本の宛先：${sample.full_name} さん</div>
  <div><b>件名：</b>${preview.subject}</div>
  <pre class="mail">${preview.text}</pre>
</div>

<div style="display:grid;gap:16px">
<div class="card"><h2>送り先</h2>
  <div>${cp.segment_name ?? '未設定'}</div><div class="small muted">${text}</div>
  ${editable ? html`<div class="big">${n}<span style="font-size:18px">人</span></div>` : ''}
</div>

${editable ? html`
<form class="card" method="post" action="/campaigns/${cp.id}/test">
  <h2>2. テスト送信</h2>
  <p class="small muted" style="margin:0">まず自分あてに送って、届いた見た目を確認します。</p>
  <label>テストの送り先<input type="email" id="test_to" name="to" value="${user.email}" required></label>
  <div><button class="${cp.status === 'test_sent' ? 'sub' : ''}">テスト送信する</button></div>
  ${cp.test_sent_at ? html`<div class="small ok">テスト送信済み（${fmtDate(cp.test_sent_at)}）</div>` : ''}
</form>

<form class="card" method="post" action="/campaigns/${cp.id}/confirm">
  <h2>3. 人数を確認して予約</h2>
  ${cp.status !== 'test_sent' ? html`<p class="muted" style="margin:0">テスト送信が済むと予約できます。</p>` : html`
  <p style="margin:0">この配信は <b>${n}人</b> に送られます。確認のため、人数を入力してください。</p>
  <label>送る人数<input type="number" id="confirm_count" name="confirm_count" inputmode="numeric" required></label>
  <label>送信開始<span class="hint">空欄なら今すぐ開始。1分あたり${config.sendPerMinute}通ずつ送ります（約${Math.ceil(n / config.sendPerMinute)}分）</span>
    <input type="datetime-local" id="scheduled_at" name="scheduled_at"></label>
  <div><button ${n === 0 ? 'disabled' : ''}>予約する</button></div>`}
</form>` : html`
<div class="card"><h2>送信の状況</h2>
  <div class="big">${p.sent}<span style="font-size:18px"> / ${p.total}通</span></div>
  <div class="small">送信待ち ${p.queued}・送らなかった ${p.skipped}・失敗 ${p.failed}</div>
  <div class="small muted">予約：${fmtDate(cp.scheduled_at)}${cp.completed_at ? html`　完了：${fmtDate(cp.completed_at)}` : ''}</div>
  ${['scheduled', 'sending'].includes(cp.status) ? html`
  <form method="post" action="/campaigns/${cp.id}/cancel"><button class="danger">残りの送信を取り消す</button></form>` : ''}
</div>`}
</div>
</div>`,
  });
});

app.post('/:id{[0-9]+}/test', async (c) => {
  const id = c.req.param('id');
  const { to } = await c.req.parseBody();
  const cp = await one(`select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [id]);
  if (!['draft', 'test_sent'].includes(cp?.status)) return c.redirect(`/campaigns/${id}`);
  if (!cp.segment_id) { setFlash(c, '先に送り先を選んでください。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const sample = await sampleContact(cp.definition);
  const msg = compose(cp, sample, 'test');
  try {
    await mailer.send({ to, subject: `[テスト] ${msg.subject}`, text: msg.text, deliveryId: `test-${id}` });
  } catch (e) {
    setFlash(c, `テスト送信に失敗しました：${e.message}`, 'bad');
    return c.redirect(`/campaigns/${id}`);
  }
  await q(`update campaigns set status = 'test_sent', test_sent_at = now() where id = $1`, [id]);
  await audit(c, 'campaign.test', 'campaign', Number(id), { to });
  setFlash(c, `${to} にテスト送信しました。届いたメールを確認してから予約してください。`);
  return c.redirect(`/campaigns/${id}`);
});

app.post('/:id{[0-9]+}/confirm', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody();
  const cp = await one(`select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [id]);
  if (cp?.status !== 'test_sent') { setFlash(c, 'テスト送信が済んでいません。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const n = await count(cp.definition);
  if (Number(b.confirm_count) !== n) {
    setFlash(c, `入力された人数（${b.confirm_count}）が実際の人数（${n}人）と違います。送り先を確認してください。`, 'bad');
    return c.redirect(`/campaigns/${id}`);
  }
  // datetime-local は日本時間として扱う
  const at = b.scheduled_at ? new Date(`${b.scheduled_at}:00+09:00`) : new Date();
  const { where, params } = toSql(cp.definition);
  await tx(async (run) => {
    await run(`insert into deliveries (campaign_id, contact_id, email)
      select $${params.length + 1}, c.id, c.email from sendable_contacts c where ${where}
      on conflict (campaign_id, email) do nothing`, [...params, id]);
    await run(`update campaigns set status = 'scheduled', scheduled_at = $2, confirmed_count = $3, confirmed_by = $4, segment_definition = $5 where id = $1`,
      [id, at, n, c.get('user').id, JSON.stringify(cp.definition)]);
  });
  await audit(c, 'campaign.confirm', 'campaign', Number(id), { count: n, scheduled_at: at });
  setFlash(c, `${n}人への配信を予約しました。`);
  return c.redirect(`/campaigns/${id}`);
});

app.post('/:id{[0-9]+}/cancel', async (c) => {
  const id = c.req.param('id');
  await tx(async (run) => {
    await run(`update deliveries set status = 'skipped', last_error = '取り消し' where campaign_id = $1 and status = 'queued'`, [id]);
    await run(`update campaigns set status = 'cancelled', completed_at = now() where id = $1 and status in ('scheduled', 'sending')`, [id]);
  });
  await audit(c, 'campaign.cancel', 'campaign', Number(id));
  setFlash(c, '残りの送信を取り消しました。', 'warn');
  return c.redirect(`/campaigns/${id}`);
});

export default app;
