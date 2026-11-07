// 配信：本文を書く → テスト用ファイル → 人数を確認して確定 → 送信ファイルを書き出す → 送り終えたファイルを取り込む
// メールを送るのは Power Automate（OneDrive の「配信.xlsx」を1行ずつ、間をあけて共有メールボックスから送るフロー）。
// CRM は「誰に・何を送るか」を決めてファイルにし、送った結果を記録する。
import { Hono } from 'hono';
import { html } from 'hono/html';
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
  exported: html`<span class="pill warn">送信中</span>`,
  sent: html`<span class="pill ok">送信完了</span>`,
  cancelled: html`<span class="pill bad">途中で終了</span>`,
};

// Power Automate のフローが読むファイルの形。列の名前を変えるとフローも直す必要がある
const FILE = { headers: ['宛先', '件名', '本文', '状態', '番号'], widths: [34, 40, 70, 12, 10] };
const SENT_MARK = '送信済み';

function download(c, rows) {
  const body = writeXlsx({ sheet: config.sendFile.table, table: config.sendFile.table, ...FILE, rows });
  const name = config.sendFile.name;
  return c.body(body, 200, {
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': `attachment; filename="send.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
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
${list.length ? html`<div class="scroll"><table><thead><tr><th>配信</th><th>送り先</th><th>状態</th><th class="num">送信済み</th><th>日時</th></tr></thead><tbody>
${list.map((r) => html`<tr><td><a href="/campaigns/${r.id}">${r.name}</a><div class="small muted">${r.subject}</div></td>
  <td class="small">${r.segment_name ?? '未設定'}</td><td>${STATUS[r.status]}</td>
  <td class="num">${r.p.total ? `${r.p.sent} / ${r.p.total}` : '—'}</td>
  <td class="small">${fmtDate(r.completed_at ?? r.exported_at ?? r.created_at)}</td></tr>`)}
</tbody></table></div>` : html`<p class="muted">まだ配信はありません。</p>`}
</div>`,
  });
});

function steps(status) {
  const labels = ['1. 本文を書く', '2. テスト', '3. 人数を確認', '4. 送信ファイルで送る', '5. 結果を取り込む'];
  const cur = { draft: 1, test_sent: 2, exported: 3, sent: 5, cancelled: -1 }[status];
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
${cp?.status === 'test_sent' ? html`<div class="flash warn">件名・本文・送り先を変えて保存すると、テストをやり直す必要があります。</div>` : ''}
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
  setFlash(c, '保存しました。次は自分あてのテストです。');
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
  if (!['draft', 'test_sent'].includes(cp?.status)) { setFlash(c, '送り先を確定した配信は変更できません。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const changed = cp.subject !== b.subject || cp.body_text !== b.body_text || String(cp.segment_id) !== String(b.segment_id);
  await q(`update campaigns set name=$2, subject=$3, body_text=$4, segment_id=$5 ${changed ? `, status='draft', test_sent_at=null` : ''} where id=$1`,
    [id, b.name, b.subject, b.body_text, b.segment_id || null]);
  await audit(c, 'campaign.update', 'campaign', Number(id));
  const redo = changed && cp.status === 'test_sent';
  setFlash(c, redo ? '保存しました。内容が変わったので、もう一度テストしてください。' : '保存しました。', redo ? 'warn' : 'ok');
  return c.redirect(`/campaigns/${id}`);
});

// 送信ファイルの扱い方（テストと本番で同じ）
const howTo = html`<ol class="small" style="margin:0;padding-left:1.4em">
  <li>OneDrive の「${config.sendFile.name}」を、書き出したファイルで置き換える（同じ名前でアップロードし「置き換え」）</li>
  <li>Power Automate で「${config.sendFile.flow}」のフローを開き、「テスト」→「手動」→「フローの実行」</li>
  <li>終わると、ファイルの「状態」の列に「${SENT_MARK}」と入ります</li></ol>`;

// ファイルの書き出しはページが変わらないので、少し待ってから画面を新しくする（確認用サイトでは画面側で行う）
const reloadAfterDownload = config.demo ? '' : html`<script>document.querySelectorAll('[data-download]').forEach((el) =>
  el.addEventListener(el.tagName === 'FORM' ? 'submit' : 'click', () => setTimeout(() => location.reload(), 1500)));</script>`;

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

<div class="grid2" style="grid-template-columns:minmax(0,3fr) minmax(280px,2fr);align-items:start">
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
<form class="card" method="post" action="/campaigns/${cp.id}/test-file" data-download>
  <h2>2. 自分あてにテストする</h2>
  <p class="small" style="margin:0">自分あて1通だけのファイルを書き出して送り、届いたメールの見た目を確認します。</p>
  <label>テストの送り先<input type="email" id="test_to" name="to" value="${user.email}" required></label>
  <div><button class="${cp.status === 'test_sent' ? 'sub' : ''}">テスト用ファイルを書き出す</button></div>
  ${howTo}
  ${cp.test_sent_at ? html`<div class="small ok">テスト用ファイルを書き出し済み（${fmtDate(cp.test_sent_at)}）</div>` : ''}
</form>

<form class="card" method="post" action="/campaigns/${cp.id}/confirm">
  <h2>3. 人数を確認して送り先を確定</h2>
  ${cp.status !== 'test_sent' ? html`<p class="muted" style="margin:0">テスト用ファイルを書き出すと、ここに進めます。</p>` : html`
  <p style="margin:0">この配信は <b>${n}人</b> に送られます。確認のため、人数を入力してください。</p>
  <label class="check"><input type="checkbox" id="test_checked" name="test_checked" value="1" required> テストメールが届き、見た目に問題がないことを確認した</label>
  <label>送る人数<input type="number" id="confirm_count" name="confirm_count" inputmode="numeric" required></label>
  <div><button ${n === 0 ? 'disabled' : ''}>送り先を確定する</button></div>`}
</form>` : ''}

${cp.status === 'exported' ? html`
<div class="card"><h2>4. 送信ファイルで送る</h2>
  <div class="big">${p.queued}<span style="font-size:18px">人 まだ送っていない</span></div>
  <div class="small">送信済み ${p.sent}・送らない ${p.skipped}（確定後に配信停止になった人など）</div>
  ${p.queued ? html`<div><a class="btn" href="/campaigns/${cp.id}/file" data-download>送信ファイルを書き出す（${p.queued}人分）</a></div>` : ''}
  ${howTo}
  <p class="small muted" style="margin:0">送信ファイルには、まだ送っていない人だけが入ります。途中で止まったときは、結果を取り込んでから書き出し直すと、残りの人だけのファイルになります。</p>
</div>

<form class="card" method="post" action="/campaigns/${cp.id}/result" enctype="multipart/form-data">
  <h2>5. 送り終わったファイルを取り込む</h2>
  <p class="small" style="margin:0">OneDrive から「${config.sendFile.name}」をダウンロードして取り込むと、「${SENT_MARK}」の人を送信済みとして記録します。</p>
  ${config.demo ? html`<div class="flash warn">確認用の画面なので、ファイルは選べません。下のボタンで、全員に送ったことにして記録できます。</div>
  <div><button formaction="/campaigns/${cp.id}/result-sample">全員に送ったことにする（確認用）</button></div>`
    : html`<label>送り終わったファイル（.xlsx）<input type="file" id="result_file" name="file" accept=".xlsx" required></label>
  <div><button>取り込む</button></div>`}
</form>

<form class="card" method="post" action="/campaigns/${cp.id}/cancel">
  <h2>残りを送らずに終える</h2>
  <p class="small" style="margin:0">内容に誤りがあったときなどに使います。まだ送っていない${p.queued}人には送らなかったことになります。Power Automate のフローが動いている場合は、先にフローを止めてください。</p>
  <div><button class="danger">残りを送らずに終える</button></div>
</form>` : ''}

${['sent', 'cancelled'].includes(cp.status) ? html`
<div class="card"><h2>送信の結果</h2>
  <div class="big">${p.sent}<span style="font-size:18px"> / ${p.total}人</span></div>
  <div class="small">送らなかった ${p.skipped + p.queued}</div>
  <div class="small muted">確定：${fmtDate(cp.exported_at)}${cp.completed_at ? html`　完了：${fmtDate(cp.completed_at)}` : ''}</div>
</div>` : ''}
</div>
</div>
${reloadAfterDownload}`,
  });
});

// テスト：自分あて1行だけのファイル。書き出したらテスト済みとし、確定のときに「届いて確認した」にチェックしてもらう
app.post('/:id{[0-9]+}/test-file', async (c) => {
  const id = c.req.param('id');
  const to = String((await c.req.parseBody()).to ?? '').trim();
  const cp = await one(`select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [id]);
  if (!['draft', 'test_sent'].includes(cp?.status)) return c.redirect(`/campaigns/${id}`);
  if (!cp.segment_id) { setFlash(c, '先に送り先を選んでください。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { setFlash(c, 'テストの送り先のメールアドレスを確認してください。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const msg = compose(cp, await sampleContact(cp.definition));
  await q(`update campaigns set status = 'test_sent', test_sent_at = now() where id = $1`, [id]);
  await audit(c, 'campaign.test', 'campaign', Number(id), { to });
  return download(c, [[to, `[テスト] ${msg.subject}`, msg.html, '', 'テスト']]);
});

app.post('/:id{[0-9]+}/confirm', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.parseBody();
  const cp = await one(`select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1`, [id]);
  if (cp?.status !== 'test_sent') { setFlash(c, 'テストが済んでいません。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  if (!b.test_checked) { setFlash(c, 'テストメールが届いたことを確かめてから確定してください。', 'bad'); return c.redirect(`/campaigns/${id}`); }
  const n = await count(cp.definition);
  if (Number(b.confirm_count) !== n) {
    setFlash(c, `入力された人数（${b.confirm_count}）が実際の人数（${n}人）と違います。送り先を確認してください。`, 'bad');
    return c.redirect(`/campaigns/${id}`);
  }
  const { where, params } = toSql(cp.definition);
  await tx(async (run) => {
    await run(`insert into deliveries (campaign_id, contact_id, email)
      select $${params.length + 1}, c.id, c.email from sendable_contacts c where ${where}
      on conflict (campaign_id, email) do nothing`, [...params, id]);
    await run(`update campaigns set status = 'exported', exported_at = now(), confirmed_count = $2, confirmed_by = $3, segment_definition = $4 where id = $1`,
      [id, n, c.get('user').id, JSON.stringify(cp.definition)]);
  });
  await audit(c, 'campaign.confirm', 'campaign', Number(id), { count: n });
  setFlash(c, `${n}人を送り先として確定しました。送信ファイルを書き出して送ってください。`);
  return c.redirect(`/campaigns/${id}`);
});

// 送信ファイル：まだ送っていない人だけ。確定後に配信停止になった人は、ここで外す
app.get('/:id{[0-9]+}/file', async (c) => {
  const id = c.req.param('id');
  const cp = await one(`select * from campaigns where id = $1`, [id]);
  if (cp?.status !== 'exported') return c.redirect(`/campaigns/${id}`);
  await q(`update deliveries d set status = 'skipped', last_error = '配信停止済み'
    where d.campaign_id = $1 and d.status = 'queued' and exists (select 1 from suppressions s where s.email = d.email)`, [id]);
  const ds = await q(`select d.id, d.email, c.full_name, c.department, c.job_title, o.name org_name
    from deliveries d left join contacts c on c.id = d.contact_id left join organizations o on o.id = c.organization_id
    where d.campaign_id = $1 and d.status = 'queued' order by d.id`, [id]);
  await audit(c, 'campaign.export', 'campaign', Number(id), { count: ds.length });
  return download(c, ds.map((d) => {
    const msg = compose(cp, d);
    return [d.email, msg.subject, msg.html, '', String(d.id)];
  }));
});

async function finish(run, id) {
  await run(`update campaigns set status = 'sent', completed_at = now()
    where id = $1 and status = 'exported' and not exists (select 1 from deliveries where campaign_id = $1 and status = 'queued')`, [id]);
}

// 送り終えたファイルを取り込む。ファイルは読むだけで保存しない
app.post('/:id{[0-9]+}/result', async (c) => {
  const id = Number(c.req.param('id'));
  if (config.demo) return c.text('確認用の画面ではファイルを取り込めません。', 403);
  const back = (text, kind = 'bad') => { setFlash(c, text, kind); return c.redirect(`/campaigns/${id}`); };
  const cp = await one(`select status from campaigns where id = $1`, [id]);
  if (cp?.status !== 'exported') return back('この配信は結果を取り込める状態ではありません。');
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
  if (body.some((r) => r[iNo] === 'テスト')) return back('これはテスト用のファイルです。本番の送信ファイルを取り込んでください。');
  const sentIds = body.filter((r) => String(r[iState] ?? '').trim() === SENT_MARK).map((r) => Number(r[iNo])).filter(Number.isInteger);
  const ours = new Set((await q(`select id from deliveries where campaign_id = $1`, [id])).map((d) => Number(d.id)));
  if (!body.some((r) => ours.has(Number(r[iNo])))) return back('別の配信のファイルのようです（番号が合いません）。');
  let marked = 0;
  await tx(async (run) => {
    for (const did of sentIds.filter((x) => ours.has(x))) {
      const r = await run(`update deliveries set status = 'sent', sent_at = now() where id = $1 and status = 'queued' returning id`, [did]);
      marked += r.length;
    }
    await finish(run, id);
  });
  await audit(c, 'campaign.result', 'campaign', id, { marked });
  const p = await progress(id);
  return back(p.queued
    ? `${marked}人を送信済みとして記録しました。まだ送っていない人が${p.queued}人います。送信ファイルを書き出し直すと、その人たちだけが入ります。`
    : `${marked}人を送信済みとして記録しました。この配信は送信完了です。`, p.queued ? 'warn' : 'ok');
});

// 確認用サイト専用：ファイルの代わりに、全員に送ったことにする
app.post('/:id{[0-9]+}/result-sample', async (c) => {
  if (!config.demo) return c.notFound();
  const id = Number(c.req.param('id'));
  await tx(async (run) => {
    await run(`update deliveries d set status = 'skipped', last_error = '配信停止済み'
      where d.campaign_id = $1 and d.status = 'queued' and exists (select 1 from suppressions s where s.email = d.email)`, [id]);
    await run(`update deliveries set status = 'sent', sent_at = now() where campaign_id = $1 and status = 'queued'`, [id]);
    await finish(run, id);
  });
  setFlash(c, '全員に送ったことにして記録しました（確認用）。');
  return c.redirect(`/campaigns/${id}`);
});

app.post('/:id{[0-9]+}/cancel', async (c) => {
  const id = c.req.param('id');
  await tx(async (run) => {
    await run(`update deliveries set status = 'skipped', last_error = '途中で終了' where campaign_id = $1 and status = 'queued'`, [id]);
    await run(`update campaigns set status = 'cancelled', completed_at = now() where id = $1 and status = 'exported'`, [id]);
  });
  await audit(c, 'campaign.cancel', 'campaign', Number(id));
  setFlash(c, '残りを送らずに終えました。Power Automate のフローが動いていないかも確認してください。', 'warn');
  return c.redirect(`/campaigns/${id}`);
});

export default app;
