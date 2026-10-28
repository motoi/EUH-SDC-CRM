// Excel からの取り込み：ファイルを選ぶ → 確認画面（追加・更新・飛ばす・エラー）→ 取り込む
// 確認用サイトではファイルを受け付けず、架空の見本データでだけ試せる
import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one, tx } from '../db.js';
import { page, setFlash, takeFlash, fmtDate } from '../layout.js';
import { audit } from '../auth.js';
import { config } from '../config.js';
import { COLUMNS, records, stage, apply } from '../importer.js';

const app = new Hono();
const SOURCE_KINDS = ['名刺交換', 'イベント申込', '問い合わせ', '手入力', 'その他'];
const CONSENT = { business_card: '名刺など書面で受け取った', opt_in: 'フォーム等で案内の受信に同意', unknown: '不明（配信の対象にしない）' };
const ACTION = {
  create: html`<span class="pill ok">追加</span>`, update: html`<span class="pill info">更新</span>`,
  skip: html`<span class="pill">飛ばす</span>`, error: html`<span class="pill bad">エラー</span>`,
};
const val = (b, k) => { const v = String(b[k] ?? '').trim(); return v || null; };

app.get('/', async (c) => {
  const batches = await q(`select b.*, u.name from import_batches b left join staff_users u on u.id = b.imported_by order by b.id desc limit 20`);
  return page(c, {
    title: 'Excel から取り込む', active: '/contacts', flash: takeFlash(c),
    body: html`
<div><a href="/contacts" class="small">← 連絡先一覧</a><h1>Excel から取り込む</h1></div>
<p class="lead">事務局の Excel をそのまま取り込めます。取り込む前に確認画面が出るので、その時点ではまだ何も変わりません。</p>

<div class="grid2" style="grid-template-columns:minmax(0,3fr) minmax(260px,2fr);align-items:start">
<form class="card" method="post" action="/contacts/import" enctype="multipart/form-data">
  <h2>1. ファイルと取り込み方を選ぶ</h2>
  ${config.demo ? html`<div class="flash warn">確認用の画面なので、ファイルは選べません。下の「見本のデータで試す」で、架空のデータを使って取り込みの流れを試せます。</div>`
    : html`<label>Excel ファイル（.xlsx）<span class="hint">シート「顧客」があればそれを、なければ最初のシートを読みます</span>
    <input type="file" id="file" name="file" accept=".xlsx" required></label>`}
  <fieldset><legend>全員に共通で記録すること</legend>
    <div class="grid2">
      <label>どこで知り合ったか<select id="source_kind" name="source_kind">${SOURCE_KINDS.map((s) => html`<option>${s}</option>`)}</select></label>
      <label>詳細<span class="hint">例：2026年度 名刺整理、イベント名</span><input type="text" id="source_detail" name="source_detail"></label>
      <label>メールを送ってよい根拠<select id="consent_basis" name="consent_basis" required>
        <option value="">選んでください</option>${Object.entries(CONSENT).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
      <label>日付<input type="date" id="acquired_on" name="acquired_on"></label>
    </div>
  </fieldset>
  <div class="row">${config.demo
    ? html`<button formaction="/contacts/import/sample">見本のデータで試す</button>`
    : html`<button>確認画面へ</button>`}</div>
</form>

<div class="card"><h2>Excel の形</h2>
  <p class="small" style="margin:0">1行目を見出しにして、次の名前の列を並べます。順番は自由です。<b>太字</b>の列は必ず必要です。</p>
  <table><tbody>${Object.keys(COLUMNS).map((h) => html`<tr><td>${['氏名', '企業・団体名', 'メールアドレス'].includes(h) ? html`<b>${h}</b>` : h}</td></tr>`)}</tbody></table>
  <ul class="small" style="margin:0;padding-left:1.2em">
    <li>同じメールアドレスの人がすでにいれば、その人を更新します。メールアドレスがない行は、氏名と企業・団体名が同じ人を更新します。</li>
    <li>空欄のセルで、登録済みの値を消すことはしません。</li>
    <li>興味分類は「新規事業,リベラルアーツ」のようにカンマ区切りで書きます。登録済みの興味に足されます。</li>
    <li>部署・役職の「なし」は空欄として扱います。</li>
  </ul>
</div>
</div>

<div class="card"><h2>これまでの取り込み</h2>
  ${batches.length ? html`<div class="scroll"><table><thead><tr><th>日時</th><th>ファイル</th><th>担当</th><th>状態</th><th class="num">追加</th><th class="num">更新</th><th class="num">飛ばした</th></tr></thead><tbody>
  ${batches.map((b) => html`<tr><td class="small">${fmtDate(b.imported_at)}</td><td><a href="/contacts/import/${b.id}">${b.filename}</a></td><td>${b.name ?? ''}</td>
    <td>${b.status === 'done' ? html`<span class="pill ok">取り込み済み</span>` : b.status === 'preview' ? html`<span class="pill warn">確認中</span>` : html`<span class="pill">やめた</span>`}</td>
    <td class="num">${b.status === 'done' ? b.created_count : ''}</td><td class="num">${b.status === 'done' ? b.updated_count : ''}</td><td class="num">${b.status === 'done' ? b.skipped_count : ''}</td></tr>`)}
  </tbody></table></div>` : html`<p class="muted">まだありません。</p>`}
</div>`,
  });
});

function options(b) {
  return { source_kind: SOURCE_KINDS.includes(b.source_kind) ? b.source_kind : 'その他', source_detail: val(b, 'source_detail'),
    consent_basis: val(b, 'consent_basis'), acquired_on: val(b, 'acquired_on') };
}

async function saveBatch(c, filename, sheetName, recs, opts) {
  const staged = await stage(q, recs);
  const r = await one(`insert into import_batches (filename, sheet_name, options, staged, imported_by, row_count) values ($1,$2,$3,$4,$5,$6) returning id`,
    [filename, sheetName, JSON.stringify(opts), JSON.stringify(staged), c.get('user').id, staged.summary.total]);
  return c.redirect(`/contacts/import/${r.id}`);
}

app.post('/', async (c) => {
  if (config.demo) return c.text('確認用の画面ではファイルを取り込めません。', 403);
  const b = await c.req.parseBody();
  const opts = options(b);
  if (!opts.consent_basis) { setFlash(c, '「メールを送ってよい根拠」を選んでください。', 'bad'); return c.redirect('/contacts/import'); }
  const file = b.file;
  if (!file || typeof file === 'string' || !file.size) { setFlash(c, 'ファイルを選んでください。', 'bad'); return c.redirect('/contacts/import'); }

  let sheets;
  try {
    // ファイルはメモリ上で読むだけで、保存はしない
    const { readXlsx } = await import('../xlsx-read.js');
    sheets = readXlsx(await file.arrayBuffer());
  } catch (e) {
    setFlash(c, `ファイルを読めませんでした（${e.message}）。Excel で「.xlsx」形式で保存し直してください。`, 'bad');
    return c.redirect('/contacts/import');
  }
  const sheet = sheets.find((s) => s.name === '顧客') ?? sheets[0];
  const { records: recs, missing } = records(sheet?.rows ?? []);
  if (missing.length) {
    setFlash(c, `シート「${sheet?.name ?? ''}」に、必要な列「${missing.join('」「')}」が見つかりません。1行目の見出しを確認してください。`, 'bad');
    return c.redirect('/contacts/import');
  }
  if (!recs.length) { setFlash(c, '取り込む行がありません。', 'bad'); return c.redirect('/contacts/import'); }
  return saveBatch(c, file.name, sheet.name, recs, opts);
});

// 確認用サイト専用：架空の見本データで取り込みを試す（追加・更新・飛ばす・エラーがすべて出るようにしてある）
app.post('/sample', async (c) => {
  if (!config.demo) return c.notFound();
  const b = await c.req.parseBody();
  const opts = options(b);
  if (!opts.consent_basis) { setFlash(c, '「メールを送ってよい根拠」を選んでください。', 'bad'); return c.redirect('/contacts/import'); }
  const existing = await one(`select c.full_name, c.email, o.name org from contacts c join organizations o on o.id = c.organization_id where c.email is not null order by c.id limit 1`);
  const H = Object.keys(COLUMNS);
  const rows = [H,
    ['見本 一郎', '株式会社サンプル物産', '経営企画部', '代表取締役', 'ichiro@example.jp', '広島県広島市中区', '中堅企業', '卸売', '新規事業,DX'],
    ['見本 二郎', '株式会社サンプル物産', '営業部', '課長', 'jiro@example.jp', '広島県広島市中区', '中堅企業', '卸売', '人材育成'],
    ['見本 三子', 'サンプル大学', '人間社会学部', '准教授', 'mitsuko@example.jp', '広島県東広島市', '教育機関', '教育', 'リベラルアーツ、ソーシャルデザイン'],
    ['見本 四郎', 'サンプル市役所（架空）', 'なし', '主査', '', '広島県福山市', 'その他', '行政', '地域共創'],
    [existing.full_name, existing.org, '新規事業開発室', 'シニアマネージャー', existing.email, '', '', '', '新規事業'],
    ['見本 五郎', '株式会社サンプル物産', '営業部', '主任', 'jiro@example.jp', '', '', '', ''],
    ['', '株式会社サンプル食品', '総務部', '部長', 'nanashi@example.jp', '岡山県岡山市北区', '中小企業', '食品', ''],
    ['見本 六子', '株式会社サンプル食品', '総務部', '一般', 'rokuko@example', '', '零細', '食品', ''],
  ];
  const { records: recs } = records(rows);
  return saveBatch(c, '見本データ（架空）.xlsx', '顧客', recs, opts);
});

app.get('/:id{[0-9]+}', async (c) => {
  const b = await one(`select b.*, u.name from import_batches b left join staff_users u on u.id = b.imported_by where b.id = $1`, [c.req.param('id')]);
  if (!b) return c.notFound();
  const o = b.options;
  const head = html`<div><a href="/contacts/import" class="small">← Excel から取り込む</a><h1>${b.filename}</h1>
    <div class="muted small">シート「${b.sheet_name ?? ''}」・${b.row_count}行・${b.name ?? ''}さん・${fmtDate(b.imported_at)}</div></div>
    <div class="small">全員に記録すること：${o.source_kind}${o.source_detail ? `（${o.source_detail}）` : ''}／送ってよい根拠：${CONSENT[o.consent_basis]}${o.acquired_on ? `／${o.acquired_on}` : ''}</div>`;

  if (b.status !== 'preview') {
    return page(c, {
      title: b.filename, active: '/contacts', flash: takeFlash(c),
      body: html`${head}<div class="card">${b.status === 'done'
        ? html`<h2>取り込み済み</h2><div class="row" style="gap:32px">
            <div><div class="muted small">追加</div><div class="big">${b.created_count}</div></div>
            <div><div class="muted small">更新</div><div class="big">${b.updated_count}</div></div>
            <div><div class="muted small">飛ばした・エラー</div><div class="big">${b.skipped_count}</div></div></div>
            <div><a href="/contacts">連絡先一覧を見る</a></div>`
        : html`<p class="muted">この取り込みはやめました。データは何も変わっていません。</p>`}</div>`,
    });
  }

  const { rows, summary: s } = b.staged;
  const order = { error: 0, skip: 1, update: 2, create: 3 };
  const shown = [...rows].sort((a, z) => order[a.action] - order[z.action] || a.line - z.line).slice(0, 500);
  return page(c, {
    title: b.filename, active: '/contacts', flash: takeFlash(c),
    body: html`${head}
<div class="card"><h2>2. 内容を確認する</h2>
  <p class="small muted" style="margin:0">まだ何も変わっていません。内容を確かめてから「取り込む」を押してください。エラーと飛ばす行は取り込まれません。</p>
  <div class="row" style="gap:32px">
    <div><div class="muted small">追加</div><div class="big">${s.create}</div></div>
    <div><div class="muted small">更新</div><div class="big">${s.update}</div></div>
    <div><div class="muted small">飛ばす</div><div class="big">${s.skip}</div></div>
    <div><div class="muted small">エラー</div><div class="big" style="color:${s.error ? 'var(--bad)' : 'inherit'}">${s.error}</div></div>
  </div>
  <div class="row">
    <form method="post" action="/contacts/import/${b.id}/apply"><button ${s.create + s.update === 0 ? 'disabled' : ''}>取り込む（追加${s.create}件・更新${s.update}件）</button></form>
    <form method="post" action="/contacts/import/${b.id}/cancel"><button class="sub">やめる</button></form>
  </div>
  ${s.error ? html`<p class="small" style="margin:0">エラーの行を直したいときは、Excel を直してから最初からやり直してください。</p>` : ''}
</div>
<div class="card"><div class="scroll"><table>
  <thead><tr><th class="num">行</th><th>判定</th><th>氏名</th><th>企業・団体名</th><th>役職</th><th>メールアドレス</th><th>興味分類</th><th>メモ</th></tr></thead>
  <tbody>${shown.map((r) => html`<tr><td class="num small">${r.line}</td><td>${ACTION[r.action]}</td><td>${r.data.full_name}</td>
    <td class="small">${r.data.org_name}</td><td class="small">${r.data.job_title}</td><td class="small">${r.data.email}</td><td class="small">${r.data.interests}</td>
    <td class="small">${r.notes.join('。')}</td></tr>`)}</tbody>
</table></div>${rows.length > shown.length ? html`<p class="small muted">先頭の${shown.length}行を表示しています。</p>` : ''}</div>`,
  });
});

app.post('/:id{[0-9]+}/apply', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await one(`select * from import_batches where id = $1 and status = 'preview'`, [id]);
  if (!b) return c.redirect(`/contacts/import/${id}`);
  const s = await tx((run) => apply(run, b));
  await audit(c, 'import.apply', 'import', id, s);
  setFlash(c, `取り込みました：追加${s.create}件・更新${s.update}件${s.skip + s.error ? `（${s.skip + s.error}行は飛ばしました）` : ''}。`);
  return c.redirect(`/contacts/import/${id}`);
});

app.post('/:id{[0-9]+}/cancel', async (c) => {
  const id = Number(c.req.param('id'));
  await q(`update import_batches set status = 'cancelled', staged = null where id = $1 and status = 'preview'`, [id]);
  setFlash(c, '取り込みをやめました。データは変わっていません。', 'warn');
  return c.redirect('/contacts/import');
});

export default app;
