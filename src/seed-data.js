// 操作確認用のダミーデータ。実在の人物・組織ではない。アドレスは example.com / example.jp（送信されない予約ドメイン）のみ。
// scripts/seed.js（Node）と確認用サイト（ブラウザ）の両方から使う
import { normalizeOrg } from './routes/contacts.js';

export async function seed(q) {
  let s = 42;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chance = (p) => rnd() < p;

  const LAST = [['佐藤', 'さとう'], ['鈴木', 'すずき'], ['高橋', 'たかはし'], ['田中', 'たなか'], ['伊藤', 'いとう'], ['渡辺', 'わたなべ'], ['山本', 'やまもと'], ['中村', 'なかむら'], ['小林', 'こばやし'], ['加藤', 'かとう'], ['吉田', 'よしだ'], ['山田', 'やまだ'], ['松本', 'まつもと'], ['井上', 'いのうえ'], ['木村', 'きむら'], ['林', 'はやし'], ['清水', 'しみず'], ['森', 'もり'], ['池田', 'いけだ'], ['橋本', 'はしもと'], ['藤井', 'ふじい'], ['岡田', 'おかだ'], ['村上', 'むらかみ'], ['原田', 'はらだ']];
  const FIRST = [['大輔', 'だいすけ'], ['健太', 'けんた'], ['翔', 'しょう'], ['直樹', 'なおき'], ['陽子', 'ようこ'], ['美穂', 'みほ'], ['恵', 'めぐみ'], ['亮', 'りょう'], ['真由美', 'まゆみ'], ['誠', 'まこと'], ['由紀', 'ゆき'], ['拓也', 'たくや'], ['彩', 'あや'], ['浩二', 'こうじ'], ['裕子', 'ゆうこ'], ['隆', 'たかし']];
  // 実在の組織と取り違えないよう、地名などは使わず「サンプル」を付けた架空の名前にする
  const ORG_PREFIX = ['サンプルA', 'サンプルB', 'サンプルC', 'サンプルD', 'サンプルE', 'サンプルF', 'サンプルG', 'サンプルH', 'サンプルI', 'サンプルJ', 'サンプルK', 'サンプルL'];
  const ORG_SUFFIX = [['精機', '企業', '製造業'], ['テック', '企業', '情報通信'], ['物産', '企業', '卸売'], ['建設', '企業', '建設'], ['フーズ', '企業', '食品'], ['銀行', '企業', '金融'], ['市役所（架空）', '行政・自治体', '行政'], ['まちづくり協議会', 'NPO・団体', '地域団体'], ['総合研究所', '大学・研究機関', '研究']];
  const TITLES = [['代表取締役', '経営者・役員'], ['取締役', '経営者・役員'], ['部長', '部長クラス'], ['事業部長', '部長クラス'], ['課長', '課長クラス'], ['マネージャー', '課長クラス'], ['主任', '担当者'], ['担当', '担当者']];
  const FACULTY = ['教員A', '教員B', '教員C', '教員D'];

  await q(`insert into staff_users (entra_object_id, name, email, role) values
    ('dev-1', '事務スタッフA', 'staff-a@example.jp', 'operator'),
    ('dev-2', '事務スタッフB', 'staff-b@example.jp', 'operator'),
    ('dev-3', '管理者', 'admin@example.jp', 'admin')`);

  const interests = ['DX・デジタル活用', '組織開発', '人材育成', 'ソーシャルデザイン', '地域創生', 'ファイナンス', 'マーケティング', '事業承継'];
  for (const [i, name] of interests.entries()) await q(`insert into interests (name, sort_order) values ($1, $2)`, [name, i + 1]);

  const events = [
    ['DX推進セミナー 2025', 'セミナー', '2025-06-14', 'ハイブリッド', [1, 7]],
    ['組織開発ワークショップ', 'ワークショップ', '2025-09-20', '対面', [2, 3]],
    ['ソーシャルデザイン・シンポジウム', 'シンポジウム', '2025-12-06', '対面', [4, 5]],
    ['経営者向け 事業承継講座', '講座', '2026-02-21', 'オンライン', [8, 6]],
    ['地域企業交流会 2026春', '交流会', '2026-05-16', '対面', [5]],
    ['DX推進セミナー 2026', 'セミナー', '2026-07-11', 'ハイブリッド', [1, 3]],
  ];
  for (const [name, kind, held_on, format] of events) await q(`insert into events (name, kind, held_on, format) values ($1,$2,$3,$4)`, [name, kind, held_on, format]);

  const orgIds = [];
  for (const pre of ORG_PREFIX) {
    for (const [suf, type, ind] of [pick(ORG_SUFFIX), pick(ORG_SUFFIX)]) {
      const name = type === '企業' && chance(0.6) ? `株式会社${pre}${suf}` : `${pre}${suf}`;
      const [o] = await q(`insert into organizations (name, normalized_name, org_type, industry, prefecture) values ($1,$2,$3,$4,'（架空）')
        on conflict do nothing returning id`, [name, normalizeOrg(name), type, ind]);
      if (o) orgIds.push(o.id);
    }
  }

  const used = new Set();
  for (let i = 1; i <= 320; i++) {
    const [ln, lk] = pick(LAST), [fn, fk] = pick(FIRST);
    const [title, level] = pick(TITLES);
    const org = pick(orgIds);
    let email = `${fk.length > 3 ? 'user' : 'c'}${i}@${pick(['example.com', 'example.jp'])}`;
    if (chance(0.03)) email = null;
    if (email && used.has(email)) continue;
    used.add(email);
    const type = chance(0.85) ? '企業' : pick(['教員', '学生・修了生', '行政', 'その他']);
    const [c] = await q(`insert into contacts (email, last_name, first_name, last_name_kana, first_name_kana, organization_id, job_title, job_level, contact_type)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [email, ln, fn, lk, fk, org, title, level, type]);

    const viaCard = chance(0.55);
    await q(`insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on) values ($1,$2,$3,$4,$5)`,
      [c.id, viaCard ? '名刺交換' : 'イベント申込', viaCard ? `${pick(FACULTY)}と名刺交換` : pick(events)[0],
        chance(0.06) ? 'unknown' : viaCard ? 'business_card' : 'opt_in', `2025-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`]);

    for (const [ei, ev] of events.entries()) {
      if (chance(0.22)) {
        const st = chance(0.78) ? 'attended' : pick(['applied', 'absent', 'cancelled']);
        await q(`insert into event_participations (contact_id, event_id, status) values ($1,$2,$3)`, [c.id, ei + 1, st]);
        if (st === 'attended' && chance(0.6)) {
          for (const iid of ev[4]) await q(`insert into contact_interests (contact_id, interest_id, origin) values ($1,$2,'event') on conflict do nothing`, [c.id, iid]);
        }
      }
    }
    if (chance(0.2)) await q(`insert into contact_interests (contact_id, interest_id, origin) values ($1,$2,'self_reported') on conflict do nothing`, [c.id, 1 + Math.floor(rnd() * interests.length)]);
    if (email && chance(0.03)) await q(`insert into suppressions (email, reason) values ($1, $2)`, [email, pick(['unsubscribe', 'hard_bounce'])]);
  }

  await q(`insert into segments (name, definition, created_by) values
    ('DXセミナー参加者', $1, 3), ('経営層（全体）', $2, 3)`,
    [JSON.stringify({ events: [1, 6], event_status: ['attended'] }), JSON.stringify({ job_levels: ['経営者・役員'] })]);
}
