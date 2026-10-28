// 操作確認用のダミーデータ。実在の人物・組織ではない。アドレスは example.com / example.jp（送信されない予約ドメイン）のみ。
// 項目は事務局の Excel の列（氏名・企業・団体名・部署・役職・メールアドレス・団体所在地・企業分類1・企業分類2・興味分類）に合わせる。
// scripts/seed.js（Node）と確認用サイト（ブラウザ）の両方から使う
import { normalizeOrg } from './routes/contacts.js';
import { reclassifyAll } from './job-level.js';

export async function seed(q) {
  let s = 42;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chance = (p) => rnd() < p;

  const LAST = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '松本', '井上', '木村', '林', '清水', '森', '池田', '橋本', '藤井', '岡田', '村上', '原田'];
  const FIRST = ['大輔', '健太', '翔', '直樹', '陽子', '美穂', '恵', '亮', '真由美', '誠', '由紀', '拓也', '彩', '浩二', '裕子', '隆'];
  // 実在の組織と取り違えないよう、すべて「サンプル」を付けた架空の名前にする
  const ORGS = [
    ['株式会社サンプル自動車', '大企業', '自動車'], ['サンプル電力株式会社', '大企業', '電力'], ['株式会社サンプル精機', '中堅企業', '精密機器'],
    ['サンプル交通株式会社', '大企業', '鉄道・バス'], ['サンプルキャピタル株式会社', '中堅企業', 'その他金融'], ['株式会社サンプルコンサルティング', '中小企業', 'サービス'],
    ['株式会社サンプルデザイン', '小規模事業者', 'サービス'], ['株式会社サンプル部品', '中小企業', '自動車'], ['サンプル総研株式会社', '中堅企業', 'サービス'],
    ['株式会社サンプル旅行', '大企業', 'サービス'], ['サンプル福祉株式会社', '中小企業', 'サービス'], ['サンプル学園', '教育機関', '教育'],
    ['サンプル大学', '教育機関', '教育'], ['株式会社サンプルラボ', '小規模事業者', '情報通信'], ['サンプルシステムズ株式会社', '中堅企業', '情報通信'],
  ];
  const LOCATIONS = ['広島県広島市中区', '広島県広島市南区', '広島県広島市東区', '広島県安芸郡府中町', '広島県東広島市', '広島県福山市', '岡山県岡山市北区', '東京都港区', '東京都中央区'];
  const DEPTS = ['経営企画部', '新規事業開発室', '人事部', '研究開発本部', '営業部', 'デザイン本部', '地域共創本部', '購買本部', null];
  const TITLES = ['代表取締役', '取締役', '部長', '次長', '課長', 'マネージャー', 'シニアマネージャー', 'アシスタントマネージャー', '主任', '主査', '一般', '支店長', '研究員', '顧問', null];
  const INTERESTS = ['新規事業', 'リベラルアーツ', 'DX', '人材育成', '組織開発', 'ソーシャルデザイン', '地域共創', 'サステナビリティ'];
  const FACULTY = ['教員A', '教員B', '教員C', '教員D'];

  await q(`insert into staff_users (entra_object_id, name, email, role) values
    ('dev-1', '事務スタッフA', 'staff-a@example.jp', 'operator'),
    ('dev-2', '事務スタッフB', 'staff-b@example.jp', 'operator'),
    ('dev-3', '管理者', 'admin@example.jp', 'admin')`);

  for (const [i, name] of INTERESTS.entries()) await q(`insert into interests (name, sort_order) values ($1, $2)`, [name, i + 1]);

  // [名称, 種類, 開催日, 形式, 参加者に付けやすい興味分類]
  const events = [
    ['DX推進セミナー 2025', 'セミナー', '2025-06-14', 'ハイブリッド', [3, 1]],
    ['組織開発ワークショップ', 'ワークショップ', '2025-09-20', '対面', [5, 4]],
    ['ソーシャルデザイン・シンポジウム', 'シンポジウム', '2025-12-06', '対面', [6, 7]],
    ['リベラルアーツ公開講座', '講座', '2026-02-21', 'オンライン', [2]],
    ['地域企業交流会 2026春', '交流会', '2026-05-16', '対面', [7, 1]],
    ['新規事業創出プログラム 説明会', 'セミナー', '2026-07-11', 'ハイブリッド', [1, 8]],
  ];
  for (const [name, kind, held_on, format] of events) await q(`insert into events (name, kind, held_on, format) values ($1,$2,$3,$4)`, [name, kind, held_on, format]);

  const orgIds = [];
  for (const [name, size, industry] of ORGS) {
    const [o] = await q(`insert into organizations (name, normalized_name, location, size_class, industry) values ($1,$2,$3,$4,$5) returning id`,
      [name, normalizeOrg(name), pick(LOCATIONS), size, industry]);
    orgIds.push(o.id);
  }

  const used = new Set();
  for (let i = 1; i <= 320; i++) {
    const email = `user${i}@${pick(['example.com', 'example.jp'])}`;
    if (used.has(email)) continue;
    used.add(email);
    const [c] = await q(`insert into contacts (full_name, email, organization_id, department, job_title) values ($1,$2,$3,$4,$5) returning id`,
      [`${pick(LAST)} ${pick(FIRST)}`, email, pick(orgIds), pick(DEPTS), pick(TITLES)]);

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
    if (chance(0.3)) await q(`insert into contact_interests (contact_id, interest_id, origin) values ($1,$2,'self_reported') on conflict do nothing`, [c.id, 1 + Math.floor(rnd() * INTERESTS.length)]);
    if (email && chance(0.03)) await q(`insert into suppressions (email, reason) values ($1, $2)`, [email, pick(['unsubscribe', 'hard_bounce'])]);
  }

  await reclassifyAll(q);

  await q(`insert into segments (name, definition, created_by) values
    ('DXセミナー参加者', $1, 3), ('新規事業に関心のある大企業・中堅企業', $2, 3)`,
    [JSON.stringify({ events: [1], event_status: ['attended'] }), JSON.stringify({ interests: [1], size_classes: ['大企業', '中堅企業'] })]);
}
