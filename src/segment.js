// 配信先リストの条件（segments.definition）と、画面のフォーム・SQL の相互変換。
// 同じ項目の中は「どれか」（OR）、項目どうしは「すべて」（AND）。
import { q } from './db.js';

export const JOB_LEVELS = ['経営者・役員', '部長クラス', '課長クラス', '担当者', '教員・研究者', '学生', 'その他'];
export const CONTACT_TYPES = ['企業', '教員', '学生・修了生', '行政', 'その他'];
export const ORG_TYPES = ['企業', '大学・研究機関', '行政・自治体', 'NPO・団体', 'その他'];
export const PART_STATUS = { applied: '申込', attended: '参加', absent: '欠席', cancelled: 'キャンセル' };

const ids = (v) => [].concat(v ?? []).map(Number).filter(Number.isInteger);
const strs = (v, allowed) => [].concat(v ?? []).map(String).filter((s) => allowed.includes(s));

// フォーム（parseBody の結果）→ 定義
export function fromForm(body) {
  const pick = (k) => body[k] ?? body[`${k}[]`];
  const def = {
    events: ids(pick('events')),
    event_status: strs(pick('event_status'), Object.keys(PART_STATUS)),
    interests: ids(pick('interests')),
    job_levels: strs(pick('job_levels'), JOB_LEVELS),
    contact_types: strs(pick('contact_types'), CONTACT_TYPES),
    org_types: strs(pick('org_types'), ORG_TYPES),
    exclude_events: ids(pick('exclude_events')),
  };
  if (def.events.length && !def.event_status.length) def.event_status = ['attended'];
  return def;
}

// 定義 → sendable_contacts c に付ける WHERE 句
export function toSql(def = {}) {
  const where = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  if (def.events?.length) {
    where.push(`exists (select 1 from event_participations ep where ep.contact_id = c.id
      and ep.event_id = any(${p(def.events)}::bigint[]) and ep.status = any(${p(def.event_status ?? ['attended'])}::text[]))`);
  }
  if (def.interests?.length) {
    where.push(`exists (select 1 from contact_interests ci where ci.contact_id = c.id and ci.interest_id = any(${p(def.interests)}::bigint[]))`);
  }
  if (def.job_levels?.length) where.push(`c.job_level = any(${p(def.job_levels)}::text[])`);
  if (def.contact_types?.length) where.push(`c.contact_type = any(${p(def.contact_types)}::text[])`);
  if (def.org_types?.length) {
    where.push(`exists (select 1 from organizations o where o.id = c.organization_id and o.org_type = any(${p(def.org_types)}::text[]))`);
  }
  if (def.exclude_events?.length) {
    where.push(`not exists (select 1 from event_participations ep where ep.contact_id = c.id
      and ep.event_id = any(${p(def.exclude_events)}::bigint[]) and ep.status in ('applied', 'attended'))`);
  }
  return { where: where.length ? where.join(' and ') : 'true', params };
}

export async function count(def) {
  const { where, params } = toSql(def);
  const [r] = await q(`select count(*)::int as n from sendable_contacts c where ${where}`, params);
  return r.n;
}

export async function members(def, { limit = 1000000, offset = 0 } = {}) {
  const { where, params } = toSql(def);
  return q(`select c.id, c.email, c.last_name, c.first_name, c.job_title, o.name as org_name
    from sendable_contacts c left join organizations o on o.id = c.organization_id
    where ${where} order by c.last_name_kana nulls last, c.id limit ${Number(limit)} offset ${Number(offset)}`, params);
}

// 人が読める条件の説明（一覧や確認画面で表示する）
export async function describe(def = {}) {
  const parts = [];
  if (def.events?.length) {
    const ev = await q(`select name from events where id = any($1::bigint[]) order by held_on`, [def.events]);
    parts.push(`イベント「${ev.map((e) => e.name).join('」「')}」に${(def.event_status ?? []).map((s) => PART_STATUS[s]).join('・')}`);
  }
  if (def.interests?.length) {
    const it = await q(`select name from interests where id = any($1::bigint[]) order by sort_order, id`, [def.interests]);
    parts.push(`興味：${it.map((i) => i.name).join('・')}`);
  }
  if (def.job_levels?.length) parts.push(`役職：${def.job_levels.join('・')}`);
  if (def.contact_types?.length) parts.push(`種別：${def.contact_types.join('・')}`);
  if (def.org_types?.length) parts.push(`組織：${def.org_types.join('・')}`);
  if (def.exclude_events?.length) {
    const ev = await q(`select name from events where id = any($1::bigint[])`, [def.exclude_events]);
    parts.push(`除外：「${ev.map((e) => e.name).join('」「')}」の申込・参加者`);
  }
  return parts.length ? parts.join(' ／ ') : '送信できる連絡先すべて';
}
