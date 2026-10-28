// 事務局の Excel（1行目が見出し）を連絡先に取り込む。
// 1. records：見出しを確かめ、行を項目に直す  2. stage：各行を「追加・更新・飛ばす・エラー」に判定する（データは変えない）
// 3. apply：確認後に、判定どおりに書き込む。空欄のセルで既存の値を消すことはしない
import { normalizeOrg } from './routes/contacts.js';
import { SIZE_CLASSES, splitInterests } from './segment.js';
import { classifyJobTitle } from './job-level.js';

export const COLUMNS = {
  '氏名': 'full_name', '企業・団体名': 'org_name', '部署': 'department', '役職': 'job_title', 'メールアドレス': 'email',
  '団体所在地': 'location', '企業分類1': 'size_class', '企業分類2': 'industry', '興味分類': 'interests',
};
const REQUIRED = ['氏名', '企業・団体名', 'メールアドレス'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_WORDS = /^(なし|無し|-|－|ー)$/;

const norm = (v) => String(v ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();

// シート（行の配列）→ 見出しの確認結果と、Excel の行番号つきの項目
export function records(rows) {
  const headerAt = rows.findIndex((r) => r?.some((v) => norm(v)));
  const header = (rows[headerAt] ?? []).map(norm);
  const index = Object.fromEntries(Object.keys(COLUMNS).map((h) => [COLUMNS[h], header.indexOf(h)]));
  const missing = REQUIRED.filter((h) => !header.includes(h));
  const unknown = header.filter((h) => h && !(h in COLUMNS));
  const out = [];
  rows.slice(headerAt + 1).forEach((r, i) => {
    if (!r?.some((v) => norm(v))) return;   // 空の行は数えない
    const data = {};
    for (const [key, at] of Object.entries(index)) data[key] = at >= 0 ? norm(r[at]) : '';
    for (const key of ['department', 'job_title', 'location']) if (EMPTY_WORDS.test(data[key])) data[key] = '';
    data.email = data.email.toLowerCase();
    out.push({ line: headerAt + i + 2, data });
  });
  return { records: out, missing, unknown };
}

// 各行の判定。run は (sql, params) => rows
export async function stage(run, recs) {
  const seen = new Map();
  const rows = [];
  for (const { line, data } of recs) {
    const notes = [];
    let action = null, contactId = null;
    if (!data.full_name) { action = 'error'; notes.push('氏名が空欄です'); }
    if (data.email && !EMAIL.test(data.email)) { action = 'error'; notes.push(`メールアドレス「${data.email}」の形が正しくありません`); }
    if (data.size_class && !SIZE_CLASSES.includes(data.size_class)) {
      notes.push(`企業分類1「${data.size_class}」は区分（${SIZE_CLASSES.join('・')}）にないため空欄にします`);
      data.size_class = '';
    }
    if (!data.email && action !== 'error') notes.push('メールアドレスがないため、配信の対象にはなりません');
    if (!action && data.email && seen.has(data.email)) {
      action = 'skip'; notes.push(`同じメールアドレスが ${seen.get(data.email)} 行目にあるため飛ばします`);
    }
    if (!action) {
      const [hit] = data.email
        ? await run(`select id from contacts where email = $1 and merged_into_id is null and archived_at is null`, [data.email])
        : await run(`select c.id from contacts c join organizations o on o.id = c.organization_id
            where c.full_name = $1 and o.normalized_name = $2 and c.merged_into_id is null and c.archived_at is null limit 1`,
            [data.full_name, normalizeOrg(data.org_name)]);
      contactId = hit?.id ?? null;
      action = contactId ? 'update' : 'create';
      if (contactId) notes.push(data.email ? '同じメールアドレスの連絡先を更新します' : '同じ氏名・企業の連絡先を更新します');
    }
    if (data.email && !seen.has(data.email)) seen.set(data.email, line);
    rows.push({ line, data, action, contactId, notes });
  }
  const count = (a) => rows.filter((r) => r.action === a).length;
  return { rows, summary: { total: rows.length, create: count('create'), update: count('update'), skip: count('skip'), error: count('error') } };
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

// 確認画面のあとに書き込む。確認から時間がたっていてもよいように、判定はここでやり直す
export async function apply(run, batch) {
  const { rows, summary } = await stage(run, batch.staged.rows.map(({ line, data }) => ({ line, data })));
  const o = batch.options;
  for (const r of rows) {
    if (r.action !== 'create' && r.action !== 'update') continue;
    const d = r.data;
    const orgId = await upsertOrg(run, d);
    let id = r.contactId;
    if (r.action === 'create') {
      [{ id }] = await run(`insert into contacts (full_name, email, organization_id, department, job_title, job_level) values ($1,$2,$3,$4,$5,$6) returning id`,
        [d.full_name, or(d.email), orgId, or(d.department), or(d.job_title), classifyJobTitle(d.job_title)]);
    } else {
      await run(`update contacts set full_name = $2, organization_id = coalesce($3, organization_id), department = coalesce($4, department),
        job_title = coalesce($5, job_title), updated_at = now() where id = $1`, [id, d.full_name, orgId, or(d.department), or(d.job_title)]);
      await run(`update contacts set job_level = $2 where id = $1`, [id, classifyJobTitle((await run(`select job_title from contacts where id = $1`, [id]))[0].job_title)]);
    }
    await addInterests(run, id, d.interests);
    await run(`insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on, import_batch_id, raw) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, o.source_kind, or(o.source_detail), o.consent_basis, or(o.acquired_on), batch.id, JSON.stringify({ line: r.line, ...d })]);
  }
  await run(`update import_batches set status = 'done', applied_at = now(), staged = null,
    created_count = $2, updated_count = $3, skipped_count = $4 where id = $1`, [batch.id, summary.create, summary.update, summary.skip + summary.error]);
  return summary;
}
