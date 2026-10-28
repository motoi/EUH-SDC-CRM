-- SDC配信CRM スキーマ v0（PostgreSQL）
-- 手元リストの列構成を見て、contacts / organizations の項目は調整する前提の叩き台。
--
-- 方針
--   * 送信可否の最終判定は suppressions（メールアドレス単位）で行う。連絡先を消しても再取り込みしても効き続ける。
--   * 「いつ・どこで・どういう根拠で」取得したかを contact_sources に残す（特定電子メール法・個人情報保護法の対応）。
--   * 配信対象は送信時点で deliveries に固定する。同じ配信で同じアドレスに二度送らない。
--   * 開封トラッキングは持たない（Apple のプライバシー保護で数字が当てにならず、大学の案内には不要）。

create extension if not exists citext;   -- メールアドレスを大文字小文字を区別せずに扱う

-- ───────────────────────────────── 管理画面の利用者
create table staff_users (
  id               bigint generated always as identity primary key,
  entra_object_id  text unique not null,          -- M365 (Entra ID) のユーザーID。SSO で照合
  name             text not null,
  email            citext not null,
  role             text not null default 'operator'
                   check (role in ('admin', 'operator')),  -- admin: 設定・ユーザー管理も可
  active           boolean not null default true,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now()
);

-- ───────────────────────────────── 連絡先
-- 列の名前は、事務局で使っている Excel（氏名・企業・団体名・部署・役職・メールアドレス・団体所在地・企業分類1・企業分類2・興味分類）に合わせる
create table organizations (
  id               bigint generated always as identity primary key,
  name             text not null,                 -- 企業・団体名
  normalized_name  text not null,                 -- 株式会社・(株)・全半角などを揃えた名寄せ用キー
  location         text,                          -- 団体所在地（例: 広島県広島市中区）
  size_class       text check (size_class in ('大企業', '中堅企業', '中小企業', '小規模事業者', '教育機関', 'その他')),  -- 企業分類1
  industry         text,                          -- 企業分類2（例: 自動車、電力、サービス）
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index organizations_normalized_name_idx on organizations (normalized_name);

create table contacts (
  id               bigint generated always as identity primary key,
  full_name        text not null,                 -- 氏名
  email            citext,                        -- メールアドレス。名刺にない人もいるので null 可
  organization_id  bigint references organizations (id),
  department       text,                          -- 部署
  job_title        text,                          -- 役職（自由記述。名刺どおり）
  job_level        text,                          -- 役職区分。job_title から src/job-level.js の表で自動で付ける
  notes            text,
  merged_into_id   bigint references contacts (id),  -- 名寄せで統合された側はここに統合先を入れて残す
  archived_at      timestamptz,                   -- 退職・不要などで一覧から外したもの
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (merged_into_id is null or merged_into_id <> id)
);
-- 有効な連絡先の中でメールアドレスは一意（統合済み・アーカイブ済みは除く）
create unique index contacts_email_active_uq on contacts (email)
  where email is not null and merged_into_id is null and archived_at is null;
create index contacts_organization_idx on contacts (organization_id);

-- ───────────────────────────────── 入手経路と同意の根拠
create table import_batches (
  id               bigint generated always as identity primary key,
  filename         text not null,
  source_kind      text not null,                 -- contact_sources.source_kind と同じ値
  imported_by      bigint references staff_users (id),
  imported_at      timestamptz not null default now(),
  row_count        integer not null default 0,
  created_count    integer not null default 0,
  merged_count     integer not null default 0,
  skipped_count    integer not null default 0
);

create table contact_sources (
  id               bigint generated always as identity primary key,
  contact_id       bigint not null references contacts (id) on delete cascade,
  source_kind      text not null check (source_kind in ('名刺交換', 'イベント申込', '問い合わせ', '手入力', 'その他')),
  source_detail    text,                          -- 例: 交換した教員名、イベント名
  acquired_on      date,
  consent_basis    text not null check (consent_basis in (
                     'business_card',   -- 名刺など書面でアドレスの通知を受けた（特電法の例外）
                     'opt_in',          -- フォーム等で案内メールの受信に同意
                     'unknown'          -- 根拠不明。配信対象から外す運用を想定
                   )),
  consent_note     text,                          -- 例: 申込フォームの同意文言、確認日
  import_batch_id  bigint references import_batches (id),
  raw              jsonb,                         -- 取り込み元の行をそのまま保存（後から確認できるように）
  created_at       timestamptz not null default now()
);
create index contact_sources_contact_idx on contact_sources (contact_id);

-- ───────────────────────────────── イベント
create table events (
  id               bigint generated always as identity primary key,
  name             text not null,
  kind             text check (kind in ('セミナー', 'ワークショップ', '講座', 'シンポジウム', '交流会', 'その他')),
  held_on          date,
  format           text check (format in ('対面', 'オンライン', 'ハイブリッド')),
  location         text,
  notes            text,
  created_at       timestamptz not null default now()
);

create table event_participations (
  contact_id       bigint not null references contacts (id) on delete cascade,
  event_id         bigint not null references events (id) on delete cascade,
  status           text not null default 'applied'
                   check (status in ('applied', 'attended', 'absent', 'cancelled')),  -- 申込 / 参加 / 欠席 / キャンセル
  registered_at    timestamptz,
  primary key (contact_id, event_id)
);
create index event_participations_event_idx on event_participations (event_id, status);

-- ───────────────────────────────── 興味関心
create table interests (
  id               bigint generated always as identity primary key,
  name             text unique not null,          -- 興味分類の単語（例: 新規事業、リベラルアーツ）
  category         text,
  sort_order       integer not null default 0,
  active           boolean not null default true
);

create table contact_interests (
  contact_id       bigint not null references contacts (id) on delete cascade,
  interest_id      bigint not null references interests (id) on delete cascade,
  origin           text not null default 'staff'
                   check (origin in ('self_reported', 'event', 'staff')),  -- 本人申告 / 参加イベントから推定 / スタッフ判断
  created_at       timestamptz not null default now(),
  primary key (contact_id, interest_id)
);

-- ───────────────────────────────── 送信禁止リスト
create table suppressions (
  email            citext primary key,
  reason           text not null check (reason in ('unsubscribe', 'hard_bounce', 'complaint', 'manual')),
  delivery_id      bigint,                        -- きっかけになった配信（あれば）。deliveries 作成後に FK を張る
  note             text,
  created_at       timestamptz not null default now()
);

-- ───────────────────────────────── セグメントと配信
create table segments (
  id               bigint generated always as identity primary key,
  name             text not null,
  definition       jsonb not null,                -- 画面で組んだ条件。例は末尾のコメント参照
  created_by       bigint references staff_users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table campaigns (
  id               bigint generated always as identity primary key,
  name             text not null,                 -- 管理用の名前
  subject          text not null,
  body_text        text not null,                 -- 差し込みは {{氏名}} {{所属}} など
  body_html        text,
  from_address     citext not null default 'social-design-center@eikei.ac.jp',
  segment_id       bigint references segments (id),
  segment_definition jsonb,                       -- 送信確定時の条件を固定（後でセグメントを編集しても履歴が変わらない）
  status           text not null default 'draft'
                   check (status in ('draft', 'test_sent', 'scheduled', 'sending', 'sent', 'cancelled')),
  test_sent_at     timestamptz,                   -- テスト送信が済むまで予約できない
  scheduled_at     timestamptz,
  confirmed_count  integer,                       -- 確定時に担当者が入力した件数（誤送信防止）
  created_by       bigint references staff_users (id),
  confirmed_by     bigint references staff_users (id),
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  check (status not in ('scheduled', 'sending', 'sent') or test_sent_at is not null)
);

create table deliveries (
  id               bigint generated always as identity primary key,
  campaign_id      bigint not null references campaigns (id) on delete cascade,
  contact_id       bigint references contacts (id) on delete set null,
  email            citext not null,               -- 送信時点のアドレスを固定
  status           text not null default 'queued'
                   check (status in ('queued', 'sent', 'failed', 'bounced', 'skipped')),
  unsubscribe_token uuid not null default gen_random_uuid() unique,  -- 本文の配信停止リンク用
  graph_message_id text,                          -- Microsoft Graph の送信結果ID（追跡用）
  attempts         integer not null default 0,
  last_error       text,
  queued_at        timestamptz not null default now(),
  sent_at          timestamptz,
  unique (campaign_id, email)                     -- 同じ配信で同じアドレスに二度送らない
);
create index deliveries_queue_idx on deliveries (campaign_id, status);

alter table suppressions
  add constraint suppressions_delivery_fk foreign key (delivery_id) references deliveries (id) on delete set null;

-- 共有メールボックスに戻ってきた不達・自動応答、配信停止クリックの記録
create table mailbox_events (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind in ('hard_bounce', 'soft_bounce', 'auto_reply', 'unsubscribe', 'other')),
  email            citext,
  delivery_id      bigint references deliveries (id) on delete set null,
  graph_message_id text unique,                   -- 同じ受信メールを二重に処理しない
  detail           text,
  received_at      timestamptz not null default now()
);

-- ───────────────────────────────── 操作ログ（誤送信時の確認用）
create table audit_log (
  id               bigint generated always as identity primary key,
  actor_id         bigint references staff_users (id),
  action           text not null,                 -- 例: campaign.confirm, contact.merge, import.run
  target_type      text,
  target_id        bigint,
  detail           jsonb,
  at               timestamptz not null default now()
);

-- ───────────────────────────────── 送信してよい連絡先
-- セグメントは必ずこのビューを起点に絞り込む。
create view sendable_contacts as
select c.*
from contacts c
where c.email is not null
  and c.merged_into_id is null
  and c.archived_at is null
  and not exists (select 1 from suppressions s where s.email = c.email)
  -- 同意の根拠が確認できる経路が一つ以上あること
  and exists (
    select 1 from contact_sources cs
    where cs.contact_id = c.id and cs.consent_basis in ('business_card', 'opt_in')
  );

-- セグメント定義の例（segments.definition）
-- 「2025年度のDXセミナーに参加し、興味分類に『新規事業』を持つ、大企業か中堅企業の人」
-- {
--   "all": [
--     {"field": "event", "event_ids": [12], "status": ["attended"]},
--     {"field": "interest", "interest_ids": [3]},
--     {"field": "size_class", "in": ["大企業", "中堅企業"]}
--   ],
--   "none": [
--     {"field": "event", "event_ids": [15], "status": ["applied", "attended"]}
--   ]
-- }

-- 確認用の送信箱。送信方式が outbox のとき、実際には送らずここに保存する
create table outbox_messages (
  id               bigint generated always as identity primary key,
  to_address       citext not null,
  subject          text not null,
  body_text        text not null,
  delivery_ref     text,
  created_at       timestamptz not null default now()
);
