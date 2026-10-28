// 事務局の Excel（1行目が見出し）を取り込む。人はメールアドレスで見分ける。
//   シート「顧客」          … 連絡先の一覧
//   それ以外のシート        … シート名のイベントの参加者一覧（イベントがなければ作る）
// 1. readSheets：シートごとに見出しを確かめ、行を項目に直す
// 2. stage：各行を「追加・更新・飛ばす・エラー」に判定する（データは変えない）
// 3. apply：確認後に、上の行から順に書き込む。空欄のセルで既存の値を消すことはしない
import { normalizeOrg } from './routes/contacts.js';
import { SIZE_CLASSES, PART_STATUS, splitInterests } from './segment.js';
import { classifyJobTitle } from './job-level.js';

export const CUSTOMER_SHEET = '顧客';
export const COLUMNS = {
  '氏名': 'full_name', '企業・団体名': 'org_name', '部署': 'department', '役職': 'job_title', 'メールアドレス': 'email',
  '団体所在地': 'location', '企業分類1': 'size_class', '企業分類2': 'industry', '興味分類': 'interests',
  '参加状況': 'status',   // イベントのシートだけで使う（なければ「参加」）
};
const REQUIRED = { customer: ['氏名', '企業・団体名', 'メールアドレス'], event: ['メールアドレス'] };
const STATUS_BY_LABEL = Object.fromEntries(Object.entries(PART_STATUS).map(([k, v]) => [v, k]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_WORDS = /^(なし|無し|-|－|ー)$/;

const norm = (v) => String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

// 1枚のシート → 種類（顧客／イベント）、足りない見出し、Excel の行番号つきの項目
export function readSheet(name, rows) {
  const kind = norm(name) === CUSTOMER_SHEET ? 'customer' : 'event';
  const headerAt = rows.findIndex((r) => r?.some((v) => norm(v)));
  const header = (rows[headerAt] ?? []).map(norm);
  const index = Object.fromEntries(Object.keys(COLUMNS).map((h) => [COLUMNS[h], header.indexOf(h)]));
  const missing = REQUIRED[kind].filter((h) => !header.includes(h));
  const records = [];
  rows.slice(headerAt + 1).forEach((r, i) => {
    if (!r?.some((v) => norm(v))) return;   // 空の行は数えない
    const data = {};
    for (const [key, at] of Object.entries(index)) data[key] = at >= 0 ? norm(r[at]) : '';
    for (const key of ['department', 'job_title', 'location']) if (EMPTY_WORDS.test(data[key])) data[key] = '';
    data.email = data.email.toLowerCase();
    records.push({ sheet: name, kind, line: headerAt + i + 2, data });
  });
  return { name, kind, event: kind === 'event' ? norm(name) : null, missing, records };
}

// 各行の判定。run は (sql, params) => rows。ファイルの中で先に追加される人も考える
export async function stage(run, sheets) {
  const willCreate = new Map();   // email → 追加される行（シート名と行番号）
  const rows = [];
  const sheetInfo = [];
  for (const sh of sheets) {
    const seen = new Map();
    let eventNote = null;
    if (sh.event) {
      const [ev] = await run(`select id from events where name = $1 order by id limit 1`, [sh.event]);
      eventNote = ev ? '既存のイベント' : '新しく作るイベント';
    }
    for (const { line, data } of sh.records) {
      const notes = [];
      let action = null;
      if (!data.email) { action = 'error'; notes.push('メールアドレスが空欄です（メールアドレスで人を見分けます）'); }
      else if (!EMAIL.test(data.email)) { action = 'error'; notes.push(`メールアドレス「${data.email}」の形が正しくありません`); }
      if (data.size_class && !SIZE_CLASSES.includes(data.size_class)) {
        notes.push(`企業分類1「${data.size_class}」は区分（${SIZE_CLASSES.join('・')}）にないため空欄にします`);
        data.size_class = '';
      }
      if (sh.event) {
        // 「参加」などの表示名を attended などに直す（取り込み時にもう一度判定するので、直した後の値もそのまま通す）
        const status = PART_STATUS[data.status] ? data.status : data.status ? STATUS_BY_LABEL[data.status] : 'attended';
        if (!status) { action = 'error'; notes.push(`参加状況「${data.status}」は ${Object.values(PART_STATUS).join('・')} のどれかにしてください`); }
        data.status = status ?? data.status;
      }
      if (!action && seen.has(data.email)) { action = 'skip'; notes.push(`このシートの ${seen.get(data.email)} 行目と同じメールアドレスなので飛ばします`); }
      if (!action) {
        const [hit] = await run(`select id from contacts where email = $1 and merged_into_id is null and archived_at is null`, [data.email]);
        const earlier = willCreate.get(data.email);
        if (hit) action = 'update';
        else if (earlier) { action = 'update'; notes.push(`${earlier} で追加される人です`); }
        else if (!data.full_name) { action = 'error'; notes.push('登録されていない人なので、氏名が必要です'); }
        else { action = 'create'; willCreate.set(data.email, `シート「${sh.name}」${line}行目`); }
        if (sh.event) notes.push(`「${sh.event}」に${PART_STATUS[data.status]}として記録します`);
      }
      if (data.email) seen.set(data.email, line);
      rows.push({ sheet: sh.name, event: sh.event, line, data, action, notes });
    }
    const mine = rows.filter((r) => r.sheet === sh.name);
    const n = (a) => mine.filter((r) => r.action === a).length;
    sheetInfo.push({ name: sh.name, kind: sh.kind, event: sh.event, eventNote, total: mine.length, create: n('create'), update: n('update'), skip: n('skip'), error: n('error') });
  }
  const n = (a) => rows.filter((r) => r.action === a).length;
  return { rows, sheets: sheetInfo, summary: { total: rows.length, create: n('create'), update: n('update'), skip: n('skip'), error: n('error') } };
}

const or = (v) => (v ? v : null);

async function upsertOrg(run, d) {
  if (!d.org_name) return null;
  const key = normalizeOrg(d.org_name);
  const [hit] = await run(`select id from organizations where normalized_name = $1 limit 1`, [key]);
  const id = hit?.id ?? (await run(`insert into organizations (name, normalized_name) values ($1, $2) returning id`, [d.org_name, key]))[0].id;
  await run(`update organizations set location = coalesce($2, location), size_class = coalesce($3, size_class),
    industry = coalesce($4, industry), updated_at = now() where id = $1`, [id, or(d.location), or(d.size_class), or(d.industry)]);
  return id;
}

// 興味分類は足すだけ（取り込みで既存の興味を消さない）
async function addInterests(run, contactId, text) {
  for (const name of splitInterests(text)) {
    const [hit] = await run(`select id from interests where name = $1`, [name]);
    const id = hit?.id ?? (await run(`insert into interests (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from interests)) returning id`, [name]))[0].id;
    await run(`insert into contact_interests (contact_id, interest_id, origin) values ($1, $2, 'staff') on conflict do nothing`, [contactId, id]);
  }
}

async function eventId(run, name) {
  const [ev] = await run(`select id from events where name = $1 order by id limit 1`, [name]);
  return ev?.id ?? (await run(`insert into events (name) values ($1) returning id`, [name]))[0].id;
}

// 確認画面のあとに書き込む。確認から時間がたっていてもよいように、判定はここでやり直す
export async function apply(run, batch) {
  const sheets = batch.staged.sheets.map((s) => ({
    name: s.name, kind: s.kind, event: s.event,
    records: batch.staged.rows.filter((r) => r.sheet === s.name).map(({ line, data }) => ({ line, data })),
  }));
  const { rows, summary } = await stage(run, sheets);
  const o = batch.options;
  for (const r of rows) {
    if (r.action !== 'create' && r.action !== 'update') continue;
    const d = r.data;
    const orgId = await upsertOrg(run, d);
    // 上の行で追加された人も見つかるよう、1行ごとに引き直す
    const [hit] = await run(`select id from contacts where email = $1 and merged_into_id is null and archived_at is null`, [d.email]);
    let id = hit?.id;
    if (!id) {
      [{ id }] = await run(`insert into contacts (full_name, email, organization_id, department, job_title, job_level) values ($1,$2,$3,$4,$5,$6) returning id`,
        [d.full_name, d.email, orgId, or(d.department), or(d.job_title), classifyJobTitle(d.job_title)]);
    } else {
      const [cur] = await run(`update contacts set full_name = coalesce($2, full_name), organization_id = coalesce($3, organization_id),
        department = coalesce($4, department), job_title = coalesce($5, job_title), updated_at = now() where id = $1 returning job_title`,
        [id, or(d.full_name), orgId, or(d.department), or(d.job_title)]);
      await run(`update contacts set job_level = $2 where id = $1`, [id, classifyJobTitle(cur.job_title)]);
    }
    await addInterests(run, id, d.interests);
    if (r.event) {
      await run(`insert into event_participations (contact_id, event_id, status) values ($1, $2, $3)
        on conflict (contact_id, event_id) do update set status = excluded.status`, [id, await eventId(run, r.event), d.status]);
    }
    await run(`insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on, import_batch_id, raw) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, r.event ? 'イベント申込' : o.source_kind, r.event ?? or(o.source_detail), o.consent_basis, or(o.acquired_on), batch.id,
        JSON.stringify({ sheet: r.sheet, line: r.line, ...d })]);
  }
  await run(`update import_batches set status = 'done', applied_at = now(), staged = null,
    created_count = $2, updated_count = $3, skipped_count = $4 where id = $1`, [batch.id, summary.create, summary.update, summary.skip + summary.error]);
  return summary;
}
