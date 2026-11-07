// 配信：本文を書く →（任意）自分あてのテスト → 人数を確認して送信ファイルを書き出す → Power Automate で送る
// メールを送るのは Power Automate（共有フォルダーの「配信.xlsx」を1行ずつ、間をあけて共有メールボックスから送るフロー）。
// CRM は送信ファイルを書き出した時点で送信済みとして記録する。途中で止まったときだけ、共有フォルダーのファイルを取り込むと
// 「送信済み」になっていない人が送り残しに戻り、その人たちだけの送信ファイルを書き出せる。
import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { q, one, tx } from '../db.js';
import { page, setFlash, takeFlash, fmtDate } from '../layout.js';
import { audit } from '../auth.js';
import { count, members, describe, toSql } from '../segment.js';
import { compose, MERGE_FIELDS } from '../mail.js';
import { writeXlsx } from '../xlsx-write.js';
import { config } from '../config.js';

const app = new Hono();

const STATUS = {
  draft: html`<span class="pill">作成中</span>`,
  test_sent: html`<span class="pill info">テスト済み</span>`,
  exported: html`<span class="pill warn">送り残しあり</span>`,
  sent: html`<span class="pill ok">送信ファイル書き出し済み</span>`,
  cancelled: html`<span class="pill bad">途中で終了</span>`,
};

// Power Automate のフローが読むファイルの形。列の名前を変えるとフローも直す必要がある
const FILE = { headers: ['宛先', '件名', '本文', '状態', '番号'], widths: [34, 40, 70, 12, 10] };
const SENT_MARK = '送信済み';

function download(c, rows) {
  const body = writeXlsx({ sheet: config.sendFile.table, table: config.sendFile.table, ...FILE, rows });
  return c.body(body, 200, {
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': `attachment; filename="send.xlsx"; filename*=UTF-8''${encodeURIComponent(config.sendFile.name)}`,
  });
}

async function progress(id) {
  const rows = await q(`select status, count(*)::int n from deliveries where campaign_id = $1 group by status`, [id]);
  const m = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return { queued: m.queued ?? 0, sent: m.sent ?? 0, skipped: m.skipped ?? 0, total: rows.reduce((a, r) => a + r.n, 0) };
}

app.get('/', async (c) => {
  const rows = await q(`select cp.*, s.name segment_name from campaigns cp left join segments s on s.id = cp.segment_id order by cp.created_at desc`);
  const list = await Promise.all(rows.map(async (r) => ({ ...r, p: await progress(r.id) })));
  return page(c, {
    title: '配信', active: '/campaigns', flash: takeFlash(c),
    body: html`
<div class="row spread"><h1>配信</h1><a class="btn" href="/campaigns/new">新しい配信を作る</a></div>
<div class="card">
${list.length ? html`<div class="scroll"><table><thead><tr><th>配信</th><th>送り先</th><th>状態</th><th class="num">送った人数</th><th>日時</th></tr></thead><tbody>
${list.map((r) => html`<tr><td><a href="/campaigns/${r.id}">${r.name}</a><div class="small muted">${r.subject}</div></td>
  <td class="small">${r.segment_name ?? '未設定'}</td><td>${STATUS[r.status]}</td>
  <td class="num">${r.p.total ? `${r.p.sent} / ${r.p.total}` : '—'}</td>
  <td class="small">${fmtDate(r.exported_at ?? r.created_at)}</td></tr>`)}
</tbody></table></div>` : html`<p class="muted">まだ配信はありません。</p>`}
</div>`,
  });
});

function steps(status) {
  const labels = ['1. 本文を書く', '2. 見本を確認', '3. 人数を確認して書き出す', '4. Power Automate で送る'];
  const cur = { draft: 1, test_sent: 2, exported: 3, sent: 4, cancelled: -1 }[status];
  return html`<ol class="steps">${labels.map((l, i) => html`<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${l}</li>`)}</ol>`;
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
  setFlash(c, '保存しました。届くメールの見本を確認してください。');
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
  if (!['draft', 'test_sent'].includes(cp?.status)) { setFlash(c, '送信ファイルを書き出した配信は変更できません。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const changed = cp.subject !== b.subject || cp.body_text !== b.body_text || String(cp.segment_id) !== String(b.segment_id);
  await q(`update campaigns set name=$2, subject=$3, body_text=$4, segment_id=$5 ${changed ? `, status='draft', test_sent_at=null` : ''} where id=$1`,
    [id, b.name, b.subject, b.body_text, b.segment_id || null]);
  await audit(c, 'campaign.update', 'campaign', Number(id));
  setFlash(c, '保存しました。');
  return c.redirect(`/campaigns/${id}`);
});

// 送信ファイルの扱い方（テストと本番で同じ）
const howTo = html`<ol class="small" style="margin:0;padding-left:1.4em">
  <li>共有フォルダーの「${config.sendFile.name}」を、書き出したファイルで置き換える（同じ名前でアップロードし「置き換え」）</li>
  <li>Power Automate で「${config.sendFile.flow}」のフローを開き、「テスト」→「手動」→「フローの実行」</li>
  <li>1通ずつ間をあけて送られ、送った行の「状態」に「${SENT_MARK}」と入ります</li></ol>`;

// ファイルの書き出しはページが変わらないので、少し待ってから画面を新しくする（確認用サイトでは画面側で行う）
const reloadAfterDownload = config.demo ? '' : html`<script>document.querySelectorAll('form[data-download]').forEach((f) =>
  f.addEventListener('submit', () => { if (f.checkValidity()) setTimeout(() => location.reload(), 1500); }));</script>`;

app.get('/:id{[0-9]+}', async (c) => {
  const cp = await one(`select cp.*, s.name segment_name, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [c.req.param('id')]);
  if (!cp) return c.notFound();
  const def = cp.segment_definition ?? cp.definition ?? {};
  const [n, text, sample, p] = await Promise.all([count(def), describe(def), sampleContact(def), progress(cp.id)]);
  const preview = compose(cp, sample);
  const user = c.get('user');
  const editable = ['draft', 'test_sent'].includes(cp.status);

  return page(c, {
    title: cp.name, active: '/campaigns', flash: takeFlash(c),
    body: html`
<div class="row spread"><div><a href="/campaigns" class="small">← 配信一覧</a><h1>${cp.name} ${STATUS[cp.status]}</h1></div>
  ${editable ? html`<a class="btn sub" href="/campaigns/${cp.id}/edit">本文・送り先を編集</a>` : ''}</div>
${steps(cp.status)}

<div class="grid2 split">
<div class="card"><h2>届くメールの見本</h2>
  <p class="small muted" style="margin:0">実際に届くメールと同じ形で表示しています（文字の大きさや書体は、受け取る人のメールソフトによって変わります）。</p>
  <div class="small muted">差出人：Social Design Center &lt;${cp.from_address}&gt;　／　見本の宛先：${sample.full_name} さん</div>
  <div><b>件名：</b>${preview.subject}</div>
  <div class="mail">${raw(preview.html)}</div>
</div>

<div style="display:grid;gap:16px">
<div class="card"><h2>送り先</h2>
  <div>${cp.segment_name ?? '未設定'}</div><div class="small muted">${text}</div>
  ${editable ? html`<div class="big">${n}<span style="font-size:18px">人</span></div>` : ''}
</div>

${editable ? html`
<form class="card" method="post" action="/campaigns/${cp.id}/send-file" data-download>
  <h2>3. 人数を確認して送信ファイルを書き出す</h2>
  <p style="margin:0">この配信は <b>${n}人</b> に送られます。確認のため、人数を入力してください。</p>
  <label class="check"><input type="checkbox" id="preview_checked" name="preview_checked" value="1" required> 左の見本で、件名・本文・宛名を確認した</label>
  <label>送る人数<input type="number" id="confirm_count" name="confirm_count" inputmode="numeric" required></label>
  <div><button ${n === 0 ? 'disabled' : ''}>送信ファイルを書き出す</button></div>
  <p class="small muted" style="margin:0">書き出すと、この人たちには送ったものとして記録され、配信は変更できなくなります。</p>
  ${howTo}
</form>

<details class="card">
  <summary><b>自分あてにテストする（任意）</b></summary>
  <form method="post" action="/campaigns/${cp.id}/test-file" data-download style="display:grid;gap:12px;margin-top:12px">
    <p class="small" style="margin:0">新しい形の文面を初めて送るときなど、受け取ったときの見え方を確かめたいときに使います。自分あて1通だけのファイルを書き出し、本番と同じ手順で送ります。</p>
    <label>テストの送り先<input type="email" id="test_to" name="to" value="${user.email}" required></label>
    <div><button class="sub">テスト用ファイルを書き出す</button></div>
    ${cp.test_sent_at ? html`<div class="small ok">テスト用ファイルを書き出し済み（${fmtDate(cp.test_sent_at)}）</div>` : ''}
  </form>
</details>` : ''}

${['sent', 'exported', 'cancelled'].includes(cp.status) ? html`
<div class="card"><h2>送信の記録</h2>
  <div class="big">${p.sent}<span style="font-size:18px"> / ${p.total}人</span></div>
  <div class="small">送り残し ${p.queued}・送らなかった ${p.skipped}（書き出しの前に配信停止になった人など）</div>
  <div class="small muted">書き出し：${fmtDate(cp.exported_at)}</div>
</div>` : ''}

${cp.status === 'exported' ? html`
<form class="card" method="post" action="/campaigns/${cp.id}/rest-file" data-download>
  <h2>送り残しの人に送る</h2>
  <p class="small" style="margin:0">送り残しの${p.queued}人だけの送信ファイルを書き出します。</p>
  <div><button>送り残しの送信ファイルを書き出す（${p.queued}人分）</button></div>
  ${howTo}
</form>
<form class="card" method="post" action="/campaigns/${cp.id}/cancel">
  <h2>送り残しには送らずに終える</h2>
  <div><button class="danger">送らずに終える</button></div>
</form>` : ''}

${cp.status === 'sent' ? html`
<details class="card">
  <summary><b>途中で止まったとき</b></summary>
  <div style="display:grid;gap:12px;margin-top:12px">
    <p class="small" style="margin:0">Power Automate からエラーのメールが届いたときなど、全員に送れなかったときに使います。共有フォルダーから「${config.sendFile.name}」をダウンロードして取り込むと、「状態」が「${SENT_MARK}」になっていない人が送り残しに戻ります。</p>
    ${config.demo ? html`<div class="flash warn">確認用の画面なので、ファイルは選べません。</div>`
      : html`<form method="post" action="/campaigns/${cp.id}/result" enctype="multipart/form-data" style="display:grid;gap:12px">
      <label>共有フォルダーの「${config.sendFile.name}」（.xlsx）<input type="file" id="result_file" name="file" accept=".xlsx" required></label>
      <div><button class="sub">取り込む</button></div></form>`}
  </div>
</details>` : ''}
</div>
</div>
${reloadAfterDownload}`,
  });
});

// 送り残し（queued）をファイルにし、送信済みとして記録する。書き出す直前に配信停止になった人は外す
async function exportQueued(run, id) {
  await run(`update deliveries d set status = 'skipped', last_error = '配信停止済み'
    where d.campaign_id = $1 and d.status = 'queued' and exists (select 1 from suppressions s where s.email = d.email)`, [id]);
  const ds = await run(`select d.id, d.email, c.full_name, c.department, c.job_title, o.name org_name
    from deliveries d left join contacts c on c.id = d.contact_id left join organizations o on o.id = c.organization_id
    where d.campaign_id = $1 and d.status = 'queued' order by d.id`, [id]);
  await run(`update deliveries set status = 'sent', sent_at = now() where campaign_id = $1 and status = 'queued'`, [id]);
  await run(`update campaigns set status = 'sent', completed_at = now() where id = $1`, [id]);
  return ds;
}

// 任意のテスト：自分あて1行だけのファイル
app.post('/:id{[0-9]+}/test-file', async (c) => {
  const id = c.req.param('id');
  const to = String((await c.req.parseBody()).to ?? '').trim();
  const cp = await one(`select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [id]);
  if (!['draft', 'test_sent'].includes(cp?.status)) return c.redirect(`/campaigns/${id}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { setFlash(c, 'テストの送り先のメールアドレスを確認してください。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const msg = compose(cp, await sampleContact(cp.definition));
  await q(`update campaigns set status = 'test_sent', test_sent_at = now() where id = $1`, [id]);
  await audit(c, 'campaign.test', 'campaign', Number(id), { to });
  return download(c, [[to, `[テスト] ${msg.subject}`, msg.html, '', 'テスト']]);
});

// 本番：人数を確かめて送り先を確定し、そのまま送信ファイルを書き出す
app.post('/:id{[0-9]+}/send-file', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.parseBody();
  const cp = await one(`select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [id]);
  const back = (text) => { setFlash(c, text, 'bad'); return c.redirect(`/campaigns/${id}`); };
  if (!['draft', 'test_sent'].includes(cp?.status)) return back('この配信は、もう送信ファイルを書き出しています。');
  if (!cp.segment_id) return back('先に送り先を選んでください。');
  if (!b.preview_checked) return back('見本を確認してから書き出してください。');
  const n = await count(cp.definition);
  if (Number(b.confirm_count) !== n) return back(`入力された人数（${b.confirm_count}）が実際の人数（${n}人）と違います。送り先を確認してください。`);
  const { where, params } = toSql(cp.definition);
  const ds = await tx(async (run) => {
    await run(`insert into deliveries (campaign_id, contact_id, email)
      select $${params.length + 1}, c.id, c.email from sendable_contacts c where ${where}
      on conflict (campaign_id, email) do nothing`, [...params, id]);
    await run(`update campaigns set exported_at = now(), confirmed_count = $2, confirmed_by = $3, segment_definition = $4 where id = $1`,
      [id, n, c.get('user').id, JSON.stringify(cp.definition)]);
    return exportQueued(run, id);
  });
  await audit(c, 'campaign.export', 'campaign', id, { count: ds.length });
  return download(c, ds.map((d) => [d.email, compose(cp, d).subject, compose(cp, d).html, '', String(d.id)]));
});

// 途中で止まったあと：送り残しだけのファイル
app.post('/:id{[0-9]+}/rest-file', async (c) => {
  const id = Number(c.req.param('id'));
  const cp = await one(`select * from campaigns where id = $1`, [id]);
  if (cp?.status !== 'exported') return c.redirect(`/campaigns/${id}`);
  const ds = await tx((run) => exportQueued(run, id));
  await audit(c, 'campaign.export', 'campaign', id, { count: ds.length, rest: true });
  return download(c, ds.map((d) => [d.email, compose(cp, d).subject, compose(cp, d).html, '', String(d.id)]));
});

// 途中で止まったとき：共有フォルダーのファイルを取り込み、「送信済み」でない人を送り残しに戻す。ファイルは読むだけで保存しない
app.post('/:id{[0-9]+}/result', async (c) => {
  const id = Number(c.req.param('id'));
  if (config.demo) return c.text('確認用の画面ではファイルを取り込めません。', 403);
  const back = (text, kind = 'bad') => { setFlash(c, text, kind); return c.redirect(`/campaigns/${id}`); };
  const cp = await one(`select status from campaigns where id = $1`, [id]);
  if (cp?.status !== 'sent') return back('この配信は結果を取り込める状態ではありません。');
  const file = (await c.req.parseBody()).file;
  if (!file || typeof file === 'string' || !file.size) return back('ファイルを選んでください。');
  let rows;
  try {
    const { readXlsx } = await import('../xlsx-read.js');
    rows = readXlsx(await file.arrayBuffer()).find((s) => s.rows[0]?.includes('番号'))?.rows;
  } catch (e) {
    return back(`ファイルを読めませんでした（${e.message}）。`);
  }
  if (!rows) return back('送信ファイルの形になっていません（「番号」の列がありません）。');
  const [head, ...body] = rows;
  const iNo = head.indexOf('番号'), iState = head.indexOf('状態');
  if (body.some((r) => r[iNo] === 'テスト')) return back('これはテスト用のファイルです。');
  const ours = new Set((await q(`select id from deliveries where campaign_id = $1`, [id])).map((d) => Number(d.id)));
  if (!body.some((r) => ours.has(Number(r[iNo])))) return back('別の配信のファイルのようです（番号が合いません）。');
  const unsent = body.filter((r) => String(r[iState] ?? '').trim() !== SENT_MARK).map((r) => Number(r[iNo])).filter((x) => ours.has(x));
  if (!unsent.length) return back('ファイルの全員が「送信済み」でした。送り残しはありません。', 'ok');
  await tx(async (run) => {
    for (const did of unsent) await run(`update deliveries set status = 'queued', sent_at = null where id = $1 and status = 'sent'`, [did]);
    await run(`update campaigns set status = 'exported', completed_at = null where id = $1`, [id]);
  });
  await audit(c, 'campaign.result', 'campaign', id, { unsent: unsent.length });
  return back(`${unsent.length}人が送り残しでした。「送り残しの送信ファイルを書き出す」から送ってください。`, 'warn');
});

app.post('/:id{[0-9]+}/cancel', async (c) => {
  const id = c.req.param('id');
  await tx(async (run) => {
    await run(`update deliveries set status = 'skipped', last_error = '途中で終了' where campaign_id = $1 and status = 'queued'`, [id]);
    await run(`update campaigns set status = 'cancelled', completed_at = now() where id = $1 and status = 'exported'`, [id]);
  });
  await audit(c, 'campaign.cancel', 'campaign', Number(id));
  setFlash(c, '送り残しには送らずに終えました。', 'warn');
  return c.redirect(`/campaigns/${id}`);
});

export default app;
