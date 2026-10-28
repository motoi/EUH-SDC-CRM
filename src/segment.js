// 配信先リストの条件（segments.definition）と、画面のフォーム・SQL の相互変換。
// 同じ項目の中は「どれか」（OR）、項目どうしは「すべて」（AND）。
import { q } from './db.js';

// 企業分類1（Excel の列と同じ区分）
export const SIZE_CLASSES = ['大企業', '中堅企業', '中小企業', '小規模事業者', '教育機関', 'その他'];
export const PART_STATUS = { applied: '申込', attended: '参加', absent: '欠席', cancelled: 'キャンセル' };

// 団体所在地の先頭から都道府県を取り出す SQL（例: 広島県広島市中区 → 広島県）
export const PREF_SQL = `substring(o.location from '^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)')`;

const ids = (v) => [].concat(v ?? []).map(Number).filter(Number.isInteger);
const strs = (v, allowed) => [].concat(v ?? []).map(String).filter((s) => !allowed || allowed.includes(s));

// 興味分類の入力（「新規事業,リベラルアーツ」）を単語に分ける。全角・読点区切りも受け付ける
export function splitInterests(text) {
  return [...new Set(String(text ?? '').normalize('NFKC').split(/[,、]/).map((s) => s.trim()).filter(Boolean))];
}

// フォーム（parseBody の結果）→ 定義
export function fromForm(body) {
  const pick = (k) => body[k] ?? body[`${k}[]`];
  const def = {
    events: ids(pick('events')),
    event_status: strs(pick('event_status'), Object.keys(PART_STATUS)),
    interests: ids(pick('interests')),
    size_classes: strs(pick('size_classes'), SIZE_CLASSES),
    industries: strs(pick('industries')),
    prefectures: strs(pick('prefectures')),
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
  const org = (cond) => `exists (select 1 from organizations o where o.id = c.organization_id and ${cond})`;

  if (def.events?.length) {
    where.push(`exists (select 1 from event_participations ep where ep.contact_id = c.id
      and ep.event_id = any(${p(def.events)}::bigint[]) and ep.status = any(${p(def.event_status ?? ['attended'])}::text[]))`);
  }
  if (def.interests?.length) {
    where.push(`exists (select 1 from contact_interests ci where ci.contact_id = c.id and ci.interest_id = any(${p(def.interests)}::bigint[]))`);
  }
  if (def.size_classes?.length) where.push(org(`o.size_class = any(${p(def.size_classes)}::text[])`));
  if (def.industries?.length) where.push(org(`o.industry = any(${p(def.industries)}::text[])`));
  if (def.prefectures?.length) where.push(org(`${PREF_SQL} = any(${p(def.prefectures)}::text[])`));
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
  return q(`select c.id, c.email, c.full_name, c.department, c.job_title, o.name as org_name
    from sendable_contacts c left join organizations o on o.id = c.organization_id
    where ${where} order by o.name nulls last, c.full_name, c.id limit ${Number(limit)} offset ${Number(offset)}`, params);
}

// 条件の選択肢のうち、データから決まるもの（企業分類2・所在地の都道府県）
export async function choices() {
  const [industries, prefectures] = await Promise.all([
    q(`select distinct industry v from organizations where industry is not null order by 1`),
    q(`select distinct ${PREF_SQL} v from organizations o where o.location is not null order by 1`),
  ]);
  return { industries: industries.map((r) => r.v), prefectures: prefectures.map((r) => r.v).filter(Boolean) };
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
    parts.push(`興味分類：${it.map((i) => i.name).join('・')}`);
  }
  if (def.size_classes?.length) parts.push(`企業分類1：${def.size_classes.join('・')}`);
  if (def.industries?.length) parts.push(`企業分類2：${def.industries.join('・')}`);
  if (def.prefectures?.length) parts.push(`団体所在地：${def.prefectures.join('・')}`);
  if (def.exclude_events?.length) {
    const ev = await q(`select name from events where id = any($1::bigint[])`, [def.exclude_events]);
    parts.push(`除外：「${ev.map((e) => e.name).join('」「')}」の申込・参加者`);
  }
  return parts.length ? parts.join(' ／ ') : '送信できる連絡先すべて';
}
