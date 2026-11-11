var fe=Object.freeze,Ts=Object.defineProperty;var vt=(t,e)=>fe(Ts(t,"raw",{value:fe(e||t.slice())}));var he=`-- SDC\u914D\u4FE1CRM \u30B9\u30AD\u30FC\u30DE v0\uFF08PostgreSQL\uFF09
-- \u624B\u5143\u30EA\u30B9\u30C8\u306E\u5217\u69CB\u6210\u3092\u898B\u3066\u3001contacts / organizations \u306E\u9805\u76EE\u306F\u8ABF\u6574\u3059\u308B\u524D\u63D0\u306E\u53E9\u304D\u53F0\u3002
--
-- \u65B9\u91DD
--   * \u9001\u4FE1\u53EF\u5426\u306E\u6700\u7D42\u5224\u5B9A\u306F suppressions\uFF08\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u5358\u4F4D\uFF09\u3067\u884C\u3046\u3002\u9023\u7D61\u5148\u3092\u6D88\u3057\u3066\u3082\u518D\u53D6\u308A\u8FBC\u307F\u3057\u3066\u3082\u52B9\u304D\u7D9A\u3051\u308B\u3002
--   * \u300C\u3044\u3064\u30FB\u3069\u3053\u3067\u30FB\u3069\u3046\u3044\u3046\u6839\u62E0\u3067\u300D\u53D6\u5F97\u3057\u305F\u304B\u3092 contact_sources \u306B\u6B8B\u3059\uFF08\u7279\u5B9A\u96FB\u5B50\u30E1\u30FC\u30EB\u6CD5\u30FB\u500B\u4EBA\u60C5\u5831\u4FDD\u8B77\u6CD5\u306E\u5BFE\u5FDC\uFF09\u3002
--   * \u914D\u4FE1\u5BFE\u8C61\u306F\u9001\u4FE1\u6642\u70B9\u3067 deliveries \u306B\u56FA\u5B9A\u3059\u308B\u3002\u540C\u3058\u914D\u4FE1\u3067\u540C\u3058\u30A2\u30C9\u30EC\u30B9\u306B\u4E8C\u5EA6\u9001\u3089\u306A\u3044\u3002
--   * \u958B\u5C01\u30C8\u30E9\u30C3\u30AD\u30F3\u30B0\u306F\u6301\u305F\u306A\u3044\uFF08Apple \u306E\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC\u4FDD\u8B77\u3067\u6570\u5B57\u304C\u5F53\u3066\u306B\u306A\u3089\u305A\u3001\u5927\u5B66\u306E\u6848\u5185\u306B\u306F\u4E0D\u8981\uFF09\u3002

create extension if not exists citext;   -- \u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u5927\u6587\u5B57\u5C0F\u6587\u5B57\u3092\u533A\u5225\u305B\u305A\u306B\u6271\u3046

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u7BA1\u7406\u753B\u9762\u306E\u5229\u7528\u8005
create table staff_users (
  id               bigint generated always as identity primary key,
  entra_object_id  text unique not null,          -- M365 (Entra ID) \u306E\u30E6\u30FC\u30B6\u30FCID\u3002SSO \u3067\u7167\u5408
  name             text not null,
  email            citext not null,
  role             text not null default 'operator'
                   check (role in ('admin', 'operator')),  -- admin: \u8A2D\u5B9A\u30FB\u30E6\u30FC\u30B6\u30FC\u7BA1\u7406\u3082\u53EF
  active           boolean not null default true,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now()
);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u9023\u7D61\u5148
-- \u5217\u306E\u540D\u524D\u306F\u3001\u4E8B\u52D9\u5C40\u3067\u4F7F\u3063\u3066\u3044\u308B Excel\uFF08\u6C0F\u540D\u30FB\u4F01\u696D\u30FB\u56E3\u4F53\u540D\u30FB\u90E8\u7F72\u30FB\u5F79\u8077\u30FB\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u30FB\u56E3\u4F53\u6240\u5728\u5730\u30FB\u4F01\u696D\u5206\u985E1\u30FB\u4F01\u696D\u5206\u985E2\u30FB\u8208\u5473\u5206\u985E\uFF09\u306B\u5408\u308F\u305B\u308B
create table organizations (
  id               bigint generated always as identity primary key,
  name             text not null,                 -- \u4F01\u696D\u30FB\u56E3\u4F53\u540D
  normalized_name  text not null,                 -- \u682A\u5F0F\u4F1A\u793E\u30FB(\u682A)\u30FB\u5168\u534A\u89D2\u306A\u3069\u3092\u63C3\u3048\u305F\u540D\u5BC4\u305B\u7528\u30AD\u30FC
  location         text,                          -- \u56E3\u4F53\u6240\u5728\u5730\uFF08\u4F8B: \u5E83\u5CF6\u770C\u5E83\u5CF6\u5E02\u4E2D\u533A\uFF09
  size_class       text check (size_class in ('\u5927\u4F01\u696D', '\u4E2D\u5805\u4F01\u696D', '\u4E2D\u5C0F\u4F01\u696D', '\u5C0F\u898F\u6A21\u4E8B\u696D\u8005', '\u6559\u80B2\u6A5F\u95A2', '\u305D\u306E\u4ED6')),  -- \u4F01\u696D\u5206\u985E1
  industry         text,                          -- \u4F01\u696D\u5206\u985E2\uFF08\u4F8B: \u81EA\u52D5\u8ECA\u3001\u96FB\u529B\u3001\u30B5\u30FC\u30D3\u30B9\uFF09
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index organizations_normalized_name_idx on organizations (normalized_name);

create table contacts (
  id               bigint generated always as identity primary key,
  full_name        text not null,                 -- \u6C0F\u540D
  email            citext not null,               -- \u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3002\u3053\u306E\u4EBA\u3092\u898B\u5206\u3051\u308B ID \u3068\u3057\u3066\u4F7F\u3046\uFF08\u53D6\u308A\u8FBC\u307F\u3082\u3053\u308C\u3067\u7167\u5408\u3059\u308B\uFF09
  organization_id  bigint references organizations (id),
  department       text,                          -- \u90E8\u7F72
  job_title        text,                          -- \u5F79\u8077\uFF08\u81EA\u7531\u8A18\u8FF0\u3002\u540D\u523A\u3069\u304A\u308A\uFF09
  job_level        text,                          -- \u5F79\u8077\u533A\u5206\u3002job_title \u304B\u3089 src/job-level.js \u306E\u8868\u3067\u81EA\u52D5\u3067\u4ED8\u3051\u308B
  notes            text,
  merged_into_id   bigint references contacts (id),  -- \u540D\u5BC4\u305B\u3067\u7D71\u5408\u3055\u308C\u305F\u5074\u306F\u3053\u3053\u306B\u7D71\u5408\u5148\u3092\u5165\u308C\u3066\u6B8B\u3059
  archived_at      timestamptz,                   -- \u9000\u8077\u30FB\u4E0D\u8981\u306A\u3069\u3067\u4E00\u89A7\u304B\u3089\u5916\u3057\u305F\u3082\u306E
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (merged_into_id is null or merged_into_id <> id)
);
-- \u6709\u52B9\u306A\u9023\u7D61\u5148\u306E\u4E2D\u3067\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u4E00\u610F\uFF08\u7D71\u5408\u6E08\u307F\u30FB\u30A2\u30FC\u30AB\u30A4\u30D6\u6E08\u307F\u306F\u9664\u304F\uFF09
create unique index contacts_email_active_uq on contacts (email)
  where merged_into_id is null and archived_at is null;
create index contacts_organization_idx on contacts (organization_id);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u5165\u624B\u7D4C\u8DEF\u3068\u540C\u610F\u306E\u6839\u62E0
create table import_batches (
  id               bigint generated always as identity primary key,
  filename         text not null,
  sheet_name       text,
  status           text not null default 'preview' check (status in ('preview', 'done', 'cancelled')),  -- \u78BA\u8A8D\u4E2D / \u53D6\u308A\u8FBC\u307F\u6E08\u307F / \u3084\u3081\u305F
  options          jsonb not null default '{}',   -- \u7D4C\u8DEF\u30FB\u9001\u3063\u3066\u3088\u3044\u6839\u62E0\u306A\u3069\u3001\u5168\u884C\u306B\u5171\u901A\u3067\u4ED8\u3051\u308B\u60C5\u5831
  staged           jsonb,                         -- \u78BA\u8A8D\u753B\u9762\u306B\u51FA\u3059\u5404\u884C\u306E\u5224\u5B9A\u3002\u53D6\u308A\u8FBC\u307F\u5F8C\u306F\u6D88\u3059
  imported_by      bigint references staff_users (id),
  imported_at      timestamptz not null default now(),
  applied_at       timestamptz,
  row_count        integer not null default 0,
  created_count    integer not null default 0,
  updated_count    integer not null default 0,
  skipped_count    integer not null default 0
);

create table contact_sources (
  id               bigint generated always as identity primary key,
  contact_id       bigint not null references contacts (id) on delete cascade,
  source_kind      text not null check (source_kind in ('\u540D\u523A\u4EA4\u63DB', '\u30A4\u30D9\u30F3\u30C8\u7533\u8FBC', '\u554F\u3044\u5408\u308F\u305B', '\u624B\u5165\u529B', '\u305D\u306E\u4ED6')),
  source_detail    text,                          -- \u4F8B: \u4EA4\u63DB\u3057\u305F\u6559\u54E1\u540D\u3001\u30A4\u30D9\u30F3\u30C8\u540D
  acquired_on      date,
  consent_basis    text not null check (consent_basis in (
                     'business_card',   -- \u540D\u523A\u306A\u3069\u66F8\u9762\u3067\u30A2\u30C9\u30EC\u30B9\u306E\u901A\u77E5\u3092\u53D7\u3051\u305F\uFF08\u7279\u96FB\u6CD5\u306E\u4F8B\u5916\uFF09
                     'opt_in',          -- \u30D5\u30A9\u30FC\u30E0\u7B49\u3067\u6848\u5185\u30E1\u30FC\u30EB\u306E\u53D7\u4FE1\u306B\u540C\u610F
                     'unknown'          -- \u6839\u62E0\u4E0D\u660E\u3002\u914D\u4FE1\u5BFE\u8C61\u304B\u3089\u5916\u3059\u904B\u7528\u3092\u60F3\u5B9A
                   )),
  consent_note     text,                          -- \u4F8B: \u7533\u8FBC\u30D5\u30A9\u30FC\u30E0\u306E\u540C\u610F\u6587\u8A00\u3001\u78BA\u8A8D\u65E5
  import_batch_id  bigint references import_batches (id),
  raw              jsonb,                         -- \u53D6\u308A\u8FBC\u307F\u5143\u306E\u884C\u3092\u305D\u306E\u307E\u307E\u4FDD\u5B58\uFF08\u5F8C\u304B\u3089\u78BA\u8A8D\u3067\u304D\u308B\u3088\u3046\u306B\uFF09
  created_at       timestamptz not null default now()
);
create index contact_sources_contact_idx on contact_sources (contact_id);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u30A4\u30D9\u30F3\u30C8
create table events (
  id               bigint generated always as identity primary key,
  name             text not null,
  kind             text check (kind in ('\u30BB\u30DF\u30CA\u30FC', '\u30EF\u30FC\u30AF\u30B7\u30E7\u30C3\u30D7', '\u8B1B\u5EA7', '\u30B7\u30F3\u30DD\u30B8\u30A6\u30E0', '\u4EA4\u6D41\u4F1A', '\u305D\u306E\u4ED6')),
  held_on          date,
  format           text check (format in ('\u5BFE\u9762', '\u30AA\u30F3\u30E9\u30A4\u30F3', '\u30CF\u30A4\u30D6\u30EA\u30C3\u30C9')),
  location         text,
  notes            text,
  created_at       timestamptz not null default now()
);

create table event_participations (
  contact_id       bigint not null references contacts (id) on delete cascade,
  event_id         bigint not null references events (id) on delete cascade,
  status           text not null default 'applied'
                   check (status in ('applied', 'attended', 'absent', 'cancelled')),  -- \u7533\u8FBC / \u53C2\u52A0 / \u6B20\u5E2D / \u30AD\u30E3\u30F3\u30BB\u30EB
  registered_at    timestamptz,
  primary key (contact_id, event_id)
);
create index event_participations_event_idx on event_participations (event_id, status);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u8208\u5473\u95A2\u5FC3
create table interests (
  id               bigint generated always as identity primary key,
  name             text unique not null,          -- \u8208\u5473\u5206\u985E\u306E\u5358\u8A9E\uFF08\u4F8B: \u65B0\u898F\u4E8B\u696D\u3001\u30EA\u30D9\u30E9\u30EB\u30A2\u30FC\u30C4\uFF09
  category         text,
  sort_order       integer not null default 0,
  active           boolean not null default true
);

create table contact_interests (
  contact_id       bigint not null references contacts (id) on delete cascade,
  interest_id      bigint not null references interests (id) on delete cascade,
  origin           text not null default 'staff'
                   check (origin in ('self_reported', 'event', 'staff')),  -- \u672C\u4EBA\u7533\u544A / \u53C2\u52A0\u30A4\u30D9\u30F3\u30C8\u304B\u3089\u63A8\u5B9A / \u30B9\u30BF\u30C3\u30D5\u5224\u65AD
  created_at       timestamptz not null default now(),
  primary key (contact_id, interest_id)
);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u9001\u4FE1\u7981\u6B62\u30EA\u30B9\u30C8
create table suppressions (
  email            citext primary key,
  reason           text not null check (reason in ('unsubscribe', 'hard_bounce', 'complaint', 'manual')),
  delivery_id      bigint,                        -- \u304D\u3063\u304B\u3051\u306B\u306A\u3063\u305F\u914D\u4FE1\uFF08\u3042\u308C\u3070\uFF09\u3002deliveries \u4F5C\u6210\u5F8C\u306B FK \u3092\u5F35\u308B
  note             text,
  created_at       timestamptz not null default now()
);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u30BB\u30B0\u30E1\u30F3\u30C8\u3068\u914D\u4FE1
create table segments (
  id               bigint generated always as identity primary key,
  name             text not null,
  definition       jsonb not null,                -- \u753B\u9762\u3067\u7D44\u3093\u3060\u6761\u4EF6\u3002\u4F8B\u306F\u672B\u5C3E\u306E\u30B3\u30E1\u30F3\u30C8\u53C2\u7167
  created_by       bigint references staff_users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table campaigns (
  id               bigint generated always as identity primary key,
  name             text not null,                 -- \u7BA1\u7406\u7528\u306E\u540D\u524D
  subject          text not null,
  body_text        text not null,                 -- \u5DEE\u3057\u8FBC\u307F\u306F {{\u6C0F\u540D}} {{\u6240\u5C5E}} \u306A\u3069
  body_html        text,
  from_address     citext not null default 'social-design-center@eikei.ac.jp',
  segment_id       bigint references segments (id),
  segment_definition jsonb,                       -- \u9001\u4FE1\u78BA\u5B9A\u6642\u306E\u6761\u4EF6\u3092\u56FA\u5B9A\uFF08\u5F8C\u3067\u30BB\u30B0\u30E1\u30F3\u30C8\u3092\u7DE8\u96C6\u3057\u3066\u3082\u5C65\u6B74\u304C\u5909\u308F\u3089\u306A\u3044\uFF09
  -- \u9001\u308A\u65B9\u306F2\u3064\uFF08src/config.js \u306E sendMode\uFF09\u3002
  --   \u66F8\u304D\u51FA\u3059\u5F62\uFF1A\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\uFF08Excel\uFF09\u3092\u66F8\u304D\u51FA\u3057\u305F\u6642\u70B9\u3067\u9001\u4FE1\u6E08\u307F\u3002\u9014\u4E2D\u3067\u6B62\u307E\u3063\u305F\u3068\u304D\u306F exported\uFF08\u9001\u308A\u6B8B\u3057\u3042\u308A\uFF09
  --   \u76F4\u63A5\u9001\u308B\u5F62\uFF1A\u4E88\u7D04\u3059\u308B\u3068 scheduled \u2192 sending \u2192 sent \u3068\u9032\u307F\u3001CRM \u304C\u5C11\u3057\u305A\u3064\u9001\u308B
  status           text not null default 'draft'
                   check (status in ('draft', 'test_sent', 'scheduled', 'sending', 'exported', 'sent', 'cancelled')),
  test_sent_at     timestamptz,                   -- \u81EA\u5206\u3042\u3066\u306E\u30C6\u30B9\u30C8\u7528\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u305F\u65E5\u6642\uFF08\u4EFB\u610F\uFF09
  exported_at      timestamptz,                   -- \u4EBA\u6570\u3092\u78BA\u8A8D\u3057\u3066\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u305F\u65E5\u6642\uFF08\u66F8\u304D\u51FA\u3059\u5F62\uFF09
  scheduled_at     timestamptz,                   -- \u9001\u4FE1\u958B\u59CB\u306E\u4E88\u7D04\u65E5\u6642\uFF08\u76F4\u63A5\u9001\u308B\u5F62\uFF09
  confirmed_count  integer,                       -- \u78BA\u5B9A\u6642\u306B\u62C5\u5F53\u8005\u304C\u5165\u529B\u3057\u305F\u4EF6\u6570\uFF08\u8AA4\u9001\u4FE1\u9632\u6B62\uFF09
  created_by       bigint references staff_users (id),
  confirmed_by     bigint references staff_users (id),
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  check (status not in ('scheduled', 'sending') or test_sent_at is not null)   -- \u76F4\u63A5\u9001\u308B\u5F62\u306F\u3001\u30C6\u30B9\u30C8\u9001\u4FE1\u304C\u6E08\u3080\u307E\u3067\u4E88\u7D04\u3067\u304D\u306A\u3044
);

create table deliveries (
  id               bigint generated always as identity primary key,
  campaign_id      bigint not null references campaigns (id) on delete cascade,
  contact_id       bigint references contacts (id) on delete set null,
  email            citext not null,               -- \u9001\u4FE1\u6642\u70B9\u306E\u30A2\u30C9\u30EC\u30B9\u3092\u56FA\u5B9A
  status           text not null default 'queued'
                   check (status in ('queued', 'sent', 'failed', 'skipped')),   -- queued\uFF1A\u307E\u3060\u9001\u3063\u3066\u3044\u306A\u3044\u3002sent\uFF1A\u9001\u3063\u305F\uFF08\u66F8\u304D\u51FA\u3059\u5F62\u3067\u306F\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u306B\u5165\u308C\u305F\uFF09
  attempts         integer not null default 0,    -- \u76F4\u63A5\u9001\u308B\u5F62\u3067\u3001\u9001\u308D\u3046\u3068\u3057\u305F\u56DE\u6570
  last_error       text,                          -- \u9001\u3089\u306A\u304B\u3063\u305F\u7406\u7531\u30FB\u5931\u6557\u306E\u5185\u5BB9
  queued_at        timestamptz not null default now(),
  sent_at          timestamptz,
  unique (campaign_id, email)                     -- \u540C\u3058\u914D\u4FE1\u3067\u540C\u3058\u30A2\u30C9\u30EC\u30B9\u306B\u4E8C\u5EA6\u9001\u3089\u306A\u3044
);
create index deliveries_queue_idx on deliveries (campaign_id, status);

alter table suppressions
  add constraint suppressions_delivery_fk foreign key (delivery_id) references deliveries (id) on delete set null;

-- \u5171\u6709\u30E1\u30FC\u30EB\u30DC\u30C3\u30AF\u30B9\u306B\u623B\u3063\u3066\u304D\u305F\u4E0D\u9054\u30FB\u81EA\u52D5\u5FDC\u7B54\u3001\u914D\u4FE1\u505C\u6B62\u306E\u8FD4\u4FE1\u306E\u8A18\u9332\uFF08\u4ECA\u306F\u4F7F\u3063\u3066\u3044\u306A\u3044\u3002\u81EA\u52D5\u4ED5\u5206\u3051\u3092\u4F5C\u308B\u3068\u304D\u306E\u305F\u3081\uFF09
create table mailbox_events (
  id               bigint generated always as identity primary key,
  kind             text not null check (kind in ('hard_bounce', 'soft_bounce', 'auto_reply', 'unsubscribe', 'other')),
  email            citext,
  delivery_id      bigint references deliveries (id) on delete set null,
  graph_message_id text unique,                   -- \u540C\u3058\u53D7\u4FE1\u30E1\u30FC\u30EB\u3092\u4E8C\u91CD\u306B\u51E6\u7406\u3057\u306A\u3044
  detail           text,
  received_at      timestamptz not null default now()
);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u64CD\u4F5C\u30ED\u30B0\uFF08\u8AA4\u9001\u4FE1\u6642\u306E\u78BA\u8A8D\u7528\uFF09
create table audit_log (
  id               bigint generated always as identity primary key,
  actor_id         bigint references staff_users (id),
  action           text not null,                 -- \u4F8B: campaign.confirm, contact.merge, import.run
  target_type      text,
  target_id        bigint,
  detail           jsonb,
  at               timestamptz not null default now()
);

-- \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 \u9001\u4FE1\u3057\u3066\u3088\u3044\u9023\u7D61\u5148
-- \u30BB\u30B0\u30E1\u30F3\u30C8\u306F\u5FC5\u305A\u3053\u306E\u30D3\u30E5\u30FC\u3092\u8D77\u70B9\u306B\u7D5E\u308A\u8FBC\u3080\u3002
create view sendable_contacts as
select c.*
from contacts c
where c.merged_into_id is null
  and c.archived_at is null
  and not exists (select 1 from suppressions s where s.email = c.email)
  -- \u540C\u610F\u306E\u6839\u62E0\u304C\u78BA\u8A8D\u3067\u304D\u308B\u7D4C\u8DEF\u304C\u4E00\u3064\u4EE5\u4E0A\u3042\u308B\u3053\u3068
  and exists (
    select 1 from contact_sources cs
    where cs.contact_id = c.id and cs.consent_basis in ('business_card', 'opt_in')
  );

-- \u30BB\u30B0\u30E1\u30F3\u30C8\u5B9A\u7FA9\u306E\u4F8B\uFF08segments.definition\uFF09
-- \u300C2025\u5E74\u5EA6\u306EDX\u30BB\u30DF\u30CA\u30FC\u306B\u53C2\u52A0\u3057\u3001\u8208\u5473\u5206\u985E\u306B\u300E\u65B0\u898F\u4E8B\u696D\u300F\u3092\u6301\u3064\u3001\u5927\u4F01\u696D\u304B\u4E2D\u5805\u4F01\u696D\u306E\u4EBA\u300D
-- {
--   "all": [
--     {"field": "event", "event_ids": [12], "status": ["attended"]},
--     {"field": "interest", "interest_ids": [3]},
--     {"field": "size_class", "in": ["\u5927\u4F01\u696D", "\u4E2D\u5805\u4F01\u696D"]}
--   ],
--   "none": [
--     {"field": "event", "event_ids": [15], "status": ["applied", "attended"]}
--   ]
-- }

-- \u78BA\u8A8D\u7528\u306E\u9001\u4FE1\u7BB1\u3002\u9001\u308A\u65B9\u304C outbox \u306E\u3068\u304D\u3001\u5B9F\u969B\u306B\u306F\u9001\u3089\u305A\u3053\u3053\u306B\u4FDD\u5B58\u3059\u308B
create table outbox_messages (
  id               bigint generated always as identity primary key,
  to_address       citext not null,
  subject          text not null,
  body_text        text not null,
  delivery_ref     text,
  created_at       timestamptz not null default now()
);
`;var B,Q={};function ge(t){Q=t}var Dt=typeof process>"u"?{}:process.env;async function be(){if(B)return B;if(Dt.DATABASE_URL){let{default:t}=await import("pg");B=new t.Pool({connectionString:Dt.DATABASE_URL})}else{let{PGlite:t}=Q.pglite??await import("@electric-sql/pglite"),{citext:e}=Q.citext??await import("@electric-sql/pglite/contrib/citext"),s=Q.dataDir??Dt.PGLITE_DIR??".data/pglite";if(s.startsWith(".")||s.startsWith("/")){let{mkdir:a}=await import("node:fs/promises");await a(s,{recursive:!0})}B=new t(s,{extensions:{citext:e}})}return await Ps(),B}async function Cs(){if(Q.schema)return Q.schema;let{readFile:t}=await import("node:fs/promises");return t(new URL("../db/schema.sql",import.meta.url),"utf8")}async function Ps(){let{rows:t}=await B.query("select to_regclass('public.contacts') as t");if(t[0].t)return;let e=await Cs();B.exec?await B.exec(e):await B.query(e)}async function f(t,e=[]){return(await(await be()).query(t,e)).rows}async function _(t,e=[]){return(await f(t,e))[0]}async function A(t){let e=await be();if(e.connect&&e.totalCount!==void 0){let s=await e.connect();try{await s.query("begin");let a=await t((n,i=[])=>s.query(n,i).then(o=>o.rows));return await s.query("commit"),a}catch(a){throw await s.query("rollback"),a}finally{s.release()}}return e.transaction(async s=>t((a,n=[])=>s.query(a,n).then(i=>i.rows)))}var _e=async(t,e=Object.create(null))=>{let{all:s=!1,dot:a=!1}=e,i=(t instanceof wt?t.raw.headers:t.headers).get("Content-Type");return i?.startsWith("multipart/form-data")||i?.startsWith("application/x-www-form-urlencoded")?Is(t,{all:s,dot:a}):{}};async function Is(t,e){let s=await t.formData();return s?Ns(s,e):{}}function Ns(t,e){let s=Object.create(null);return t.forEach((a,n)=>{e.all||n.endsWith("[]")?Ds(s,n,a):s[n]=a}),e.dot&&Object.entries(s).forEach(([a,n])=>{a.includes(".")&&(Ls(s,a,n),delete s[a])}),s}var Ds=(t,e,s)=>{t[e]!==void 0?Array.isArray(t[e])?t[e].push(s):t[e]=[t[e],s]:t[e]=s},Ls=(t,e,s)=>{let a=t,n=e.split(".");n.forEach((i,o)=>{o===n.length-1?a[i]=s:((!a[i]||typeof a[i]!="object"||Array.isArray(a[i])||a[i]instanceof File)&&(a[i]=Object.create(null)),a=a[i])})};var Mt=t=>{let e=t.split("/");return e[0]===""&&e.shift(),e},$e=t=>{let{groups:e,path:s}=Ms(t),a=Mt(s);return Us(a,e)},Ms=t=>{let e=[];return t=t.replace(/\{[^}]+\}/g,(s,a)=>{let n=`@${a}`;return e.push([n,s]),n}),{groups:e,path:t}},Us=(t,e)=>{for(let s=e.length-1;s>=0;s--){let[a]=e[s];for(let n=t.length-1;n>=0;n--)if(t[n].includes(a)){t[n]=t[n].replace(a,e[s][1]);break}}return t},yt={},Ut=t=>{if(t==="*")return"*";let e=t.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);return e?(yt[t]||(e[2]?yt[t]=[t,e[1],new RegExp("^"+e[2]+"$")]:yt[t]=[t,e[1],!0]),yt[t]):null},Ft=(t,e)=>{try{return e(t)}catch{return t.replace(/(?:%[0-9A-Fa-f]{2})+/g,s=>{try{return e(s)}catch{return s}})}},Fs=t=>Ft(t,decodeURI),Bt=t=>{let e=t.url,s=e.indexOf("/",8),a=s;for(;a<e.length;a++){let n=e.charCodeAt(a);if(n===37){let i=e.indexOf("?",a),o=e.slice(s,i===-1?void 0:i);return Fs(o.includes("%25")?o.replace(/%25/g,"%2525"):o)}else if(n===63)break}return e.slice(s,a)};var ve=t=>{let e=Bt(t);return e.length>1&&e.at(-1)==="/"?e.slice(0,-1):e},Z=(...t)=>{let e="",s=!1;for(let a of t)e.at(-1)==="/"&&(e=e.slice(0,-1),s=!0),a[0]!=="/"&&(a=`/${a}`),a==="/"&&s?e=`${e}/`:a!=="/"&&(e=`${e}${a}`),a==="/"&&e===""&&(e="/");return e},xt=t=>{if(!t.match(/\:.+\?$/))return null;let e=t.split("/"),s=[],a="";return e.forEach(n=>{if(n!==""&&!/\:/.test(n))a+="/"+n;else if(/\:/.test(n))if(/\?/.test(n)){s.length===0&&a===""?s.push("/"):s.push(a);let i=n.replace("?","");a+="/"+i,s.push(a)}else a+="/"+n}),s.filter((n,i,o)=>o.indexOf(n)===i)},Lt=t=>/[%+]/.test(t)?(t.indexOf("+")!==-1&&(t=t.replace(/\+/g," ")),t.indexOf("%")!==-1?Ht(t):t):t,we=(t,e,s)=>{let a;if(!s&&e&&!/[%+]/.test(e)){let o=t.indexOf(`?${e}`,8);for(o===-1&&(o=t.indexOf(`&${e}`,8));o!==-1;){let c=t.charCodeAt(o+e.length+1);if(c===61){let r=o+e.length+2,d=t.indexOf("&",r);return Lt(t.slice(r,d===-1?void 0:d))}else if(c==38||isNaN(c))return"";o=t.indexOf(`&${e}`,o+1)}if(a=/[%+]/.test(t),!a)return}let n={};a??=/[%+]/.test(t);let i=t.indexOf("?",8);for(;i!==-1;){let o=t.indexOf("&",i+1),c=t.indexOf("=",i);c>o&&o!==-1&&(c=-1);let r=t.slice(i+1,c===-1?o===-1?void 0:o:c);if(a&&(r=Lt(r)),i=o,r==="")continue;let d;c===-1?d="":(d=t.slice(c+1,o===-1?void 0:o),a&&(d=Lt(d))),s?(n[r]&&Array.isArray(n[r])||(n[r]=[]),n[r].push(d)):n[r]??=d}return e?n[e]:n},ye=we,xe=(t,e)=>we(t,e,!0),Ht=decodeURIComponent;var ke=t=>Ft(t,Ht),wt=class{raw;#e;#t;routeIndex=0;path;bodyCache={};constructor(t,e="/",s=[[]]){this.raw=t,this.path=e,this.#t=s,this.#e={}}param(t){return t?this.#a(t):this.#i()}#a(t){let e=this.#t[0][this.routeIndex][1][t],s=this.#n(e);return s?/\%/.test(s)?ke(s):s:void 0}#i(){let t={},e=Object.keys(this.#t[0][this.routeIndex][1]);for(let s of e){let a=this.#n(this.#t[0][this.routeIndex][1][s]);a&&typeof a=="string"&&(t[s]=/\%/.test(a)?ke(a):a)}return t}#n(t){return this.#t[1]?this.#t[1][t]:t}query(t){return ye(this.url,t)}queries(t){return xe(this.url,t)}header(t){if(t)return this.raw.headers.get(t.toLowerCase())??void 0;let e={};return this.raw.headers.forEach((s,a)=>{e[a]=s}),e}async parseBody(t){return this.bodyCache.parsedBody??=await _e(this,t)}#s=t=>{let{bodyCache:e,raw:s}=this,a=e[t];if(a)return a;let n=Object.keys(e)[0];return n?e[n].then(i=>(n==="json"&&(i=JSON.stringify(i)),new Response(i)[t]())):e[t]=s[t]()};json(){return this.#s("json")}text(){return this.#s("text")}arrayBuffer(){return this.#s("arrayBuffer")}blob(){return this.#s("blob")}formData(){return this.#s("formData")}addValidatedData(t,e){this.#e[t]=e}valid(t){return this.#e[t]}get url(){return this.raw.url}get method(){return this.raw.method}get matchedRoutes(){return this.#t[0].map(([[,t]])=>t)}get routePath(){return this.#t[0].map(([[,t]])=>t)[this.routeIndex].path}};var Gt={Stringify:1,BeforeStream:2,Stream:3},T=(t,e)=>{let s=new String(t);return s.isEscaped=!0,s.callbacks=e,s},Bs=/[&<>'"]/,je=async(t,e)=>{let s="";e||=[];let a=await Promise.all(t);for(let n=a.length-1;s+=a[n],n--,!(n<0);n--){let i=a[n];typeof i=="object"&&e.push(...i.callbacks||[]);let o=i.isEscaped;if(i=await(typeof i=="object"?i.toString():i),typeof i=="object"&&e.push(...i.callbacks||[]),i.isEscaped??o)s+=i;else{let c=[s];kt(i,c),s=c[0]}}return T(s,e)},kt=(t,e)=>{let s=t.search(Bs);if(s===-1){e[0]+=t;return}let a,n,i=0;for(n=s;n<t.length;n++){switch(t.charCodeAt(n)){case 34:a="&quot;";break;case 39:a="&#39;";break;case 38:a="&amp;";break;case 60:a="&lt;";break;case 62:a="&gt;";break;default:continue}e[0]+=t.substring(i,n)+a,i=n+1}e[0]+=t.substring(i,n)},Se=t=>{let e=t.callbacks;if(!e?.length)return t;let s=[t],a={};return e.forEach(n=>n({phase:Gt.Stringify,buffer:s,context:a})),s[0]},Jt=async(t,e,s,a,n)=>{typeof t=="object"&&!(t instanceof String)&&(t instanceof Promise||(t=t.toString()),t instanceof Promise&&(t=await t));let i=t.callbacks;if(!i?.length)return Promise.resolve(t);n?n[0]+=t:n=[t];let o=Promise.all(i.map(c=>c({phase:e,buffer:n,context:a}))).then(c=>Promise.all(c.filter(Boolean).map(r=>Jt(r,e,!1,a,n))).then(()=>n[0]));return s?T(await o,i):o};var Hs="text/plain; charset=UTF-8",Kt=(t,e={})=>{for(let s of Object.keys(e))t.set(s,e[s]);return t},jt=class{#e;#t;env={};#a;finalized=!1;error;#i=200;#n;#s;#r;#l;#d=!0;#p;#c;#m;#u;#f;constructor(t,e){this.#e=t,e&&(this.#n=e.executionCtx,this.env=e.env,this.#m=e.notFoundHandler,this.#f=e.path,this.#u=e.matchResult)}get req(){return this.#t??=new wt(this.#e,this.#f,this.#u),this.#t}get event(){if(this.#n&&"respondWith"in this.#n)return this.#n;throw Error("This context has no FetchEvent")}get executionCtx(){if(this.#n)return this.#n;throw Error("This context has no ExecutionContext")}get res(){return this.#d=!1,this.#l||=new Response("404 Not Found",{status:404})}set res(t){if(this.#d=!1,this.#l&&t)try{for(let[e,s]of this.#l.headers.entries())if(e!=="content-type")if(e==="set-cookie"){let a=this.#l.headers.getSetCookie();t.headers.delete("set-cookie");for(let n of a)t.headers.append("set-cookie",n)}else t.headers.set(e,s)}catch(e){if(e instanceof TypeError&&e.message.includes("immutable")){this.res=new Response(t.body,{headers:t.headers,status:t.status});return}else throw e}this.#l=t,this.finalized=!0}render=(...t)=>(this.#c??=e=>this.html(e),this.#c(...t));setLayout=t=>this.#p=t;getLayout=()=>this.#p;setRenderer=t=>{this.#c=t};header=(t,e,s)=>{if(e===void 0){this.#s?this.#s.delete(t):this.#r&&delete this.#r[t.toLocaleLowerCase()],this.finalized&&this.res.headers.delete(t);return}s?.append?(this.#s||(this.#d=!1,this.#s=new Headers(this.#r),this.#r={}),this.#s.append(t,e)):this.#s?this.#s.set(t,e):(this.#r??={},this.#r[t.toLowerCase()]=e),this.finalized&&(s?.append?this.res.headers.append(t,e):this.res.headers.set(t,e))};status=t=>{this.#d=!1,this.#i=t};set=(t,e)=>{this.#a??=new Map,this.#a.set(t,e)};get=t=>this.#a?this.#a.get(t):void 0;get var(){return this.#a?Object.fromEntries(this.#a):{}}#o(t,e,s){if(this.#d&&!s&&!e&&this.#i===200)return new Response(t,{headers:this.#r});if(e&&typeof e!="number"){let n=new Headers(e.headers);this.#s&&this.#s.forEach((o,c)=>{c==="set-cookie"?n.append(c,o):n.set(c,o)});let i=Kt(n,this.#r);return new Response(t,{headers:i,status:e.status??this.#i})}let a=typeof e=="number"?e:this.#i;this.#r??={},this.#s??=new Headers,Kt(this.#s,this.#r),this.#l&&(this.#l.headers.forEach((n,i)=>{i==="set-cookie"?this.#s?.append(i,n):this.#s?.set(i,n)}),Kt(this.#s,this.#r)),s??={};for(let[n,i]of Object.entries(s))if(typeof i=="string")this.#s.set(n,i);else{this.#s.delete(n);for(let o of i)this.#s.append(n,o)}return new Response(t,{status:a,headers:this.#s})}newResponse=(...t)=>this.#o(...t);body=(t,e,s)=>typeof e=="number"?this.#o(t,e,s):this.#o(t,e);text=(t,e,s)=>{if(!this.#r){if(this.#d&&!s&&!e)return new Response(t);this.#r={}}return this.#r["content-type"]=Hs,typeof e=="number"?this.#o(t,e,s):this.#o(t,e)};json=(t,e,s)=>{let a=JSON.stringify(t);return this.#r??={},this.#r["content-type"]="application/json",typeof e=="number"?this.#o(a,e,s):this.#o(a,e)};html=(t,e,s)=>(this.#r??={},this.#r["content-type"]="text/html; charset=UTF-8",typeof t=="object"?Jt(t,Gt.Stringify,!1,{}).then(a=>typeof e=="number"?this.#o(a,e,s):this.#o(a,e)):typeof e=="number"?this.#o(t,e,s):this.#o(t,e));redirect=(t,e)=>(this.#s??=new Headers,this.#s.set("Location",String(t)),this.newResponse(null,e??302));notFound=()=>(this.#m??=()=>new Response,this.#m(this))};var Wt=(t,e,s)=>(a,n)=>{let i=-1,o=a instanceof jt;return c(0);async function c(r){if(r<=i)throw new Error("next() called multiple times");i=r;let d,m=!1,u;if(t[r]?(u=t[r][0][0],o&&(a.req.routeIndex=r)):u=r===t.length&&n||void 0,!u)o&&a.finalized===!1&&s&&(d=await s(a));else try{d=await u(a,()=>c(r+1))}catch(p){if(p instanceof Error&&o&&e)a.error=p,d=await e(p,a),m=!0;else throw p}return d&&(a.finalized===!1||m)&&(a.res=d),a}};var E="ALL",Ee="all",Re=["get","post","put","delete","options","patch"],St="Can not add a route since the matcher is already built.",Et=class extends Error{};var Gs=Symbol("composedHandler"),Js=t=>t.text("404 Not Found",404),Oe=(t,e)=>"getResponse"in t?t.getResponse():(console.error(t),e.text("Internal Server Error",500)),Xt=class{get;post;put;delete;options;patch;all;on;use;router;getPath;_basePath="/";#e="/";routes=[];constructor(t={}){[...Re,Ee].forEach(a=>{this[a]=(n,...i)=>(typeof n=="string"?this.#e=n:this.#i(a,this.#e,n),i.forEach(o=>{this.#i(a,this.#e,o)}),this)}),this.on=(a,n,...i)=>{for(let o of[n].flat()){this.#e=o;for(let c of[a].flat())i.map(r=>{this.#i(c.toUpperCase(),this.#e,r)})}return this},this.use=(a,...n)=>(typeof a=="string"?this.#e=a:(this.#e="*",n.unshift(a)),n.forEach(i=>{this.#i(E,this.#e,i)}),this);let s=t.strict??!0;delete t.strict,Object.assign(this,t),this.getPath=s?t.getPath??Bt:ve}#t(){let t=new Xt({router:this.router,getPath:this.getPath});return t.routes=this.routes,t}#a=Js;errorHandler=Oe;route(t,e){let s=this.basePath(t);return e.routes.map(a=>{let n;e.errorHandler===Oe?n=a.handler:(n=async(i,o)=>(await Wt([],e.errorHandler)(i,()=>a.handler(i,o))).res,n[Gs]=a.handler),s.#i(a.method,a.path,n)}),this}basePath(t){let e=this.#t();return e._basePath=Z(this._basePath,t),e}onError=t=>(this.errorHandler=t,this);notFound=t=>(this.#a=t,this);mount(t,e,s){let a,n;s&&(typeof s=="function"?n=s:(n=s.optionHandler,a=s.replaceRequest));let i=n?c=>{let r=n(c);return Array.isArray(r)?r:[r]}:c=>{let r;try{r=c.executionCtx}catch{}return[c.env,r]};a||=(()=>{let c=Z(this._basePath,t),r=c==="/"?0:c.length;return d=>{let m=new URL(d.url);return m.pathname=m.pathname.slice(r)||"/",new Request(m,d)}})();let o=async(c,r)=>{let d=await e(a(c.req.raw),...i(c));if(d)return d;await r()};return this.#i(E,Z(t,"*"),o),this}#i(t,e,s){t=t.toUpperCase(),e=Z(this._basePath,e);let a={path:e,method:t,handler:s};this.router.add(t,e,[s,a]),this.routes.push(a)}#n(t,e){if(t instanceof Error)return this.errorHandler(t,e);throw t}#s(t,e,s,a){if(a==="HEAD")return(async()=>new Response(null,await this.#s(t,e,s,"GET")))();let n=this.getPath(t,{env:s}),i=this.router.match(a,n),o=new jt(t,{path:n,matchResult:i,env:s,executionCtx:e,notFoundHandler:this.#a});if(i[0].length===1){let r;try{r=i[0][0][0][0](o,async()=>{o.res=await this.#a(o)})}catch(d){return this.#n(d,o)}return r instanceof Promise?r.then(d=>d||(o.finalized?o.res:this.#a(o))).catch(d=>this.#n(d,o)):r??this.#a(o)}let c=Wt(i[0],this.errorHandler,this.#a);return(async()=>{try{let r=await c(o);if(!r.finalized)throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");return r.res}catch(r){return this.#n(r,o)}})()}fetch=(t,...e)=>this.#s(t,e[1],e[0],t.method);request=(t,e,s,a)=>t instanceof Request?this.fetch(e?new Request(t,e):t,s,a):(t=t.toString(),this.fetch(new Request(/^https?:\/\//.test(t)?t:`http://localhost${Z("/",t)}`,e),s,a));fire=()=>{addEventListener("fetch",t=>{t.respondWith(this.#s(t.request,t,void 0,t.request.method))})}};var Rt="[^/]+",ct=".*",mt="(?:|/.*)",tt=Symbol(),Ks=new Set(".\\+*[^]$()");function Ws(t,e){return t.length===1?e.length===1?t<e?-1:1:-1:e.length===1||t===ct||t===mt?1:e===ct||e===mt?-1:t===Rt?1:e===Rt?-1:t.length===e.length?t<e?-1:1:e.length-t.length}var Ot=class{#e;#t;#a=Object.create(null);insert(t,e,s,a,n){if(t.length===0){if(this.#e!==void 0)throw tt;if(n)return;this.#e=e;return}let[i,...o]=t,c=i==="*"?o.length===0?["","",ct]:["","",Rt]:i==="/*"?["","",mt]:i.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/),r;if(c){let d=c[1],m=c[2]||Rt;if(d&&c[2]&&(m=m.replace(/^\((?!\?:)(?=[^)]+\)$)/,"(?:"),/\((?!\?:)/.test(m)))throw tt;if(r=this.#a[m],!r){if(Object.keys(this.#a).some(u=>u!==ct&&u!==mt))throw tt;if(n)return;r=this.#a[m]=new Ot,d!==""&&(r.#t=a.varIndex++)}!n&&d!==""&&s.push([d,r.#t])}else if(r=this.#a[i],!r){if(Object.keys(this.#a).some(d=>d.length>1&&d!==ct&&d!==mt))throw tt;if(n)return;r=this.#a[i]=new Ot}r.insert(o,e,s,a,n)}buildRegExpStr(){let e=Object.keys(this.#a).sort(Ws).map(s=>{let a=this.#a[s];return(typeof a.#t=="number"?`(${s})@${a.#t}`:Ks.has(s)?`\\${s}`:s)+a.buildRegExpStr()});return typeof this.#e=="number"&&e.unshift(`#${this.#e}`),e.length===0?"":e.length===1?e[0]:"(?:"+e.join("|")+")"}};var qe=class{#e={varIndex:0};#t=new Ot;insert(t,e,s){let a=[],n=[];for(let o=0;;){let c=!1;if(t=t.replace(/\{[^}]+\}/g,r=>{let d=`@\\${o}`;return n[o]=[d,r],o++,c=!0,d}),!c)break}let i=t.match(/(?::[^\/]+)|(?:\/\*$)|./g)||[];for(let o=n.length-1;o>=0;o--){let[c]=n[o];for(let r=i.length-1;r>=0;r--)if(i[r].indexOf(c)!==-1){i[r]=i[r].replace(c,n[o][1]);break}}return this.#t.insert(i,e,a,this.#e,s),a}buildRegExp(){let t=this.#t.buildRegExpStr();if(t==="")return[/^$/,[],[]];let e=0,s=[],a=[];return t=t.replace(/#(\d+)|@(\d+)|\.\*\$/g,(n,i,o)=>i!==void 0?(s[++e]=Number(i),"$()"):(o!==void 0&&(a[Number(o)]=++e),"")),[new RegExp(`^${t}`),s,a]}};var Ae=[],Xs=[/^$/,[],Object.create(null)],Te=Object.create(null);function ze(t){return Te[t]??=new RegExp(t==="*"?"":`^${t.replace(/\/\*$|([.\\+*[^\]$()])/g,(e,s)=>s?`\\${s}`:"(?:|/.*)")}$`)}function Vs(){Te=Object.create(null)}function Ys(t){let e=new qe,s=[];if(t.length===0)return Xs;let a=t.map(d=>[!/\*|\/:/.test(d[0]),...d]).sort(([d,m],[u,p])=>d?1:u?-1:m.length-p.length),n=Object.create(null);for(let d=0,m=-1,u=a.length;d<u;d++){let[p,h,b]=a[d];p?n[h]=[b.map(([v])=>[v,Object.create(null)]),Ae]:m++;let w;try{w=e.insert(h,m,p)}catch(v){throw v===tt?new Et(h):v}p||(s[m]=b.map(([v,S])=>{let R=Object.create(null);for(S-=1;S>=0;S--){let[I,V]=w[S];R[I]=V}return[v,R]}))}let[i,o,c]=e.buildRegExp();for(let d=0,m=s.length;d<m;d++)for(let u=0,p=s[d].length;u<p;u++){let h=s[d][u]?.[1];if(!h)continue;let b=Object.keys(h);for(let w=0,v=b.length;w<v;w++)h[b[w]]=c[h[b[w]]]}let r=[];for(let d in o)r[d]=s[o[d]];return[i,r,n]}function et(t,e){if(t){for(let s of Object.keys(t).sort((a,n)=>n.length-a.length))if(ze(s).test(e))return[...t[s]]}}var Vt=class{name="RegExpRouter";#e;#t;constructor(){this.#e={[E]:Object.create(null)},this.#t={[E]:Object.create(null)}}add(t,e,s){let a=this.#e,n=this.#t;if(!a||!n)throw new Error(St);a[t]||[a,n].forEach(c=>{c[t]=Object.create(null),Object.keys(c[E]).forEach(r=>{c[t][r]=[...c[E][r]]})}),e==="/*"&&(e="*");let i=(e.match(/\/:/g)||[]).length;if(/\*$/.test(e)){let c=ze(e);t===E?Object.keys(a).forEach(r=>{a[r][e]||=et(a[r],e)||et(a[E],e)||[]}):a[t][e]||=et(a[t],e)||et(a[E],e)||[],Object.keys(a).forEach(r=>{(t===E||t===r)&&Object.keys(a[r]).forEach(d=>{c.test(d)&&a[r][d].push([s,i])})}),Object.keys(n).forEach(r=>{(t===E||t===r)&&Object.keys(n[r]).forEach(d=>c.test(d)&&n[r][d].push([s,i]))});return}let o=xt(e)||[e];for(let c=0,r=o.length;c<r;c++){let d=o[c];Object.keys(n).forEach(m=>{(t===E||t===m)&&(n[m][d]||=[...et(a[m],d)||et(a[E],d)||[]],n[m][d].push([s,i-r+c+1]))})}}match(t,e){Vs();let s=this.#a();return this.match=(a,n)=>{let i=s[a]||s[E],o=i[2][n];if(o)return o;let c=n.match(i[0]);if(!c)return[[],Ae];let r=c.indexOf("",1);return[i[1][r],c]},this.match(t,e)}#a(){let t=Object.create(null);return Object.keys(this.#t).concat(Object.keys(this.#e)).forEach(e=>{t[e]||=this.#i(e)}),this.#e=this.#t=void 0,t}#i(t){let e=[],s=t===E;return[this.#e,this.#t].forEach(a=>{let n=a[t]?Object.keys(a[t]).map(i=>[i,a[t][i]]):[];n.length!==0?(s||=!0,e.push(...n)):t!==E&&e.push(...Object.keys(a[E]).map(i=>[i,a[E][i]]))}),s?Ys(e):null}};var Yt=class{name="SmartRouter";#e=[];#t=[];constructor(t){this.#e=t.routers}add(t,e,s){if(!this.#t)throw new Error(St);this.#t.push([t,e,s])}match(t,e){if(!this.#t)throw new Error("Fatal error");let s=this.#e,a=this.#t,n=s.length,i=0,o;for(;i<n;i++){let c=s[i];try{for(let r=0,d=a.length;r<d;r++)c.add(...a[r]);o=c.match(t,e)}catch(r){if(r instanceof Et)continue;throw r}this.match=c.match.bind(c),this.#e=[c],this.#t=void 0;break}if(i===n)throw new Error("Fatal error");return this.name=`SmartRouter + ${this.activeRouter.name}`,o}get activeRouter(){if(this.#t||this.#e.length!==1)throw new Error("No active router has been determined yet.");return this.#e[0]}};var pt=Object.create(null),Qt=class{#e;#t;#a;#i=0;#n=pt;constructor(t,e,s){if(this.#t=s||Object.create(null),this.#e=[],t&&e){let a=Object.create(null);a[t]={handler:e,possibleKeys:[],score:0},this.#e=[a]}this.#a=[]}insert(t,e,s){this.#i=++this.#i;let a=this,n=$e(e),i=[];for(let r=0,d=n.length;r<d;r++){let m=n[r];if(Object.keys(a.#t).includes(m)){a=a.#t[m];let p=Ut(m);p&&i.push(p[1]);continue}a.#t[m]=new Qt;let u=Ut(m);u&&(a.#a.push(u),i.push(u[1])),a=a.#t[m]}let o=Object.create(null),c={handler:s,possibleKeys:i.filter((r,d,m)=>m.indexOf(r)===d),score:this.#i};return o[t]=c,a.#e.push(o),a}#s(t,e,s,a){let n=[];for(let i=0,o=t.#e.length;i<o;i++){let c=t.#e[i],r=c[e]||c[E],d={};if(r!==void 0&&(r.params=Object.create(null),n.push(r),s!==pt||a&&a!==pt))for(let m=0,u=r.possibleKeys.length;m<u;m++){let p=r.possibleKeys[m],h=d[r.score];r.params[p]=a?.[p]&&!h?a[p]:s[p]??a?.[p],d[r.score]=!0}}return n}search(t,e){let s=[];this.#n=pt;let n=[this],i=Mt(e);for(let o=0,c=i.length;o<c;o++){let r=i[o],d=o===c-1,m=[];for(let u=0,p=n.length;u<p;u++){let h=n[u],b=h.#t[r];b&&(b.#n=h.#n,d?(b.#t["*"]&&s.push(...this.#s(b.#t["*"],t,h.#n)),s.push(...this.#s(b,t,h.#n))):m.push(b));for(let w=0,v=h.#a.length;w<v;w++){let S=h.#a[w],R=h.#n===pt?{}:{...h.#n};if(S==="*"){let Nt=h.#t["*"];Nt&&(s.push(...this.#s(Nt,t,h.#n)),m.push(Nt));continue}if(r==="")continue;let[I,V,Y]=S,F=h.#t[I],$t=i.slice(o).join("/");if(Y instanceof RegExp&&Y.test($t)){R[V]=$t,s.push(...this.#s(F,t,h.#n,R));continue}(Y===!0||Y.test(r))&&(R[V]=r,d?(s.push(...this.#s(F,t,R,h.#n)),F.#t["*"]&&s.push(...this.#s(F.#t["*"],t,R,h.#n))):(F.#n=R,m.push(F)))}}n=m}return s.length>1&&s.sort((o,c)=>o.score-c.score),[s.map(({handler:o,params:c})=>[o,c])]}};var Zt=class{name="TrieRouter";#e;constructor(){this.#e=new Qt}add(t,e,s){let a=xt(e);if(a){for(let n=0,i=a.length;n<i;n++)this.#e.insert(t,a[n],s);return}this.#e.insert(t,e,s)}match(t,e){return this.#e.search(t,e)}};var O=class extends Xt{constructor(t={}){super(t),this.router=t.router??new Yt({routers:[new Vt,new Zt]})}};var l=(t,...e)=>{let s=[""];for(let a=0,n=t.length-1;a<n;a++){s[0]+=t[a];let i=Array.isArray(e[a])?e[a].flat(1/0):[e[a]];for(let o=0,c=i.length;o<c;o++){let r=i[o];if(typeof r=="string")kt(r,s);else if(typeof r=="number")s[0]+=r;else{if(typeof r=="boolean"||r===null||r===void 0)continue;if(typeof r=="object"&&r.isEscaped)if(r.callbacks)s.unshift("",r);else{let d=r.toString();d instanceof Promise?s.unshift("",d):s[0]+=d}else r instanceof Promise?s.unshift("",r):kt(r.toString(),s)}}}return s[0]+=t.at(-1),s.length===1?"callbacks"in s?T(Se(T(s[0],s.callbacks))):T(s[0]):je(s,s.callbacks)};var C=typeof process>"u"?{}:process.env,te=typeof process>"u"||C.DEMO==="1",$={demo:te,port:Number(C.PORT??3e3),baseUrl:C.PUBLIC_BASE_URL??(te?"https://\uFF08\u3053\u306E\u30B7\u30B9\u30C6\u30E0\u306EURL\uFF09":`http://localhost:${C.PORT??3e3}`),authMode:C.AUTH_MODE??"dev",fromAddress:C.MAIL_FROM??"social-design-center@eikei.ac.jp",sendMode:te?"export":C.SEND_MODE??"export",graph:{tenantId:C.GRAPH_TENANT_ID,clientId:C.GRAPH_CLIENT_ID,clientSecret:C.GRAPH_CLIENT_SECRET},sendPerMinute:Number(C.SEND_PER_MINUTE??10),sendPerDay:Number(C.SEND_PER_DAY??1500),sendTickSeconds:Number(C.SEND_TICK_SECONDS??60),sendFile:{name:"\u914D\u4FE1.xlsx",table:"\u9001\u4FE1",flow:"SDC\u914D\u4FE1\u306E\u9001\u4FE1"},footer:{sender:"\u53E1\u5553\u5927\u5B66",contact:"social-design-center@eikei.ac.jp",signature:["\u5E83\u5CF6\u770C\u516C\u7ACB\u5927\u5B66\u6CD5\u4EBA\u3000\u53E1\u5553\u5927\u5B66","\u4FA1\u5024\u5275\u9020\u30D6\u30E9\u30F3\u30C9\u63A8\u9032\u8AB2\uFF08\u793E\u4F1A\u9023\u643A\u4FC2\uFF09","\u3012730-0016\u3000\u5E83\u5CF6\u5E02\u4E2D\u533A\u5E5F\u753A1-5","TEL\uFF1A082-225-6312","Mail\uFF1Asocial-design-center@eikei.ac.jp"]}};var Ce=typeof process>"u"||process.env.DEMO==="1",Qs=Ce?"x-cookie":"cookie",Zs=Ce?"x-set-cookie":"Set-Cookie";function qt(t,e){return new RegExp(`(?:^|;\\s*)${e}=([^;]+)`).exec(t.req.header(Qs)??"")?.[1]}function st(t,e){t.header(Zs,e,{append:!0})}var ee=new TextEncoder,ta=typeof process<"u"&&process.env.SESSION_SECRET||($.demo?"demo-only":null)||Array.from(crypto.getRandomValues(new Uint8Array(32)),t=>t.toString(16).padStart(2,"0")).join(""),Pe=crypto.subtle.importKey("raw",ee.encode(ta),{name:"HMAC",hash:"SHA-256"},!1,["sign","verify"]),ea=t=>btoa(String.fromCharCode(...new Uint8Array(t))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""),sa=t=>Uint8Array.from(atob(t.replace(/-/g,"+").replace(/_/g,"/")),e=>e.charCodeAt(0));async function aa(t){return`${t}.${ea(await crypto.subtle.sign("HMAC",await Pe,ee.encode(String(t))))}`}async function na(t){let e=t?.lastIndexOf(".")??-1;if(e<0)return null;let s=t.slice(0,e);try{return await crypto.subtle.verify("HMAC",await Pe,sa(t.slice(e+1)),ee.encode(s))?s:null}catch{return null}}async function se(t,e){let s=await na(qt(t,"sid")),a=s&&await _("select * from staff_users where id = $1 and active",[s]);if(!a)return t.redirect("/login");t.set("user",a),await e()}async function ae(t,e){if(t.get("user")?.role!=="admin")return t.text("\u3053\u306E\u753B\u9762\u306F\u7BA1\u7406\u8005\u3060\u3051\u304C\u4F7F\u3048\u307E\u3059\u3002",403);await e()}function Ie(t){t.get("/login",async e=>{if($.authMode!=="dev")return e.text("M365 \u3067\u306E\u30ED\u30B0\u30A4\u30F3\u306F\u672A\u8A2D\u5B9A\u3067\u3059\u3002",501);let s=await f("select id, name, role from staff_users where active order by id");return e.html(l`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン | SDC配信</title>
<style>${T(ia)}</style></head><body>
<div class="wrap">
<div class="box login"><h1>SDC配信 にログイン</h1>
<p class="muted">確認用の画面です。本番では大学の M365 アカウントでログインします。${$.demo?l`データはすべて架空で、メールは送信されません。`:""}</p>
${s.map(a=>l`<form method="post" action="/login"><input type="hidden" name="id" value="${a.id}"><button>${a.name}（${a.role==="admin"?"\u7BA1\u7406\u8005":"\u62C5\u5F53\u8005"}）</button></form>`)}
${$.demo?l`<p class="muted small">事務スタッフAとBは、どちらも「担当者」でできることは同じです。2人分あるのは、別々の人が操作したときの見え方（操作の記録など）を試すためです。</p>`:""}
</div>

<div class="box guide">
<h2>このシステムでできること</h2>
<p>叡啓大学 社会連携係が、名刺交換した方やイベント参加者に、案内メールを送るためのシステムです。送信元は social-design-center@eikei.ac.jp です。</p>
<dl>
  <dt>連絡先</dt><dd>名刺やイベント申込の情報を管理します。項目は事務局の Excel と同じ（氏名・企業・団体名・部署・役職・メールアドレス・団体所在地・企業分類1・企業分類2・興味分類）です。役職は自由に書け、経営層・部長級・課長級などの区分が自動で付きます。イベント参加の記録と「どこで知り合ったか」も残せます。人はメールアドレスで見分けます。事務局の Excel からまとめて取り込めます。シート「顧客」は連絡先の一覧、ほかのシートはシート名のイベントの参加者一覧として読みます（取り込む前に確認画面が出ます）。</dd>
  <dt>配信先リスト</dt><dd>「新規事業に関心のある大企業・中堅企業の方」「DXセミナーの参加者」のように、興味分類・役職区分・企業分類・団体所在地・イベント参加から条件を選んで送り先を決めます。人数はその場で表示されます。</dd>
  <dt>配信</dt><dd>件名と本文を書き、送り先ごとの文面が入った「送信ファイル」（Excel）を書き出します。「{{氏名}}」と書くと、一人ひとりの名前に置き換わります。実際に送るのは Power Automate で、共有フォルダー（Teams など）に置いた送信ファイルを1通ずつ、間をあけて共有メールボックスから送ります。</dd>
  <dt>イベント・興味</dt><dd>イベントを登録します。興味分類の一覧も見られます（興味分類は連絡先にカンマ区切りで書くと自動で増えます）。</dd>
</dl>

<h2>配信の流れ</h2>
<ol>
  <li><b>配信先リストを作る</b>：条件を選び、人数を確かめて保存します。</li>
  <li><b>本文を書く</b>：「配信」から新しい配信を作り、送り先にリストを選びます。</li>
  <li><b>見本を確認する</b>：配信の画面に、実際に届くメールと同じ形の見本が出ます。自分あてに送って確かめることもできます（任意）。</li>
  <li><b>人数を入力して送信ファイルを書き出す</b>：確認のため、送る人数を入力します。書き出した人には送ったものとして記録されます。</li>
  <li><b>Power Automate で送る</b>：共有フォルダーの「配信.xlsx」を書き出したファイルで置き換え、フローを実行します。1通ずつ間をあけて送られます。</li>
  <li><b>途中で止まったときだけ</b>：共有フォルダーのファイルを取り込むと、送れなかった人だけのファイルを書き出せます。</li>
</ol>

<h2>誤送信を防ぐ仕組み</h2>
<ul>
  <li>書き出すときに、見本を確認したことのチェックと人数の入力が必要です。人数が実際と合わないと書き出せません。</li>
  <li>配信停止した人、宛先不明の人、メールを送ってよい根拠がない人は、自動で送り先から外れます。</li>
  <li>メールの末尾には、送信者の情報と配信停止の案内（このメールに「配信停止」と返信してもらう）が自動で付きます。返信が届いたら、連絡先の画面で配信を止めます。</li>
  <li>同じ配信で同じアドレスに二度送ることはありません。一度書き出した配信は変更できず、同じ人のファイルを二度は書き出しません。</li>
</ul>

<h2>担当者と管理者の違い</h2>
<table>
  <thead><tr><th>できること</th><th>担当者</th><th>管理者</th></tr></thead>
  <tbody>
    <tr><td>連絡先の追加・編集、配信停止</td><td>○</td><td>○</td></tr>
    <tr><td>配信先リストの作成</td><td>○</td><td>○</td></tr>
    <tr><td>配信の作成・送信ファイルの書き出し</td><td>○</td><td>○</td></tr>
    <tr><td>イベント・興味の追加</td><td>○</td><td>○</td></tr>
    <tr><td>利用者の追加、権限の変更、ログインの停止</td><td>—</td><td>○</td></tr>
    <tr><td>配信停止の解除（本人から再開の希望があったとき）</td><td>—</td><td>○</td></tr>
    <tr><td>操作の記録（誰がいつ何をしたか）を見る</td><td>—</td><td>○</td></tr>
  </tbody>
</table>
<p class="muted small">管理者の画面は、ログイン後の上部メニュー「管理」から開きます。</p>
</div>
</div></body></html>`)}),t.post("/login",async e=>{if($.authMode!=="dev")return e.text("Not available",404);let{id:s}=await e.req.parseBody(),a=await _("select id from staff_users where id = $1 and active",[s]);return a?(await f("update staff_users set last_login_at = now() where id = $1",[a.id]),st(e,`sid=${await aa(a.id)}; Path=/; HttpOnly; SameSite=Lax`),e.redirect("/contacts")):e.redirect("/login")}),t.post("/logout",e=>(st(e,"sid=; Path=/; Max-Age=0"),e.redirect("/login")))}var ia=`
body{font:16px/1.75 "BIZ UDPGothic","Hiragino Sans","Yu Gothic","Meiryo",sans-serif;background:#f4f6f8;color:#1b2530;margin:0}
.wrap{max-width:1040px;margin:0 auto;padding:40px max(16px,env(safe-area-inset-left,0px)) 64px max(16px,env(safe-area-inset-right,0px));
  display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:24px;align-items:start}
@media (max-width:760px){.wrap{grid-template-columns:1fr}}
.box{background:#fff;border:1px solid #d8dfe6;border-radius:12px;padding:24px 28px;display:grid;gap:12px;min-width:0}
@media (min-width:761px){.login{position:sticky;top:24px}}
h1{font-size:20px;margin:0} h2{font-size:17px;margin:12px 0 0;color:#1d6b73} h2:first-child{margin-top:0}
p{margin:0}.muted{color:#5e6b78;font-size:14px}.small{font-size:13px}
button{font:inherit;font-weight:700;padding:10px;border-radius:6px;border:1px solid #1d6b73;background:#fff;color:#1d6b73;cursor:pointer;width:100%}
button:hover{background:#1d6b73;color:#fff}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 16px} dt{font-weight:700;white-space:nowrap} dd{margin:0}
@media (max-width:520px){dl{grid-template-columns:1fr} dd{margin-bottom:6px}}
ol,ul{margin:0;padding-left:1.4em;display:grid;gap:4px}
table{border-collapse:collapse;width:100%;font-size:15px} th,td{padding:7px 10px;border-bottom:1px solid #d8dfe6;text-align:left}
th{font-size:13px;color:#5e6b78} td:nth-child(n+2),th:nth-child(n+2){text-align:center;width:4.5em}`;async function y(t,e,s,a,n){await f("insert into audit_log (actor_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5)",[t.get("user")?.id??null,e,s,a,n?JSON.stringify(n):null])}var ra=[["/contacts","\u9023\u7D61\u5148"],["/segments","\u914D\u4FE1\u5148\u30EA\u30B9\u30C8"],["/campaigns","\u914D\u4FE1"],["/masters","\u30A4\u30D9\u30F3\u30C8\u30FB\u8208\u5473"],...$.sendMode==="outbox"?[["/outbox","\u9001\u4FE1\u7BB1\uFF08\u78BA\u8A8D\u7528\uFF09"]]:[]];function x(t,{title:e,active:s,body:a,flash:n}){let i=t.get("user");return t.html(l`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e} | SDC配信</title>
<style>${T(oa)}</style>
</head>
<body>
${$.demo?l`<div class="demo">確認用の画面です。データはすべて架空で、メールは送信されません。操作はこのブラウザの中だけに保存されます。
  <button type="button" class="link" id="demo-reset">最初の状態に戻す</button></div>`:""}
<header class="top">
  <div class="brand">SDC配信</div>
  <nav>${[...ra,...i?.role==="admin"?[["/admin","\u7BA1\u7406"]]:[]].map(([o,c])=>l`<a href="${o}" class="${s===o?"on":""}">${c}</a>`)}</nav>
  <div class="who">${i?l`${i.name}さん（${i.role==="admin"?"\u7BA1\u7406\u8005":"\u62C5\u5F53\u8005"}） <form method="post" action="/logout" class="inline"><button class="link">ログアウト</button></form>`:""}</div>
</header>
<main>
  ${n?l`<div class="flash ${n.kind??"ok"}">${n.text}</div>`:""}
  ${a}
</main>
</body>
</html>`)}function g(t,e,s="ok"){st(t,`flash=${encodeURIComponent(JSON.stringify({text:e,kind:s}))}; Path=/; HttpOnly; SameSite=Lax`)}function k(t){let e=qt(t,"flash");if(!e)return null;st(t,"flash=; Path=/; Max-Age=0");try{return JSON.parse(decodeURIComponent(e))}catch{return null}}var q=t=>t?new Date(t).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"",H=t=>t?new Date(t).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"}):"",oa=`
:root{--bg:#f4f6f8;--surface:#fff;--ink:#1b2530;--muted:#5e6b78;--line:#d8dfe6;--accent:#1d6b73;--accent-ink:#fff;--accent-soft:#e0eef0;
--ok:#2f7d4f;--ok-soft:#e3f2e8;--warn:#94660a;--warn-soft:#faf0d6;--bad:#a83a32;--bad-soft:#f8e3e1}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "BIZ UDPGothic","Hiragino Sans","Yu Gothic","Meiryo",sans-serif}
.top{display:flex;align-items:center;gap:24px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--line);flex-wrap:wrap}
.brand{font-weight:700;color:var(--accent);padding:14px 0}
.top nav{display:flex;gap:4px;flex-wrap:wrap}
.top nav a{padding:14px 14px;color:var(--ink);text-decoration:none;border-bottom:3px solid transparent}
.top nav a.on{border-bottom-color:var(--accent);font-weight:700}
.top nav a:hover{background:var(--bg)}
.who{margin-left:auto;font-size:14px;color:var(--muted)}
main{max-width:1100px;margin:0 auto;padding:28px 24px 80px;display:grid;gap:22px}
h1{font-size:24px;margin:0}
h2{font-size:18px;margin:0 0 8px}
.lead{color:var(--muted);margin:-12px 0 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:20px 22px;display:grid;gap:14px;min-width:0}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.spread{justify-content:space-between}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.grid2.split{grid-template-columns:minmax(0,3fr) minmax(260px,2fr);align-items:start}
.grid2.split.wide{grid-template-columns:minmax(0,2fr) minmax(240px,1fr)}
@media (max-width:760px){.grid2.split,.grid2.split.wide{grid-template-columns:minmax(0,1fr)}}
label{display:grid;gap:4px;font-weight:700;font-size:14px}
label .hint{font-weight:400;color:var(--muted);font-size:13px}
input[type=text],input[type=email],input[type=number],input[type=date],input[type=datetime-local],input[type=search],select,textarea{
 font:inherit;font-weight:400;padding:9px 11px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);width:100%}
textarea{min-height:260px;line-height:1.7}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
button,.btn{font:inherit;font-weight:700;padding:9px 18px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-ink);cursor:pointer;text-decoration:none;display:inline-block}
button.sub,.btn.sub{background:var(--surface);color:var(--accent)}
button.danger{background:var(--bad);border-color:var(--bad)}
button.link{border:0;background:none;color:var(--muted);padding:0;font-weight:400;text-decoration:underline}
button:disabled{opacity:.45;cursor:not-allowed}
form.inline{display:inline}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:13px;color:var(--muted);font-weight:700}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr:hover td{background:#fafbfc}
.scroll{overflow-x:auto}
a{color:var(--accent)}
.muted{color:var(--muted)}
.small{font-size:13px}
.pill{display:inline-block;font-size:12.5px;font-weight:700;padding:1px 10px;border-radius:99px;background:var(--bg);color:var(--muted);white-space:nowrap}
.pill.ok{background:var(--ok-soft);color:var(--ok)} .pill.warn{background:var(--warn-soft);color:var(--warn)} .pill.bad{background:var(--bad-soft);color:var(--bad)} .pill.info{background:var(--accent-soft);color:var(--accent)}
.flash{padding:12px 16px;border-radius:8px;background:var(--ok-soft);color:var(--ok);font-weight:700}
.flash.bad{background:var(--bad-soft);color:var(--bad)} .flash.warn{background:var(--warn-soft);color:var(--warn)}
.big{font-size:40px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
label.check{display:flex;gap:8px;align-items:center;font-weight:400}
.checks{display:flex;flex-wrap:wrap;gap:6px 18px}
.checks label{display:flex;gap:6px;align-items:center;font-weight:400;font-size:15px}
fieldset{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:0;display:grid;gap:10px;min-width:0}
legend{font-weight:700;padding:0 6px}
.steps{display:flex;gap:8px;flex-wrap:wrap;list-style:none;padding:0;margin:0}
.steps li{padding:6px 14px;border-radius:99px;background:var(--bg);color:var(--muted);font-size:14px}
.steps li.done{background:var(--ok-soft);color:var(--ok)} .steps li.now{background:var(--accent);color:var(--accent-ink);font-weight:700}
div.mail{background:#fff;padding:16px 20px;border-radius:8px;border:1px solid var(--line);font:15px/1.6 Arial,"Hiragino Sans","Yu Gothic",sans-serif;overflow-wrap:anywhere}
details.card summary{cursor:pointer}
pre.mail{white-space:pre-wrap;background:var(--bg);padding:16px;border-radius:8px;font:15px/1.7 inherit;margin:0;border:1px solid var(--line)}
.pager{display:flex;gap:10px;align-items:center}
.demo{background:var(--warn-soft);color:var(--warn);font-size:14px;padding:8px 24px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.demo button.link{color:var(--warn)}
`;var la=[["\u672A\u8A18\u5165",/^(なし|無し|-|－|ー|特になし)?$/],["\u5B66\u751F",/学生|院生|履修生|単科生|研究生|聴講生/],["\u6559\u54E1\u30FB\u7814\u7A76\u8005",/教授|講師|助教|研究員|教員|教諭|ポスドク|フェロー/],["\u7D4C\u55B6\u5C64",/代表|社長|取締役|役員|会長|理事|頭取|学長|CEO|COO|CFO|CTO|オーナー|経営者/i],["\u4E00\u822C\u30FB\u62C5\u5F53",/アシスタント|見習|補助/],["\u90E8\u9577\u7D1A",/部長|局長|支店長|支社長|所長|室長|センター長|工場長|次長|ゼネラルマネージャ|ディレクター|本部長/],["\u8AB2\u9577\u7D1A",/課長|マネージャ|リーダー|主幹|グループ長|チーム長|班長/],["\u4E00\u822C\u30FB\u62C5\u5F53",/主任|主査|係長|担当|社員|一般|職員|スタッフ|記者|推進役|コンサルタント|エンジニア|デザイナー|研究者|専門職/]],At=["\u7D4C\u55B6\u5C64","\u90E8\u9577\u7D1A","\u8AB2\u9577\u7D1A","\u4E00\u822C\u30FB\u62C5\u5F53","\u6559\u54E1\u30FB\u7814\u7A76\u8005","\u5B66\u751F","\u305D\u306E\u4ED6","\u672A\u8A18\u5165"];function K(t){let e=String(t??"").normalize("NFKC").trim();for(let[s,a]of la)if(a.test(e))return s;return"\u305D\u306E\u4ED6"}async function Tt(t){let e=await t("select id, job_title, job_level from contacts");for(let s of e){let a=K(s.job_title);a!==s.job_level&&await t("update contacts set job_level = $2 where id = $1",[s.id,a])}}var D=["\u5927\u4F01\u696D","\u4E2D\u5805\u4F01\u696D","\u4E2D\u5C0F\u4F01\u696D","\u5C0F\u898F\u6A21\u4E8B\u696D\u8005","\u6559\u80B2\u6A5F\u95A2","\u305D\u306E\u4ED6"],z={applied:"\u7533\u8FBC",attended:"\u53C2\u52A0",absent:"\u6B20\u5E2D",cancelled:"\u30AD\u30E3\u30F3\u30BB\u30EB"},Ne="substring(o.location from '^(\u6771\u4EAC\u90FD|\u5317\u6D77\u9053|(?:\u4EAC\u90FD|\u5927\u962A)\u5E9C|.{2,3}\u770C)')",ne=t=>[].concat(t??[]).map(Number).filter(Number.isInteger),ut=(t,e)=>[].concat(t??[]).map(String).filter(s=>!e||e.includes(s));function zt(t){return[...new Set(String(t??"").normalize("NFKC").split(/[,、]/).map(e=>e.trim()).filter(Boolean))]}function Ct(t){let e=a=>t[a]??t[`${a}[]`],s={events:ne(e("events")),event_status:ut(e("event_status"),Object.keys(z)),interests:ne(e("interests")),job_levels:ut(e("job_levels"),At),size_classes:ut(e("size_classes"),D),industries:ut(e("industries")),prefectures:ut(e("prefectures")),exclude_events:ne(e("exclude_events"))};return s.events.length&&!s.event_status.length&&(s.event_status=["attended"]),s}function at(t={}){let e=[],s=[],a=i=>(s.push(i),`$${s.length}`),n=i=>`exists (select 1 from organizations o where o.id = c.organization_id and ${i})`;return t.events?.length&&e.push(`exists (select 1 from event_participations ep where ep.contact_id = c.id
      and ep.event_id = any(${a(t.events)}::bigint[]) and ep.status = any(${a(t.event_status??["attended"])}::text[]))`),t.interests?.length&&e.push(`exists (select 1 from contact_interests ci where ci.contact_id = c.id and ci.interest_id = any(${a(t.interests)}::bigint[]))`),t.job_levels?.length&&e.push(`c.job_level = any(${a(t.job_levels)}::text[])`),t.size_classes?.length&&e.push(n(`o.size_class = any(${a(t.size_classes)}::text[])`)),t.industries?.length&&e.push(n(`o.industry = any(${a(t.industries)}::text[])`)),t.prefectures?.length&&e.push(n(`${Ne} = any(${a(t.prefectures)}::text[])`)),t.exclude_events?.length&&e.push(`not exists (select 1 from event_participations ep where ep.contact_id = c.id
      and ep.event_id = any(${a(t.exclude_events)}::bigint[]) and ep.status in ('applied', 'attended'))`),{where:e.length?e.join(" and "):"true",params:s}}async function N(t){let{where:e,params:s}=at(t),[a]=await f(`select count(*)::int as n from sendable_contacts c where ${e}`,s);return a.n}async function nt(t,{limit:e=1e6,offset:s=0}={}){let{where:a,params:n}=at(t);return f(`select c.id, c.email, c.full_name, c.department, c.job_title, o.name as org_name
    from sendable_contacts c left join organizations o on o.id = c.organization_id
    where ${a} order by o.name nulls last, c.full_name, c.id limit ${Number(e)} offset ${Number(s)}`,n)}async function De(){let[t,e]=await Promise.all([f("select distinct industry v from organizations where industry is not null order by 1"),f(`select distinct ${Ne} v from organizations o where o.location is not null order by 1`)]);return{industries:t.map(s=>s.v),prefectures:e.map(s=>s.v).filter(Boolean)}}async function W(t={}){let e=[];if(t.events?.length){let s=await f("select name from events where id = any($1::bigint[]) order by held_on",[t.events]);e.push(`\u30A4\u30D9\u30F3\u30C8\u300C${s.map(a=>a.name).join("\u300D\u300C")}\u300D\u306B${(t.event_status??[]).map(a=>z[a]).join("\u30FB")}`)}if(t.interests?.length){let s=await f("select name from interests where id = any($1::bigint[]) order by sort_order, id",[t.interests]);e.push(`\u8208\u5473\u5206\u985E\uFF1A${s.map(a=>a.name).join("\u30FB")}`)}if(t.job_levels?.length&&e.push(`\u5F79\u8077\u533A\u5206\uFF1A${t.job_levels.join("\u30FB")}`),t.size_classes?.length&&e.push(`\u4F01\u696D\u5206\u985E1\uFF1A${t.size_classes.join("\u30FB")}`),t.industries?.length&&e.push(`\u4F01\u696D\u5206\u985E2\uFF1A${t.industries.join("\u30FB")}`),t.prefectures?.length&&e.push(`\u56E3\u4F53\u6240\u5728\u5730\uFF1A${t.prefectures.join("\u30FB")}`),t.exclude_events?.length){let s=await f("select name from events where id = any($1::bigint[])",[t.exclude_events]);e.push(`\u9664\u5916\uFF1A\u300C${s.map(a=>a.name).join("\u300D\u300C")}\u300D\u306E\u7533\u8FBC\u30FB\u53C2\u52A0\u8005`)}return e.length?e.join(" \uFF0F "):"\u9001\u4FE1\u3067\u304D\u308B\u9023\u7D61\u5148\u3059\u3079\u3066"}var G=new O,ie=50,da=["\u540D\u523A\u4EA4\u63DB","\u30A4\u30D9\u30F3\u30C8\u7533\u8FBC","\u554F\u3044\u5408\u308F\u305B","\u624B\u5165\u529B","\u305D\u306E\u4ED6"],Le={business_card:"\u540D\u523A\u306A\u3069\u66F8\u9762\u3067\u53D7\u3051\u53D6\u3063\u305F",opt_in:"\u30D5\u30A9\u30FC\u30E0\u7B49\u3067\u6848\u5185\u306E\u53D7\u4FE1\u306B\u540C\u610F",unknown:"\u4E0D\u660E"},Me=`case
  when c.email is null then 'no_email'
  when exists (select 1 from suppressions s where s.email = c.email) then 'suppressed'
  when not exists (select 1 from contact_sources cs where cs.contact_id = c.id and cs.consent_basis in ('business_card','opt_in')) then 'no_consent'
  else 'ok' end`,Ue={ok:l`<span class="pill ok">送信できる</span>`,suppressed:l`<span class="pill bad">配信停止</span>`,no_consent:l`<span class="pill warn">同意の根拠なし</span>`,no_email:l`<span class="pill">メールなし</span>`};G.get("/",async t=>{let e=(t.req.query("q")??"").trim(),s=t.req.query("size")??"",a=Math.max(1,Number(t.req.query("page")??1)),n=[],i=["c.merged_into_id is null","c.archived_at is null"];e&&(n.push(`%${e}%`),i.push("(c.full_name ilike $1 or c.email::text ilike $1 or o.name ilike $1 or coalesce(c.department,'') ilike $1)")),D.includes(s)&&(n.push(s),i.push(`o.size_class = $${n.length}`));let o=`from contacts c left join organizations o on o.id = c.organization_id where ${i.join(" and ")}`,[{n:c}]=await f(`select count(*)::int n ${o}`,n),r=await f(`select c.id, c.full_name, c.email, c.department, c.job_title, c.job_level, o.name org_name, o.size_class, o.industry, ${Me} status
    ${o} order by o.name nulls last, c.full_name, c.id limit ${ie} offset ${(a-1)*ie}`,n),d=Math.max(1,Math.ceil(c/ie)),m=u=>`?q=${encodeURIComponent(e)}&size=${encodeURIComponent(s)}&page=${u}`;return x(t,{title:"\u9023\u7D61\u5148",active:"/contacts",flash:k(t),body:l`
<div class="row spread"><h1>連絡先</h1><div class="row"><a class="btn sub" href="/contacts/import">Excel から取り込む</a><a class="btn" href="/contacts/new">連絡先を追加</a></div></div>
<form class="card" method="get">
  <div class="row">
    <label style="flex:1 1 280px">氏名・企業・団体名・部署・メールで探す<input type="search" id="q" name="q" value="${e}" placeholder="例：サンプル、example.jp"></label>
    <label style="flex:0 1 200px">企業分類1<select id="size" name="size"><option value="">すべて</option>${D.map(u=>l`<option ${u===s?"selected":""}>${u}</option>`)}</select></label>
    <button style="align-self:end">検索</button>
  </div>
</form>
<div class="card">
  <div class="row spread"><span class="muted">${c}件</span>
    <div class="pager">${a>1?l`<a href="${m(a-1)}">前へ</a>`:""}<span class="small muted">${a} / ${d}ページ</span>${a<d?l`<a href="${m(a+1)}">次へ</a>`:""}</div></div>
  <div class="scroll"><table>
    <thead><tr><th>氏名</th><th>企業・団体名／部署・役職</th><th>企業分類</th><th>メールアドレス</th><th>状態</th></tr></thead>
    <tbody>${r.map(u=>l`<tr>
      <td><a href="/contacts/${u.id}">${u.full_name}</a></td>
      <td>${u.org_name??""}<div class="small muted">${[u.department,u.job_title].filter(Boolean).join("\u3000")}${u.job_level&&u.job_level!=="\u672A\u8A18\u5165"?l` <span class="pill">${u.job_level}</span>`:""}</div></td>
      <td class="small">${u.size_class??""}<div class="muted">${u.industry??""}</div></td>
      <td class="small">${u.email??""}</td>
      <td>${Ue[u.status]}</td></tr>`)}</tbody>
  </table></div>
  ${r.length?"":l`<p class="muted">該当する連絡先はありません。</p>`}
</div>`})});function Fe(t={},e={}){let{orgs:s=[],industries:a=[],interestNames:n=[],isNew:i}=e;return l`
<div class="grid2">
  <label>氏名<input type="text" id="full_name" name="full_name" value="${t.full_name??""}" required></label>
  <label>企業・団体名<span class="hint">一覧にない場合は新しい名前を入力</span>
    <input type="text" id="org_name" name="org_name" value="${t.org_name??""}" list="orgs"></label>
  <datalist id="orgs">${s.map(o=>l`<option value="${o.name}">`)}</datalist>
  <label>部署<input type="text" id="department" name="department" value="${t.department??""}"></label>
  <label>役職<span class="hint">名刺どおりに自由に書けます。${t.job_level?`\u81EA\u52D5\u306E\u533A\u5206\uFF1A${t.job_level}`:"\u533A\u5206\uFF08\u7D4C\u55B6\u5C64\u30FB\u90E8\u9577\u7D1A\u30FB\u8AB2\u9577\u7D1A\u306A\u3069\uFF09\u306F\u81EA\u52D5\u3067\u4ED8\u304D\u307E\u3059"}</span>
    <input type="text" id="job_title" name="job_title" value="${t.job_title??""}"></label>
  <label>メールアドレス<span class="hint">この人を見分ける ID です。必須で、同じアドレスは二人登録できません</span><input type="email" id="email" name="email" value="${t.email??""}" required></label>
</div>
<fieldset><legend>企業・団体の情報</legend>
  <p class="small muted" style="margin:0">同じ企業・団体に所属する全員に反映されます。</p>
  <div class="grid2">
    <label>団体所在地<input type="text" id="location" name="location" value="${t.location??""}" placeholder="例：広島県広島市中区"></label>
    <label>企業分類1<select id="size_class" name="size_class"><option value="">未設定</option>${D.map(o=>l`<option ${o===t.size_class?"selected":""}>${o}</option>`)}</select></label>
    <label>企業分類2<input type="text" id="industry" name="industry" value="${t.industry??""}" list="industries" placeholder="例：自動車、電力、サービス"></label>
    <datalist id="industries">${a.map(o=>l`<option value="${o}">`)}</datalist>
  </div>
</fieldset>
<label>興味分類<span class="hint">カンマ区切りで複数書けます（例：新規事業,リベラルアーツ）。これまでの例：${n.join("\u3001")}</span>
  <input type="text" id="interests" name="interests" value="${t.interest_text??""}"></label>
<label>メモ<textarea id="notes" name="notes" style="min-height:90px">${t.notes??""}</textarea></label>
${i?l`
<fieldset><legend>どこで知り合ったか（必須）</legend>
  <div class="grid2">
    <label>経路<select id="source_kind" name="source_kind">${da.map(o=>l`<option>${o}</option>`)}</select></label>
    <label>詳細<span class="hint">例：交換した先生の名前、イベント名</span><input type="text" id="source_detail" name="source_detail"></label>
    <label>メールを送ってよい根拠<select id="consent_basis" name="consent_basis" required>
      <option value="">選んでください</option>${Object.entries(Le).map(([o,c])=>l`<option value="${o}">${c}</option>`)}</select></label>
    <label>日付<input type="date" id="acquired_on" name="acquired_on"></label>
  </div>
</fieldset>`:""}`}async function Be(){let[t,e,s]=await Promise.all([f("select name from organizations order by name"),f("select distinct industry v from organizations where industry is not null order by 1"),f("select name from interests where active order by sort_order, id")]);return{orgs:t,industries:e.map(a=>a.v),interestNames:s.map(a=>a.name)}}async function He(t,e,s,a="staff"){let n=zt(s),i=[];for(let o of n){let[c]=await t("select id from interests where name = $1",[o]),r=c?.id??(await t("insert into interests (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from interests)) returning id",[o]))[0].id;i.push(r),await t("insert into contact_interests (contact_id, interest_id, origin) values ($1, $2, $3) on conflict do nothing",[e,r,a])}await t("delete from contact_interests where contact_id = $1 and not (interest_id = any($2::bigint[]))",[e,i])}async function Ge(t,e){let s=(e.org_name??"").trim();if(!s)return null;let a=ft(s),[n]=await t("select id from organizations where normalized_name = $1 limit 1",[a]),i=n?.id??(await t("insert into organizations (name, normalized_name) values ($1, $2) returning id",[s,a]))[0].id;return await t("update organizations set location = $2, size_class = $3, industry = $4, updated_at = now() where id = $1",[i,j(e,"location"),j(e,"size_class"),j(e,"industry")]),i}function ft(t){return t.normalize("NFKC").replace(/株式会社|\(株\)|（株）|有限会社|\(有\)|一般社団法人|公益財団法人|学校法人/g,"").replace(/\s+/g,"").toLowerCase()}var j=(t,e)=>{let s=(t[e]??"").toString().trim();return s===""?null:s};G.get("/new",async t=>{let e=await Be();return x(t,{title:"\u9023\u7D61\u5148\u3092\u8FFD\u52A0",active:"/contacts",body:l`<h1>連絡先を追加</h1>
<form class="card" method="post" action="/contacts">${Fe({},{...e,isNew:!0})}
<div class="row"><button>追加する</button><a href="/contacts">やめる</a></div></form>`})});G.post("/",async t=>{let e=await t.req.parseBody();if(!j(e,"full_name")||!j(e,"email")||!j(e,"consent_basis"))return g(t,"\u6C0F\u540D\u30FB\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u30FB\u300C\u30E1\u30FC\u30EB\u3092\u9001\u3063\u3066\u3088\u3044\u6839\u62E0\u300D\u306F\u5FC5\u9808\u3067\u3059\u3002","bad"),t.redirect("/contacts/new");try{let s=await A(async a=>{let n=await Ge(a,e),[i]=await a(`insert into contacts (full_name, email, organization_id, department, job_title, job_level, notes)
        values ($1,$2,$3,$4,$5,$6,$7) returning id`,[j(e,"full_name"),j(e,"email"),n,j(e,"department"),j(e,"job_title"),K(e.job_title),j(e,"notes")]);return await He(a,i.id,e.interests),await a("insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on) values ($1,$2,$3,$4,$5)",[i.id,j(e,"source_kind")??"\u624B\u5165\u529B",j(e,"source_detail"),j(e,"consent_basis"),j(e,"acquired_on")]),i.id});return await y(t,"contact.create","contact",s),g(t,"\u9023\u7D61\u5148\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002"),t.redirect(`/contacts/${s}`)}catch(s){if(s.code==="23505"||/contacts_email_active_uq/.test(s.message)){let a=await _("select id from contacts where email = $1 and merged_into_id is null and archived_at is null",[j(e,"email")]);return g(t,"\u3053\u306E\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u3059\u3067\u306B\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u3059\u3002\u65E2\u5B58\u306E\u9023\u7D61\u5148\u3092\u958B\u304D\u307E\u3057\u305F\u3002","warn"),t.redirect(`/contacts/${a?.id??""}`)}throw s}});G.get("/:id{[0-9]+}",async t=>{let e=t.req.param("id"),s=await _(`select c.*, o.name org_name, o.location, o.size_class, o.industry, ${Me} status,
      (select string_agg(i.name, ',' order by i.sort_order, i.id) from contact_interests ci join interests i on i.id = ci.interest_id where ci.contact_id = c.id) interest_text
    from contacts c left join organizations o on o.id = c.organization_id where c.id = $1`,[e]);if(!s)return t.notFound();let[a,n,i,o,c,r]=await Promise.all([Be(),f("select ep.*, e.name, e.held_on from event_participations ep join events e on e.id = ep.event_id where ep.contact_id = $1 order by e.held_on desc",[e]),f("select id, name, held_on from events order by held_on desc"),f("select * from contact_sources where contact_id = $1 order by created_at",[e]),s.email?_("select * from suppressions where email = $1",[s.email]):null,f("select d.status, d.sent_at, cp.name, cp.id cid from deliveries d join campaigns cp on cp.id = d.campaign_id where d.contact_id = $1 order by d.queued_at desc limit 20",[e])]),d={unsubscribe:"\u672C\u4EBA\u304C\u914D\u4FE1\u505C\u6B62",hard_bounce:"\u5B9B\u5148\u4E0D\u660E\u3067\u5C4A\u304B\u306A\u3044",complaint:"\u8FF7\u60D1\u30E1\u30FC\u30EB\u5831\u544A",manual:"\u62C5\u5F53\u8005\u304C\u505C\u6B62"};return x(t,{title:s.full_name,active:"/contacts",flash:k(t),body:l`
<div class="row spread"><div><a href="/contacts" class="small">← 連絡先一覧</a><h1>${s.full_name} ${Ue[s.status]}</h1>
<div class="muted">${[s.org_name,s.department,s.job_title].filter(Boolean).join("\u3000")}</div></div></div>
${s.merged_into_id?l`<div class="flash warn">この連絡先は <a href="/contacts/${s.merged_into_id}">別の連絡先</a> に統合されています。</div>`:""}
${c?l`<div class="flash bad">このアドレスには送信しません（${d[c.reason]}、${H(c.created_at)}）。</div>`:""}

<form class="card" method="post" action="/contacts/${s.id}"><h2>基本情報</h2>${Fe(s,a)}
<div class="row"><button>保存する</button></div></form>

<div class="grid2">
<div class="card"><h2>どこで知り合ったか</h2>
  ${o.map(m=>l`<div><b>${m.source_kind}</b> ${m.source_detail??""} <span class="small muted">${H(m.acquired_on)}</span>
    <div class="small">送ってよい根拠：${Le[m.consent_basis]}</div></div>`)}
</div>
<div class="card"><h2>イベント参加</h2>
  ${n.length?l`<table><tbody>${n.map(m=>l`<tr><td>${m.name}<div class="small muted">${H(m.held_on)}</div></td><td>${z[m.status]}</td></tr>`)}</tbody></table>`:l`<p class="muted">記録はありません。</p>`}
  <form method="post" action="/contacts/${s.id}/participations" class="row">
    <select name="event_id" id="event_id" style="flex:1 1 200px">${i.map(m=>l`<option value="${m.id}">${m.name}（${H(m.held_on)}）</option>`)}</select>
    <select name="status" id="part_status" style="flex:0 1 120px">${Object.entries(z).map(([m,u])=>l`<option value="${m}" ${m==="attended"?"selected":""}>${u}</option>`)}</select>
    <button class="sub">追加</button></form>
</div>
</div>

<div class="grid2">
<div class="card"><h2>最近の配信</h2>
  ${r.length?l`<table><tbody>${r.map(m=>l`<tr><td><a href="/campaigns/${m.cid}">${m.name}</a></td><td class="small">${m.status==="sent"?"\u9001\u4FE1\u6E08\u307F":m.status==="skipped"?"\u9001\u3089\u306A\u304B\u3063\u305F":"\u307E\u3060\u9001\u3063\u3066\u3044\u306A\u3044"}</td></tr>`)}</tbody></table>`:l`<p class="muted">まだ送っていません。</p>`}
</div>
</div>

${s.email&&!c?l`<form class="card" method="post" action="/contacts/${s.id}/suppress"><h2>配信を止める</h2>
  <p class="muted" style="margin:0">本人から「もう送らないで」と連絡があったときに使います。このアドレスには今後一切送信しません。</p>
  <div><button class="danger">このアドレスへの配信を止める</button></div></form>`:""}`})});G.post("/:id{[0-9]+}",async t=>{let e=t.req.param("id"),s=await t.req.parseBody();if(!j(s,"full_name")||!j(s,"email"))return g(t,"\u6C0F\u540D\u3068\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u5FC5\u9808\u3067\u3059\u3002","bad"),t.redirect(`/contacts/${e}`);try{await A(async a=>{let n=await Ge(a,s);await a("update contacts set full_name=$2, email=$3, organization_id=$4, department=$5, job_title=$6, job_level=$7, notes=$8, updated_at=now() where id=$1",[e,j(s,"full_name"),j(s,"email"),n,j(s,"department"),j(s,"job_title"),K(s.job_title),j(s,"notes")]),await He(a,e,s.interests)})}catch(a){if(a.code==="23505"||/contacts_email_active_uq/.test(a.message))return g(t,"\u3053\u306E\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u5225\u306E\u9023\u7D61\u5148\u3067\u4F7F\u308F\u308C\u3066\u3044\u307E\u3059\u3002","bad"),t.redirect(`/contacts/${e}`);throw a}return await y(t,"contact.update","contact",Number(e)),g(t,"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002"),t.redirect(`/contacts/${e}`)});G.post("/:id{[0-9]+}/participations",async t=>{let e=t.req.param("id"),s=await t.req.parseBody();return await f(`insert into event_participations (contact_id, event_id, status) values ($1, $2, $3)
    on conflict (contact_id, event_id) do update set status = excluded.status`,[e,s.event_id,s.status]),g(t,"\u30A4\u30D9\u30F3\u30C8\u53C2\u52A0\u3092\u8A18\u9332\u3057\u307E\u3057\u305F\u3002"),t.redirect(`/contacts/${e}`)});G.post("/:id{[0-9]+}/suppress",async t=>{let e=t.req.param("id"),s=await _("select email from contacts where id = $1",[e]);return s?.email&&(await f("insert into suppressions (email, reason, note) values ($1, 'manual', $2) on conflict do nothing",[s.email,`${t.get("user").name}\u304C\u624B\u52D5\u3067\u505C\u6B62`]),await y(t,"contact.suppress","contact",Number(e))),g(t,"\u3053\u306E\u30A2\u30C9\u30EC\u30B9\u3078\u306E\u914D\u4FE1\u3092\u6B62\u3081\u307E\u3057\u305F\u3002"),t.redirect(`/contacts/${e}`)});var Je=G;var J=new O;J.get("/",async t=>{let e=await f("select * from segments order by updated_at desc"),s=await Promise.all(e.map(async a=>({...a,n:await N(a.definition),text:await W(a.definition)})));return x(t,{title:"\u914D\u4FE1\u5148\u30EA\u30B9\u30C8",active:"/segments",flash:k(t),body:l`
<div class="row spread"><h1>配信先リスト</h1><a class="btn" href="/segments/new">新しいリストを作る</a></div>
<p class="lead">「誰に送るか」の条件を保存したものです。人数は今の連絡先から毎回数え直します。</p>
<div class="card">
  ${s.length?l`<table><thead><tr><th>名前</th><th>条件</th><th class="num">人数</th></tr></thead><tbody>
  ${s.map(a=>l`<tr><td><a href="/segments/${a.id}">${a.name}</a></td><td class="small">${a.text}</td><td class="num">${a.n}人</td></tr>`)}
  </tbody></table>`:l`<p class="muted">まだリストはありません。「新しいリストを作る」から作れます。</p>`}
</div>`})});var Ke;async function We(t,e){let s=e?.definition??{},[a,n,i]=await Promise.all([f("select id, name, held_on from events order by held_on desc nulls last"),f("select id, name from interests where active order by sort_order, id"),De()]),o=(r,d)=>(r??[]).includes(d)?"checked":"",c=await N(s);return x(t,{title:e?e.name:"\u65B0\u3057\u3044\u914D\u4FE1\u5148\u30EA\u30B9\u30C8",active:"/segments",flash:k(t),body:l(Ke||(Ke=vt([`
<div><a href="/segments" class="small">\u2190 \u914D\u4FE1\u5148\u30EA\u30B9\u30C8</a><h1>`,`</h1></div>
<p class="lead">\u6761\u4EF6\u3092\u9078\u3076\u3068\u3001\u53F3\u4E0A\u306E\u4EBA\u6570\u304C\u3059\u3050\u5909\u308F\u308A\u307E\u3059\u3002\u4F55\u3082\u9078\u3070\u306A\u3051\u308C\u3070\u300C\u9001\u4FE1\u3067\u304D\u308B\u9023\u7D61\u5148\u3059\u3079\u3066\u300D\u3067\u3059\u3002</p>
<form method="post" action="`,`" id="segform" class="grid2 split wide">
<div class="card">
  <label>\u30EA\u30B9\u30C8\u306E\u540D\u524D<input type="text" id="name" name="name" value="`,`" required placeholder="\u4F8B\uFF1A\u65B0\u898F\u4E8B\u696D\u306B\u95A2\u5FC3\u306E\u3042\u308B\u5927\u4F01\u696D\u306E\u65B9"></label>

  <fieldset><legend>\u53C2\u52A0\u3057\u305F\u30A4\u30D9\u30F3\u30C8\uFF08\u3069\u308C\u304B\uFF09</legend>
    <div class="checks">`,`</div>
    <div class="checks small"><span class="muted">\u5BFE\u8C61\u306B\u3059\u308B\u72B6\u614B\uFF1A</span>`,`</div>
  </fieldset>

  <fieldset><legend>\u8208\u5473\u5206\u985E\uFF08\u3069\u308C\u304B\uFF09</legend>
    <div class="checks">`,`</div>
  </fieldset>

  <fieldset><legend>\u5F79\u8077\u533A\u5206\uFF08\u3069\u308C\u304B\uFF09</legend>
    <p class="small muted" style="margin:0">\u5F79\u8077\u306E\u66F8\u304D\u65B9\u304B\u3089\u81EA\u52D5\u3067\u4ED8\u3051\u305F\u533A\u5206\u3067\u3059\u3002</p>
    <div class="checks">`,`</div>
  </fieldset>

  <fieldset><legend>\u4F01\u696D\u5206\u985E1\uFF08\u3069\u308C\u304B\uFF09</legend>
    <div class="checks">`,`</div>
  </fieldset>

  <fieldset><legend>\u4F01\u696D\u5206\u985E2\uFF08\u3069\u308C\u304B\uFF09</legend>
    <div class="checks">`,`</div>
  </fieldset>

  <fieldset><legend>\u56E3\u4F53\u6240\u5728\u5730\uFF08\u3069\u308C\u304B\uFF09</legend>
    <div class="checks">`,`</div>
  </fieldset>

  <fieldset><legend>\u9664\u5916\u3059\u308B\u4EBA\uFF1A\u3053\u306E\u30A4\u30D9\u30F3\u30C8\u306B\u7533\u8FBC\u30FB\u53C2\u52A0\u3057\u305F\u4EBA</legend>
    <div class="checks">`,`</div>
  </fieldset>

  <div class="row"><button>\u4FDD\u5B58\u3059\u308B</button><a href="/segments">\u3084\u3081\u308B</a></div>
</div>
<div class="card" style="position:sticky;top:12px">
  <div class="muted small">\u3053\u306E\u6761\u4EF6\u3067\u9001\u308B\u4EBA\u6570</div>
  <div class="big" id="count">`,`<span style="font-size:18px">\u4EBA</span></div>
  <p class="small muted" id="desc" style="margin:0"></p>
  <p class="small muted" style="margin:0">\u914D\u4FE1\u505C\u6B62\u30FB\u5B9B\u5148\u4E0D\u660E\u306E\u4EBA\u3068\u3001\u9001\u3063\u3066\u3088\u3044\u6839\u62E0\u304C\u306A\u3044\u4EBA\u306F\u81EA\u52D5\u3067\u9664\u304B\u308C\u3066\u3044\u307E\u3059\u3002</p>
  `,`
</div>
</form>
<script>`,"<\/script>"])),e?"\u30EA\u30B9\u30C8\u3092\u7DE8\u96C6":"\u65B0\u3057\u3044\u914D\u4FE1\u5148\u30EA\u30B9\u30C8",e?`/segments/${e.id}`:"/segments",e?.name??"",a.map(r=>l`<label><input type="checkbox" name="events" value="${r.id}" ${o(s.events,r.id)}>${r.name} <span class="small muted">${H(r.held_on)}</span></label>`),["attended","applied"].map(r=>l`<label><input type="checkbox" name="event_status" value="${r}" ${(s.event_status??["attended"]).includes(r)?"checked":""}>${z[r]}</label>`),n.map(r=>l`<label><input type="checkbox" name="interests" value="${r.id}" ${o(s.interests,r.id)}>${r.name}</label>`),At.map(r=>l`<label><input type="checkbox" name="job_levels" value="${r}" ${o(s.job_levels,r)}>${r}</label>`),D.map(r=>l`<label><input type="checkbox" name="size_classes" value="${r}" ${o(s.size_classes,r)}>${r}</label>`),i.industries.map(r=>l`<label><input type="checkbox" name="industries" value="${r}" ${o(s.industries,r)}>${r}</label>`),i.prefectures.map(r=>l`<label><input type="checkbox" name="prefectures" value="${r}" ${o(s.prefectures,r)}>${r}</label>`),a.map(r=>l`<label><input type="checkbox" name="exclude_events" value="${r.id}" ${o(s.exclude_events,r.id)}>${r.name}</label>`),c,e?l`<a href="/segments/${e.id}/members">対象者を一覧で見る</a>`:"",T(`
const f = document.getElementById('segform');
let t;
f.addEventListener('change', () => { clearTimeout(t); t = setTimeout(async () => {
  const r = await fetch('/segments/count', { method: 'POST', body: new FormData(f) });
  if (!r.ok) return;
  const j = await r.json();
  document.getElementById('count').firstChild.textContent = j.n;
  document.getElementById('desc').textContent = j.text;
}, 150); });`))})}J.get("/new",t=>We(t,null));J.get("/:id{[0-9]+}",async t=>{let e=await _("select * from segments where id = $1",[t.req.param("id")]);return e?We(t,e):t.notFound()});J.post("/count",async t=>{let e=Ct(await t.req.parseBody({all:!0}));return t.json({n:await N(e),text:await W(e)})});J.post("/",async t=>{let e=await t.req.parseBody({all:!0}),s=await _("insert into segments (name, definition, created_by) values ($1, $2, $3) returning id",[String(e.name||"\u540D\u524D\u306A\u3057\u306E\u30EA\u30B9\u30C8"),JSON.stringify(Ct(e)),t.get("user").id]);return await y(t,"segment.create","segment",s.id),g(t,"\u30EA\u30B9\u30C8\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002"),t.redirect("/segments")});J.post("/:id{[0-9]+}",async t=>{let e=t.req.param("id"),s=await t.req.parseBody({all:!0});return await f("update segments set name = $2, definition = $3, updated_at = now() where id = $1",[e,String(s.name||"\u540D\u524D\u306A\u3057\u306E\u30EA\u30B9\u30C8"),JSON.stringify(Ct(s))]),await y(t,"segment.update","segment",Number(e)),g(t,"\u30EA\u30B9\u30C8\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002"),t.redirect("/segments")});J.get("/:id{[0-9]+}/members",async t=>{let e=await _("select * from segments where id = $1",[t.req.param("id")]);if(!e)return t.notFound();let s=await nt(e.definition,{limit:500}),a=await N(e.definition);return x(t,{title:e.name,active:"/segments",body:l`<div><a href="/segments/${e.id}" class="small">← ${e.name}</a><h1>対象者 ${a}人</h1></div>
<div class="card"><div class="scroll"><table><thead><tr><th>氏名</th><th>企業・団体名</th><th>部署・役職</th><th>メールアドレス</th></tr></thead><tbody>
${s.map(n=>l`<tr><td><a href="/contacts/${n.id}">${n.full_name}</a></td><td>${n.org_name??""}</td><td class="small">${[n.department,n.job_title].filter(Boolean).join("\u3000")}</td><td class="small">${n.email}</td></tr>`)}
</tbody></table></div>${a>s.length?l`<p class="small muted">先頭の${s.length}人を表示しています。</p>`:""}</div>`})});var Xe=J;var ht={"{{\u6C0F\u540D}}":t=>t.full_name??"","{{\u4F01\u696D\u30FB\u56E3\u4F53\u540D}}":t=>t.org_name??"","{{\u90E8\u7F72}}":t=>t.department??"","{{\u5F79\u8077}}":t=>t.job_title??""};function Ve(t,e){let s=t;for(let[a,n]of Object.entries(ht))s=s.split(a).join(n(e));return s}var ca="\u4ECA\u5F8C\u3053\u306E\u3088\u3046\u306A\u3054\u6848\u5185\u304C\u4E0D\u8981\u306A\u5834\u5408\u306F\u3001\u3053\u306E\u30E1\u30FC\u30EB\u306B\u300C\u914D\u4FE1\u505C\u6B62\u300D\u3068\u3054\u8FD4\u4FE1\u304F\u3060\u3055\u3044\u3002";function ma(){let t="************************************************";return["",t,...$.footer.signature,t,ca].join(`
`)}function pa(t){return`<div lang="ja">${t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\r?\n/g,`<br>
`)}</div>`}function L(t,e){let s=`${Ve(t.body_text,e)}
${ma()}`;return{subject:Ve(t.subject,e),text:s,html:pa(s)}}var Ye=new TextEncoder,ua=Array.from({length:256},(t,e)=>{let s=e;for(let a=0;a<8;a++)s=s&1?3988292384^s>>>1:s>>>1;return s>>>0});function fa(t){let e=4294967295;for(let s of t)e=ua[(e^s)&255]^e>>>8;return(e^4294967295)>>>0}function ha(t){let e=[],s=[],a=0;for(let[d,m]of t){let u=Ye.encode(m),p=Ye.encode(d),h=fa(u),b=new DataView(new ArrayBuffer(30));b.setUint32(0,67324752,!0),b.setUint16(4,20,!0),b.setUint16(6,2048,!0),b.setUint32(14,h,!0),b.setUint32(18,u.length,!0),b.setUint32(22,u.length,!0),b.setUint16(26,p.length,!0);let w=new DataView(new ArrayBuffer(46));w.setUint32(0,33639248,!0),w.setUint16(4,20,!0),w.setUint16(6,20,!0),w.setUint16(8,2048,!0),w.setUint32(16,h,!0),w.setUint32(20,u.length,!0),w.setUint32(24,u.length,!0),w.setUint16(28,p.length,!0),w.setUint32(42,a,!0),e.push(new Uint8Array(b.buffer),p,u),s.push(new Uint8Array(w.buffer),p),a+=30+p.length+u.length}let n=s.reduce((d,m)=>d+m.length,0),i=new DataView(new ArrayBuffer(22));i.setUint32(0,101010256,!0),i.setUint16(8,t.length,!0),i.setUint16(10,t.length,!0),i.setUint32(12,n,!0),i.setUint32(16,a,!0);let o=[...e,...s,new Uint8Array(i.buffer)],c=new Uint8Array(o.reduce((d,m)=>d+m.length,0)),r=0;for(let d of o)c.set(d,r),r+=d.length;return c}var gt=t=>String(t??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"),re=t=>(t>=26?re(Math.floor(t/26)-1):"")+String.fromCharCode(65+t%26);function Qe({sheet:t="Sheet1",table:e="Table1",headers:s,rows:a,widths:n=[]}){let o=`A1:${`${re(s.length-1)}${a.length+1}`}`,c=(w,v,S)=>`<c r="${re(S)}${v}" t="inlineStr"${v>1?' s="1"':""}><is><t xml:space="preserve">${gt(w)}</t></is></c>`,r=[s,...a].map((w,v)=>`<row r="${v+1}">${s.map((S,R)=>c(w[R],v+1,R)).join("")}</row>`).join(""),d=n.length?`<cols>${n.map((w,v)=>`<col min="${v+1}" max="${v+1}" width="${w}" customWidth="1"/>`).join("")}</cols>`:"",m='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',u='xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',p="http://schemas.openxmlformats.org/officeDocument/2006/relationships",h="application/vnd.openxmlformats-officedocument.spreadsheetml",b=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
`;return ha([["[Content_Types].xml",`${b}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="${h}.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${h}.worksheet+xml"/>
<Override PartName="/xl/tables/table1.xml" ContentType="${h}.table+xml"/>
<Override PartName="/xl/styles.xml" ContentType="${h}.styles+xml"/></Types>`],["_rels/.rels",`${b}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${p}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],["xl/workbook.xml",`${b}<workbook ${m} ${u}><sheets><sheet name="${gt(t)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],["xl/_rels/workbook.xml.rels",`${b}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${p}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${p}/styles" Target="styles.xml"/></Relationships>`],["xl/worksheets/sheet1.xml",`${b}<worksheet ${m} ${u}><dimension ref="${o}"/>${d}<sheetData>${r}</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>`],["xl/worksheets/_rels/sheet1.xml.rels",`${b}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${p}/table" Target="../tables/table1.xml"/></Relationships>`],["xl/tables/table1.xml",`${b}<table ${m} id="1" name="${gt(e)}" displayName="${gt(e)}" ref="${o}"><autoFilter ref="${o}"/><tableColumns count="${s.length}">${s.map((w,v)=>`<tableColumn id="${v+1}" name="${gt(w)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`],["xl/styles.xml",`${b}<styleSheet ${m}><fonts count="1"><font><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]])}var P=new O,es={draft:l`<span class="pill">作成中</span>`,test_sent:l`<span class="pill info">テスト済み</span>`,exported:l`<span class="pill warn">送り残しあり</span>`,sent:l`<span class="pill ok">送信ファイル書き出し済み</span>`,cancelled:l`<span class="pill bad">途中で終了</span>`},ga={headers:["\u5B9B\u5148","\u4EF6\u540D","\u672C\u6587","\u72B6\u614B","\u756A\u53F7"],widths:[34,40,70,12,10]},oe="\u9001\u4FE1\u6E08\u307F";function le(t,e){let s=Qe({sheet:$.sendFile.table,table:$.sendFile.table,...ga,rows:e});return t.body(s,200,{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="send.xlsx"; filename*=UTF-8''${encodeURIComponent($.sendFile.name)}`})}async function ss(t){let e=await f("select status, count(*)::int n from deliveries where campaign_id = $1 group by status",[t]),s=Object.fromEntries(e.map(a=>[a.status,a.n]));return{queued:s.queued??0,sent:s.sent??0,skipped:s.skipped??0,total:e.reduce((a,n)=>a+n.n,0)}}P.get("/",async t=>{let e=await f("select cp.*, s.name segment_name from campaigns cp left join segments s on s.id = cp.segment_id order by cp.created_at desc"),s=await Promise.all(e.map(async a=>({...a,p:await ss(a.id)})));return x(t,{title:"\u914D\u4FE1",active:"/campaigns",flash:k(t),body:l`
<div class="row spread"><h1>配信</h1><a class="btn" href="/campaigns/new">新しい配信を作る</a></div>
<div class="card">
${s.length?l`<div class="scroll"><table><thead><tr><th>配信</th><th>送り先</th><th>状態</th><th class="num">送った人数</th><th>日時</th></tr></thead><tbody>
${s.map(a=>l`<tr><td><a href="/campaigns/${a.id}">${a.name}</a><div class="small muted">${a.subject}</div></td>
  <td class="small">${a.segment_name??"\u672A\u8A2D\u5B9A"}</td><td>${es[a.status]}</td>
  <td class="num">${a.p.total?`${a.p.sent} / ${a.p.total}`:"\u2014"}</td>
  <td class="small">${q(a.exported_at??a.created_at)}</td></tr>`)}
</tbody></table></div>`:l`<p class="muted">まだ配信はありません。</p>`}
</div>`})});function as(t){let e=["1. \u672C\u6587\u3092\u66F8\u304F","2. \u898B\u672C\u3092\u78BA\u8A8D","3. \u4EBA\u6570\u3092\u78BA\u8A8D\u3057\u3066\u66F8\u304D\u51FA\u3059","4. Power Automate \u3067\u9001\u308B"],s={draft:1,test_sent:2,exported:3,sent:4,cancelled:-1}[t];return l`<ol class="steps">${e.map((a,n)=>l`<li class="${n<s?"done":n===s?"now":""}">${a}</li>`)}</ol>`}async function ns(t){let[e]=await nt(t??{},{limit:1});return e??{full_name:"\u30B5\u30F3\u30D7\u30EB \u592A\u90CE",org_name:"\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB",department:"\u65B0\u898F\u4E8B\u696D\u90E8",job_title:"\u90E8\u9577"}}P.get("/new",async t=>is(t,null));async function is(t,e){let s=await f("select id, name from segments order by updated_at desc");return x(t,{title:e?e.name:"\u65B0\u3057\u3044\u914D\u4FE1",active:"/campaigns",flash:k(t),body:l`
<div><a href="/campaigns" class="small">← 配信一覧</a><h1>${e?"\u914D\u4FE1\u3092\u7DE8\u96C6":"\u65B0\u3057\u3044\u914D\u4FE1"}</h1></div>
${as(e?.status??"draft")}
<form class="card" method="post" action="${e?`/campaigns/${e.id}`:"/campaigns"}">
  <label>管理用の名前<span class="hint">受け取る人には見えません</span><input type="text" id="name" name="name" value="${e?.name??""}" required placeholder="例：11月 DXセミナー案内"></label>
  <label>送り先<select id="segment_id" name="segment_id" required><option value="">選んでください</option>
    ${s.map(a=>l`<option value="${a.id}" ${a.id===e?.segment_id?"selected":""}>${a.name}</option>`)}</select>
    <span class="hint">送り先は「配信先リスト」で作ります。</span></label>
  <label>件名<input type="text" id="subject" name="subject" value="${e?.subject??""}" required></label>
  <label>本文
    <span class="hint">差し込みできる項目：${Object.keys(ht).join("\u3000")}。末尾の送信者情報と配信停止の案内は自動で付きます。</span>
    <textarea id="body_text" name="body_text" required>${e?.body_text??`{{\u6C0F\u540D}} \u69D8

`}</textarea></label>
  <div class="row"><button>保存する</button><a href="${e?`/campaigns/${e.id}`:"/campaigns"}">やめる</a></div>
</form>`})}P.post("/",async t=>{let e=await t.req.parseBody(),s=await _("insert into campaigns (name, subject, body_text, segment_id, from_address, created_by) values ($1,$2,$3,$4,$5,$6) returning id",[e.name,e.subject,e.body_text,e.segment_id||null,$.fromAddress,t.get("user").id]);return await y(t,"campaign.create","campaign",s.id),g(t,"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u5C4A\u304F\u30E1\u30FC\u30EB\u306E\u898B\u672C\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"),t.redirect(`/campaigns/${s.id}`)});P.get("/:id{[0-9]+}/edit",async t=>{let e=await _("select * from campaigns where id = $1",[t.req.param("id")]);return e?["draft","test_sent"].includes(e.status)?is(t,e):t.redirect(`/campaigns/${e.id}`):t.notFound()});P.post("/:id{[0-9]+}",async t=>{let e=t.req.param("id"),s=await t.req.parseBody(),a=await _("select * from campaigns where id = $1",[e]);if(!["draft","test_sent"].includes(a?.status))return g(t,"\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u305F\u914D\u4FE1\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002","bad"),t.redirect(`/campaigns/${e}`);let n=a.subject!==s.subject||a.body_text!==s.body_text||String(a.segment_id)!==String(s.segment_id);return await f(`update campaigns set name=$2, subject=$3, body_text=$4, segment_id=$5 ${n?", status='draft', test_sent_at=null":""} where id=$1`,[e,s.name,s.subject,s.body_text,s.segment_id||null]),await y(t,"campaign.update","campaign",Number(e)),g(t,"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002"),t.redirect(`/campaigns/${e}`)});var Ze=l`<ol class="small" style="margin:0;padding-left:1.4em">
  <li>共有フォルダーの「${$.sendFile.name}」を、書き出したファイルで置き換える（同じ名前でアップロードし「置き換え」）</li>
  <li>Power Automate で「${$.sendFile.flow}」のフローを開き、「テスト」→「手動」→「フローの実行」</li>
  <li>1通ずつ間をあけて送られ、送った行の「状態」に「${oe}」と入ります</li></ol>`,ts,ba=$.demo?"":l(ts||(ts=vt([`<script>document.querySelectorAll('form[data-download]').forEach((f) =>
  f.addEventListener('submit', () => { if (f.checkValidity()) setTimeout(() => location.reload(), 1500); }));<\/script>`])));P.get("/:id{[0-9]+}",async t=>{let e=await _("select cp.*, s.name segment_name, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1",[t.req.param("id")]);if(!e)return t.notFound();let s=e.segment_definition??e.definition??{},[a,n,i,o]=await Promise.all([N(s),W(s),ns(s),ss(e.id)]),c=L(e,i),r=t.get("user"),d=["draft","test_sent"].includes(e.status);return x(t,{title:e.name,active:"/campaigns",flash:k(t),body:l`
<div class="row spread"><div><a href="/campaigns" class="small">← 配信一覧</a><h1>${e.name} ${es[e.status]}</h1></div>
  ${d?l`<a class="btn sub" href="/campaigns/${e.id}/edit">本文・送り先を編集</a>`:""}</div>
${as(e.status)}

<div class="grid2 split">
<div class="card"><h2>届くメールの見本</h2>
  <p class="small muted" style="margin:0">実際に届くメールと同じ形で表示しています（文字の大きさや書体は、受け取る人のメールソフトによって変わります）。</p>
  <div class="small muted">差出人：Social Design Center &lt;${e.from_address}&gt;　／　見本の宛先：${i.full_name} さん</div>
  <div><b>件名：</b>${c.subject}</div>
  <div class="mail">${T(c.html)}</div>
</div>

<div style="display:grid;gap:16px">
<div class="card"><h2>送り先</h2>
  <div>${e.segment_name??"\u672A\u8A2D\u5B9A"}</div><div class="small muted">${n}</div>
  ${d?l`<div class="big">${a}<span style="font-size:18px">人</span></div>`:""}
</div>

${d?l`
<form class="card" method="post" action="/campaigns/${e.id}/send-file" data-download>
  <h2>3. 人数を確認して送信ファイルを書き出す</h2>
  <p style="margin:0">この配信は <b>${a}人</b> に送られます。確認のため、人数を入力してください。</p>
  <label class="check"><input type="checkbox" id="preview_checked" name="preview_checked" value="1" required> 左の見本で、件名・本文・宛名を確認した</label>
  <label>送る人数<input type="number" id="confirm_count" name="confirm_count" inputmode="numeric" required></label>
  <div><button ${a===0?"disabled":""}>送信ファイルを書き出す</button></div>
  <p class="small muted" style="margin:0">書き出すと、この人たちには送ったものとして記録され、配信は変更できなくなります。</p>
  ${Ze}
</form>

<details class="card">
  <summary><b>自分あてにテストする（任意）</b></summary>
  <form method="post" action="/campaigns/${e.id}/test-file" data-download style="display:grid;gap:12px;margin-top:12px">
    <p class="small" style="margin:0">新しい形の文面を初めて送るときなど、受け取ったときの見え方を確かめたいときに使います。自分あて1通だけのファイルを書き出し、本番と同じ手順で送ります。</p>
    <label>テストの送り先<input type="email" id="test_to" name="to" value="${r.email}" required></label>
    <div><button class="sub">テスト用ファイルを書き出す</button></div>
    ${e.test_sent_at?l`<div class="small ok">テスト用ファイルを書き出し済み（${q(e.test_sent_at)}）</div>`:""}
  </form>
</details>`:""}

${["sent","exported","cancelled"].includes(e.status)?l`
<div class="card"><h2>送信の記録</h2>
  <div class="big">${o.sent}<span style="font-size:18px"> / ${o.total}人</span></div>
  <div class="small">送り残し ${o.queued}・送らなかった ${o.skipped}（書き出しの前に配信停止になった人など）</div>
  <div class="small muted">書き出し：${q(e.exported_at)}</div>
</div>`:""}

${e.status==="exported"?l`
<form class="card" method="post" action="/campaigns/${e.id}/rest-file" data-download>
  <h2>送り残しの人に送る</h2>
  <p class="small" style="margin:0">送り残しの${o.queued}人だけの送信ファイルを書き出します。</p>
  <div><button>送り残しの送信ファイルを書き出す（${o.queued}人分）</button></div>
  ${Ze}
</form>
<form class="card" method="post" action="/campaigns/${e.id}/cancel">
  <h2>送り残しには送らずに終える</h2>
  <div><button class="danger">送らずに終える</button></div>
</form>`:""}

${e.status==="sent"?l`
<details class="card">
  <summary><b>途中で止まったとき</b></summary>
  <div style="display:grid;gap:12px;margin-top:12px">
    <p class="small" style="margin:0">Power Automate からエラーのメールが届いたときなど、全員に送れなかったときに使います。共有フォルダーから「${$.sendFile.name}」をダウンロードして取り込むと、「状態」が「${oe}」になっていない人が送り残しに戻ります。</p>
    ${$.demo?l`<div class="flash warn">確認用の画面なので、ファイルは選べません。</div>`:l`<form method="post" action="/campaigns/${e.id}/result" enctype="multipart/form-data" style="display:grid;gap:12px">
      <label>共有フォルダーの「${$.sendFile.name}」（.xlsx）<input type="file" id="result_file" name="file" accept=".xlsx" required></label>
      <div><button class="sub">取り込む</button></div></form>`}
  </div>
</details>`:""}
</div>
</div>
${ba}`})});async function rs(t,e){await t(`update deliveries d set status = 'skipped', last_error = '\u914D\u4FE1\u505C\u6B62\u6E08\u307F'
    where d.campaign_id = $1 and d.status = 'queued' and exists (select 1 from suppressions s where s.email = d.email)`,[e]);let s=await t(`select d.id, d.email, c.full_name, c.department, c.job_title, o.name org_name
    from deliveries d left join contacts c on c.id = d.contact_id left join organizations o on o.id = c.organization_id
    where d.campaign_id = $1 and d.status = 'queued' order by d.id`,[e]);return await t("update deliveries set status = 'sent', sent_at = now() where campaign_id = $1 and status = 'queued'",[e]),await t("update campaigns set status = 'sent', completed_at = now() where id = $1",[e]),s}P.post("/:id{[0-9]+}/test-file",async t=>{let e=t.req.param("id"),s=String((await t.req.parseBody()).to??"").trim(),a=await _("select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1",[e]);if(!["draft","test_sent"].includes(a?.status))return t.redirect(`/campaigns/${e}`);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))return g(t,"\u30C6\u30B9\u30C8\u306E\u9001\u308A\u5148\u306E\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002","bad"),t.redirect(`/campaigns/${e}`);let n=L(a,await ns(a.definition));return await f("update campaigns set status = 'test_sent', test_sent_at = now() where id = $1",[e]),await y(t,"campaign.test","campaign",Number(e),{to:s}),le(t,[[s,`[\u30C6\u30B9\u30C8] ${n.subject}`,n.html,"","\u30C6\u30B9\u30C8"]])});P.post("/:id{[0-9]+}/send-file",async t=>{let e=Number(t.req.param("id")),s=await t.req.parseBody(),a=await _("select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1",[e]),n=d=>(g(t,d,"bad"),t.redirect(`/campaigns/${e}`));if(!["draft","test_sent"].includes(a?.status))return n("\u3053\u306E\u914D\u4FE1\u306F\u3001\u3082\u3046\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057\u3066\u3044\u307E\u3059\u3002");if(!a.segment_id)return n("\u5148\u306B\u9001\u308A\u5148\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002");if(!s.preview_checked)return n("\u898B\u672C\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u66F8\u304D\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002");let i=await N(a.definition);if(Number(s.confirm_count)!==i)return n(`\u5165\u529B\u3055\u308C\u305F\u4EBA\u6570\uFF08${s.confirm_count}\uFF09\u304C\u5B9F\u969B\u306E\u4EBA\u6570\uFF08${i}\u4EBA\uFF09\u3068\u9055\u3044\u307E\u3059\u3002\u9001\u308A\u5148\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);let{where:o,params:c}=at(a.definition),r=await A(async d=>(await d(`insert into deliveries (campaign_id, contact_id, email)
      select $${c.length+1}, c.id, c.email from sendable_contacts c where ${o}
      on conflict (campaign_id, email) do nothing`,[...c,e]),await d("update campaigns set exported_at = now(), confirmed_count = $2, confirmed_by = $3, segment_definition = $4 where id = $1",[e,i,t.get("user").id,JSON.stringify(a.definition)]),rs(d,e)));return await y(t,"campaign.export","campaign",e,{count:r.length}),le(t,r.map(d=>[d.email,L(a,d).subject,L(a,d).html,"",String(d.id)]))});P.post("/:id{[0-9]+}/rest-file",async t=>{let e=Number(t.req.param("id")),s=await _("select * from campaigns where id = $1",[e]);if(s?.status!=="exported")return t.redirect(`/campaigns/${e}`);let a=await A(n=>rs(n,e));return await y(t,"campaign.export","campaign",e,{count:a.length,rest:!0}),le(t,a.map(n=>[n.email,L(s,n).subject,L(s,n).html,"",String(n.id)]))});P.post("/:id{[0-9]+}/result",async t=>{let e=Number(t.req.param("id"));if($.demo)return t.text("\u78BA\u8A8D\u7528\u306E\u753B\u9762\u3067\u306F\u30D5\u30A1\u30A4\u30EB\u3092\u53D6\u308A\u8FBC\u3081\u307E\u305B\u3093\u3002",403);let s=(p,h="bad")=>(g(t,p,h),t.redirect(`/campaigns/${e}`));if((await _("select status from campaigns where id = $1",[e]))?.status!=="sent")return s("\u3053\u306E\u914D\u4FE1\u306F\u7D50\u679C\u3092\u53D6\u308A\u8FBC\u3081\u308B\u72B6\u614B\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002");let n=(await t.req.parseBody()).file;if(!n||typeof n=="string"||!n.size)return s("\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002");let i;try{let{readXlsx:p}=await import("../xlsx-read.js");i=p(await n.arrayBuffer()).find(h=>h.rows[0]?.includes("\u756A\u53F7"))?.rows}catch(p){return s(`\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u3081\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${p.message}\uFF09\u3002`)}if(!i)return s("\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u306E\u5F62\u306B\u306A\u3063\u3066\u3044\u307E\u305B\u3093\uFF08\u300C\u756A\u53F7\u300D\u306E\u5217\u304C\u3042\u308A\u307E\u305B\u3093\uFF09\u3002");let[o,...c]=i,r=o.indexOf("\u756A\u53F7"),d=o.indexOf("\u72B6\u614B");if(c.some(p=>p[r]==="\u30C6\u30B9\u30C8"))return s("\u3053\u308C\u306F\u30C6\u30B9\u30C8\u7528\u306E\u30D5\u30A1\u30A4\u30EB\u3067\u3059\u3002");let m=new Set((await f("select id from deliveries where campaign_id = $1",[e])).map(p=>Number(p.id)));if(!c.some(p=>m.has(Number(p[r]))))return s("\u5225\u306E\u914D\u4FE1\u306E\u30D5\u30A1\u30A4\u30EB\u306E\u3088\u3046\u3067\u3059\uFF08\u756A\u53F7\u304C\u5408\u3044\u307E\u305B\u3093\uFF09\u3002");let u=c.filter(p=>String(p[d]??"").trim()!==oe).map(p=>Number(p[r])).filter(p=>m.has(p));return u.length?(await A(async p=>{for(let h of u)await p("update deliveries set status = 'queued', sent_at = null where id = $1 and status = 'sent'",[h]);await p("update campaigns set status = 'exported', completed_at = null where id = $1",[e])}),await y(t,"campaign.result","campaign",e,{unsent:u.length}),s(`${u.length}\u4EBA\u304C\u9001\u308A\u6B8B\u3057\u3067\u3057\u305F\u3002\u300C\u9001\u308A\u6B8B\u3057\u306E\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3059\u300D\u304B\u3089\u9001\u3063\u3066\u304F\u3060\u3055\u3044\u3002`,"warn")):s("\u30D5\u30A1\u30A4\u30EB\u306E\u5168\u54E1\u304C\u300C\u9001\u4FE1\u6E08\u307F\u300D\u3067\u3057\u305F\u3002\u9001\u308A\u6B8B\u3057\u306F\u3042\u308A\u307E\u305B\u3093\u3002","ok")});P.post("/:id{[0-9]+}/cancel",async t=>{let e=t.req.param("id");return await A(async s=>{await s("update deliveries set status = 'skipped', last_error = '\u9014\u4E2D\u3067\u7D42\u4E86' where campaign_id = $1 and status = 'queued'",[e]),await s("update campaigns set status = 'cancelled', completed_at = now() where id = $1 and status = 'exported'",[e])}),await y(t,"campaign.cancel","campaign",Number(e)),g(t,"\u9001\u308A\u6B8B\u3057\u306B\u306F\u9001\u3089\u305A\u306B\u7D42\u3048\u307E\u3057\u305F\u3002","warn"),t.redirect(`/campaigns/${e}`)});var os=P;var de=class extends Error{constructor(e,s){super(e),this.waitMs=s}},_a={async send({to:t,subject:e,text:s,deliveryId:a}){return{id:`outbox-${(await _("insert into outbox_messages (to_address, subject, body_text, delivery_ref) values ($1, $2, $3, $4) returning id",[t,e,s,String(a??"test")])).id}`}}},bt=null;async function $a(){if(bt&&bt.exp>Date.now()+6e4)return bt.value;let{tenantId:t,clientId:e,clientSecret:s}=$.graph;if(!t||!e||!s)throw new Error("GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET \u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093");let a=await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,{method:"POST",body:new URLSearchParams({client_id:e,client_secret:s,scope:"https://graph.microsoft.com/.default",grant_type:"client_credentials"})}),n=await a.json();if(!a.ok)throw new Error(`\u30C8\u30FC\u30AF\u30F3\u53D6\u5F97\u306B\u5931\u6557: ${n.error_description??a.status}`);return bt={value:n.access_token,exp:Date.now()+n.expires_in*1e3},bt.value}var va={async send({to:t,subject:e,text:s,deliveryId:a}){let n=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent($.fromAddress)}/sendMail`,{method:"POST",headers:{Authorization:`Bearer ${await $a()}`,"Content-Type":"application/json"},body:JSON.stringify({message:{subject:e,body:{contentType:"Text",content:s},toRecipients:[{emailAddress:{address:t}}],internetMessageHeaders:[{name:"X-SDC-Delivery",value:String(a??"test")}]},saveToSentItems:!1})});if(n.status===202)return{id:null};let i=await n.text();throw n.status===429||n.status===503?new de(`Graph \u304C\u6DF7\u96D1\uFF08${n.status}\uFF09`,Number(n.headers.get("retry-after")??60)*1e3):new Error(`Graph \u9001\u4FE1\u306B\u5931\u6557\uFF08${n.status}\uFF09: ${i.slice(0,300)}`)}},ls=$.sendMode==="graph"?va:_a;var M=new O,ds={draft:l`<span class="pill">作成中</span>`,test_sent:l`<span class="pill info">テスト送信済み</span>`,scheduled:l`<span class="pill warn">予約済み</span>`,sending:l`<span class="pill warn">送信中</span>`,sent:l`<span class="pill ok">送信完了</span>`,cancelled:l`<span class="pill bad">取り消し</span>`};async function cs(t){let e=await f("select status, count(*)::int n from deliveries where campaign_id = $1 group by status",[t]),s=Object.fromEntries(e.map(a=>[a.status,a.n]));return{queued:s.queued??0,sent:s.sent??0,failed:s.failed??0,skipped:s.skipped??0,bounced:s.bounced??0,total:e.reduce((a,n)=>a+n.n,0)}}M.get("/",async t=>{let e=await f("select cp.*, s.name segment_name from campaigns cp left join segments s on s.id = cp.segment_id order by cp.created_at desc"),s=await Promise.all(e.map(async a=>({...a,p:await cs(a.id)})));return x(t,{title:"\u914D\u4FE1",active:"/campaigns",flash:k(t),body:l`
<div class="row spread"><h1>配信</h1><a class="btn" href="/campaigns/new">新しい配信を作る</a></div>
<div class="card">
${s.length?l`<div class="scroll"><table><thead><tr><th>配信</th><th>送り先</th><th>状態</th><th class="num">送信済み</th><th>日時</th></tr></thead><tbody>
${s.map(a=>l`<tr><td><a href="/campaigns/${a.id}">${a.name}</a><div class="small muted">${a.subject}</div></td>
  <td class="small">${a.segment_name??"\u672A\u8A2D\u5B9A"}</td><td>${ds[a.status]}</td>
  <td class="num">${a.p.total?`${a.p.sent} / ${a.p.total}`:"\u2014"}</td>
  <td class="small">${q(a.completed_at??a.scheduled_at??a.created_at)}</td></tr>`)}
</tbody></table></div>`:l`<p class="muted">まだ配信はありません。</p>`}
</div>`})});function ms(t){let e=["draft","test_sent","scheduled","sent"],s=["1. \u672C\u6587\u3092\u66F8\u304F","2. \u30C6\u30B9\u30C8\u9001\u4FE1","3. \u4EBA\u6570\u3092\u78BA\u8A8D\u3057\u3066\u4E88\u7D04","4. \u9001\u4FE1"],a=t==="sending"?3:t==="cancelled"?-1:e.indexOf(t);return l`<ol class="steps">${s.map((n,i)=>l`<li class="${i<a||t==="sent"?"done":i===a?"now":""}">${n}</li>`)}</ol>`}async function ps(t){let[e]=await nt(t??{},{limit:1});return e??{full_name:"\u30B5\u30F3\u30D7\u30EB \u592A\u90CE",org_name:"\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB",department:"\u65B0\u898F\u4E8B\u696D\u90E8",job_title:"\u90E8\u9577"}}M.get("/new",async t=>us(t,null));async function us(t,e){let s=await f("select id, name from segments order by updated_at desc");return x(t,{title:e?e.name:"\u65B0\u3057\u3044\u914D\u4FE1",active:"/campaigns",flash:k(t),body:l`
<div><a href="/campaigns" class="small">← 配信一覧</a><h1>${e?"\u914D\u4FE1\u3092\u7DE8\u96C6":"\u65B0\u3057\u3044\u914D\u4FE1"}</h1></div>
${ms(e?.status??"draft")}
${e?.status==="test_sent"?l`<div class="flash warn">本文を変更して保存すると、テスト送信をやり直す必要があります。</div>`:""}
<form class="card" method="post" action="${e?`/campaigns/${e.id}`:"/campaigns"}">
  <label>管理用の名前<span class="hint">受け取る人には見えません</span><input type="text" id="name" name="name" value="${e?.name??""}" required placeholder="例：11月 DXセミナー案内"></label>
  <label>送り先<select id="segment_id" name="segment_id" required><option value="">選んでください</option>
    ${s.map(a=>l`<option value="${a.id}" ${a.id===e?.segment_id?"selected":""}>${a.name}</option>`)}</select>
    <span class="hint">送り先は「配信先リスト」で作ります。</span></label>
  <label>件名<input type="text" id="subject" name="subject" value="${e?.subject??""}" required></label>
  <label>本文
    <span class="hint">差し込みできる項目：${Object.keys(ht).join("\u3000")}。末尾の送信者情報と配信停止の案内は自動で付きます。</span>
    <textarea id="body_text" name="body_text" required>${e?.body_text??`{{\u6C0F\u540D}} \u69D8

`}</textarea></label>
  <div class="row"><button>保存する</button><a href="${e?`/campaigns/${e.id}`:"/campaigns"}">やめる</a></div>
</form>`})}M.post("/",async t=>{let e=await t.req.parseBody(),s=await _("insert into campaigns (name, subject, body_text, segment_id, from_address, created_by) values ($1,$2,$3,$4,$5,$6) returning id",[e.name,e.subject,e.body_text,e.segment_id||null,$.fromAddress,t.get("user").id]);return await y(t,"campaign.create","campaign",s.id),g(t,"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u6B21\u306F\u30C6\u30B9\u30C8\u9001\u4FE1\u3067\u3059\u3002"),t.redirect(`/campaigns/${s.id}`)});M.get("/:id{[0-9]+}/edit",async t=>{let e=await _("select * from campaigns where id = $1",[t.req.param("id")]);return e?["draft","test_sent"].includes(e.status)?us(t,e):t.redirect(`/campaigns/${e.id}`):t.notFound()});M.post("/:id{[0-9]+}",async t=>{let e=t.req.param("id"),s=await t.req.parseBody(),a=await _("select * from campaigns where id = $1",[e]);if(!["draft","test_sent"].includes(a?.status))return g(t,"\u4E88\u7D04\u5F8C\u306E\u914D\u4FE1\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002","bad"),t.redirect(`/campaigns/${e}`);let n=a.subject!==s.subject||a.body_text!==s.body_text||String(a.segment_id)!==String(s.segment_id);return await f(`update campaigns set name=$2, subject=$3, body_text=$4, segment_id=$5 ${n?", status='draft', test_sent_at=null":""} where id=$1`,[e,s.name,s.subject,s.body_text,s.segment_id||null]),await y(t,"campaign.update","campaign",Number(e)),g(t,n&&a.status==="test_sent"?"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u5185\u5BB9\u304C\u5909\u308F\u3063\u305F\u306E\u3067\u3001\u3082\u3046\u4E00\u5EA6\u30C6\u30B9\u30C8\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044\u3002":"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002",n&&a.status==="test_sent"?"warn":"ok"),t.redirect(`/campaigns/${e}`)});M.get("/:id{[0-9]+}",async t=>{let e=await _("select cp.*, s.name segment_name, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1",[t.req.param("id")]);if(!e)return t.notFound();let s=e.segment_definition??e.definition??{},[a,n,i,o]=await Promise.all([N(s),W(s),ps(s),cs(e.id)]),c=L(e,i),r=t.get("user"),d=["draft","test_sent"].includes(e.status);return x(t,{title:e.name,active:"/campaigns",flash:k(t),body:l`
<div class="row spread"><div><a href="/campaigns" class="small">← 配信一覧</a><h1>${e.name} ${ds[e.status]}</h1></div>
  ${d?l`<a class="btn sub" href="/campaigns/${e.id}/edit">本文・送り先を編集</a>`:""}</div>
${ms(e.status)}

<div class="grid2" style="grid-template-columns:minmax(0,3fr) minmax(260px,2fr);align-items:start">
<div class="card"><h2>届くメールの見本</h2>
  <div class="small muted">差出人：${e.from_address}　／　見本の宛先：${i.full_name} さん</div>
  <div><b>件名：</b>${c.subject}</div>
  <pre class="mail">${c.text}</pre>
</div>

<div style="display:grid;gap:16px">
<div class="card"><h2>送り先</h2>
  <div>${e.segment_name??"\u672A\u8A2D\u5B9A"}</div><div class="small muted">${n}</div>
  ${d?l`<div class="big">${a}<span style="font-size:18px">人</span></div>`:""}
</div>

${d?l`
<form class="card" method="post" action="/campaigns/${e.id}/test">
  <h2>2. テスト送信</h2>
  <p class="small muted" style="margin:0">まず自分あてに送って、届いた見た目を確認します。</p>
  <label>テストの送り先<input type="email" id="test_to" name="to" value="${r.email}" required></label>
  <div><button class="${e.status==="test_sent"?"sub":""}">テスト送信する</button></div>
  ${e.test_sent_at?l`<div class="small ok">テスト送信済み（${q(e.test_sent_at)}）</div>`:""}
</form>

<form class="card" method="post" action="/campaigns/${e.id}/confirm">
  <h2>3. 人数を確認して予約</h2>
  ${e.status!=="test_sent"?l`<p class="muted" style="margin:0">テスト送信が済むと予約できます。</p>`:l`
  <p style="margin:0">この配信は <b>${a}人</b> に送られます。確認のため、人数を入力してください。</p>
  <label>送る人数<input type="number" id="confirm_count" name="confirm_count" inputmode="numeric" required></label>
  <label>送信開始<span class="hint">空欄なら今すぐ開始。1分あたり${$.sendPerMinute}通ずつ送ります（約${Math.ceil(a/$.sendPerMinute)}分）</span>
    <input type="datetime-local" id="scheduled_at" name="scheduled_at"></label>
  <div><button ${a===0?"disabled":""}>予約する</button></div>`}
</form>`:l`
<div class="card"><h2>送信の状況</h2>
  <div class="big">${o.sent}<span style="font-size:18px"> / ${o.total}通</span></div>
  <div class="small">送信待ち ${o.queued}・送らなかった ${o.skipped}・失敗 ${o.failed}</div>
  <div class="small muted">予約：${q(e.scheduled_at)}${e.completed_at?l`　完了：${q(e.completed_at)}`:""}</div>
  ${["scheduled","sending"].includes(e.status)?l`
  <form method="post" action="/campaigns/${e.id}/cancel"><button class="danger">残りの送信を取り消す</button></form>`:""}
</div>`}
</div>
</div>`})});M.post("/:id{[0-9]+}/test",async t=>{let e=t.req.param("id"),{to:s}=await t.req.parseBody(),a=await _("select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1",[e]);if(!["draft","test_sent"].includes(a?.status))return t.redirect(`/campaigns/${e}`);if(!a.segment_id)return g(t,"\u5148\u306B\u9001\u308A\u5148\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002","bad"),t.redirect(`/campaigns/${e}`);let n=await ps(a.definition),i=L(a,n);try{await ls.send({to:s,subject:`[\u30C6\u30B9\u30C8] ${i.subject}`,text:i.text,deliveryId:`test-${e}`})}catch(o){return g(t,`\u30C6\u30B9\u30C8\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A${o.message}`,"bad"),t.redirect(`/campaigns/${e}`)}return await f("update campaigns set status = 'test_sent', test_sent_at = now() where id = $1",[e]),await y(t,"campaign.test","campaign",Number(e),{to:s}),g(t,`${s} \u306B\u30C6\u30B9\u30C8\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002\u5C4A\u3044\u305F\u30E1\u30FC\u30EB\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u4E88\u7D04\u3057\u3066\u304F\u3060\u3055\u3044\u3002`),t.redirect(`/campaigns/${e}`)});M.post("/:id{[0-9]+}/confirm",async t=>{let e=t.req.param("id"),s=await t.req.parseBody(),a=await _("select cp.*, s.definition from campaigns cp left join segments s on s.id = cp.segment_id where cp.id = $1",[e]);if(a?.status!=="test_sent")return g(t,"\u30C6\u30B9\u30C8\u9001\u4FE1\u304C\u6E08\u3093\u3067\u3044\u307E\u305B\u3093\u3002","bad"),t.redirect(`/campaigns/${e}`);let n=await N(a.definition);if(Number(s.confirm_count)!==n)return g(t,`\u5165\u529B\u3055\u308C\u305F\u4EBA\u6570\uFF08${s.confirm_count}\uFF09\u304C\u5B9F\u969B\u306E\u4EBA\u6570\uFF08${n}\u4EBA\uFF09\u3068\u9055\u3044\u307E\u3059\u3002\u9001\u308A\u5148\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,"bad"),t.redirect(`/campaigns/${e}`);let i=s.scheduled_at?new Date(`${s.scheduled_at}:00+09:00`):new Date,{where:o,params:c}=at(a.definition);return await A(async r=>{await r(`insert into deliveries (campaign_id, contact_id, email)
      select $${c.length+1}, c.id, c.email from sendable_contacts c where ${o}
      on conflict (campaign_id, email) do nothing`,[...c,e]),await r("update campaigns set status = 'scheduled', scheduled_at = $2, confirmed_count = $3, confirmed_by = $4, segment_definition = $5 where id = $1",[e,i,n,t.get("user").id,JSON.stringify(a.definition)])}),await y(t,"campaign.confirm","campaign",Number(e),{count:n,scheduled_at:i}),g(t,`${n}\u4EBA\u3078\u306E\u914D\u4FE1\u3092\u4E88\u7D04\u3057\u307E\u3057\u305F\u3002`),t.redirect(`/campaigns/${e}`)});M.post("/:id{[0-9]+}/cancel",async t=>{let e=t.req.param("id");return await A(async s=>{await s("update deliveries set status = 'skipped', last_error = '\u53D6\u308A\u6D88\u3057' where campaign_id = $1 and status = 'queued'",[e]),await s("update campaigns set status = 'cancelled', completed_at = now() where id = $1 and status in ('scheduled', 'sending')",[e])}),await y(t,"campaign.cancel","campaign",Number(e)),g(t,"\u6B8B\u308A\u306E\u9001\u4FE1\u3092\u53D6\u308A\u6D88\u3057\u307E\u3057\u305F\u3002","warn"),t.redirect(`/campaigns/${e}`)});var fs=M;var hs=new O;hs.get("/",async t=>{let e=await f("select id, to_address, subject, created_at from outbox_messages order by id desc limit 300"),[{n:s}]=await f("select count(*)::int n from outbox_messages"),a=Number(t.req.query("id")),n=a?await _("select * from outbox_messages where id = $1",[a]):null;return x(t,{title:"\u9001\u4FE1\u7BB1\uFF08\u78BA\u8A8D\u7528\uFF09",active:"/outbox",body:l`<h1>送信箱（確認用）</h1>
<p class="lead">確認用の設定では実際にはメールを送らず、ここに保存します。全${s}通。</p>
<div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);align-items:start">
<div class="card" style="max-height:70vh;overflow:auto;gap:0">${e.length?e.map(i=>l`<a href="/outbox?id=${i.id}" style="display:block;padding:8px 0;border-bottom:1px solid var(--line);text-decoration:none;${i.id===a?"font-weight:700":""}">
  <span class="small muted">${q(i.created_at)}　${i.to_address}</span><br>${i.subject}</a>`):l`<p class="muted">まだありません。</p>`}</div>
<div class="card">${n?l`<div class="small muted">差出人：${$.fromAddress}<br>宛先：${n.to_address}<br>日時：${q(n.created_at)}</div>
  <div><b>件名：</b>${n.subject}</div><pre class="mail">${n.body_text}</pre>`:l`<p class="muted">左の一覧から選んでください。</p>`}</div>
</div>`})});var gs=hs;var it=new O,bs=["\u30BB\u30DF\u30CA\u30FC","\u30EF\u30FC\u30AF\u30B7\u30E7\u30C3\u30D7","\u8B1B\u5EA7","\u30B7\u30F3\u30DD\u30B8\u30A6\u30E0","\u4EA4\u6D41\u4F1A","\u305D\u306E\u4ED6"],_s=["\u5BFE\u9762","\u30AA\u30F3\u30E9\u30A4\u30F3","\u30CF\u30A4\u30D6\u30EA\u30C3\u30C9"];it.get("/",async t=>{let[e,s]=await Promise.all([f(`select e.*, (select count(*)::int from event_participations ep where ep.event_id = e.id and ep.status = 'attended') attended,
         (select count(*)::int from event_participations ep where ep.event_id = e.id) total
       from events e order by held_on desc nulls last`),f("select i.*, (select count(*)::int from contact_interests ci where ci.interest_id = i.id) n from interests i order by sort_order, id")]);return x(t,{title:"\u30A4\u30D9\u30F3\u30C8\u30FB\u8208\u5473",active:"/masters",flash:k(t),body:l`
<h1>イベント・興味</h1>
<p class="lead">配信先リストの条件に使うイベントと興味の一覧です。</p>
<div class="card"><h2>イベント</h2>
  <div class="scroll"><table><thead><tr><th>開催日</th><th>名称</th><th>種類</th><th class="num">参加</th><th class="num">申込など含む</th></tr></thead>
  <tbody>${e.map(a=>l`<tr><td>${a.held_on?H(a.held_on):l`<span class="pill warn">日付なし</span>`}</td><td><a href="/masters/events/${a.id}">${a.name}</a></td><td>${a.kind??""} ${a.format?l`<span class="small muted">${a.format}</span>`:""}</td><td class="num">${a.attended}</td><td class="num">${a.total}</td></tr>`)}</tbody></table></div>
  <p class="small muted" style="margin:0">Excel の取り込みで作られたイベントは日付が空なので、名前を押して入れてください。名前を変えると、次に同じシート名で取り込んだときは別のイベントとして作られます。</p>
  <form method="post" action="/masters/events" class="grid2">
    <label>名称<input type="text" id="ev_name" name="name" required></label>
    <label>開催日<input type="date" id="ev_held_on" name="held_on"></label>
    <label>種類<select id="ev_kind" name="kind">${bs.map(a=>l`<option>${a}</option>`)}</select></label>
    <label>形式<select id="ev_format" name="format">${_s.map(a=>l`<option>${a}</option>`)}</select></label>
    <div><button class="sub">イベントを追加</button></div>
  </form>
</div>
<div class="card"><h2>興味分類</h2>
  <p class="small muted" style="margin:0">連絡先の「興味分類」にカンマ区切りで書くと、新しい単語は自動でここに加わります。</p>
  <div class="checks">${s.map(a=>l`<span class="pill info">${a.name} ${a.n}人</span>`)}</div>
  <form method="post" action="/masters/interests" class="row">
    <label style="flex:1 1 240px">新しい興味<input type="text" id="int_name" name="name" required placeholder="例：地域創生"></label>
    <button class="sub" style="align-self:end">追加</button>
  </form>
</div>`})});it.post("/events",async t=>{let e=await t.req.parseBody(),s=String(e.name??"").trim();return s&&(await f("insert into events (name, held_on, kind, format) values ($1, $2, $3, $4)",[s,e.held_on||null,e.kind,e.format]),g(t,`\u30A4\u30D9\u30F3\u30C8\u300C${s}\u300D\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002`)),t.redirect("/masters")});it.get("/events/:id{[0-9]+}",async t=>{let e=await _("select *, to_char(held_on, 'YYYY-MM-DD') as day from events where id = $1",[t.req.param("id")]);if(!e)return t.notFound();let s=await f(`select ep.status, c.id, c.full_name, o.name org_name from event_participations ep join contacts c on c.id = ep.contact_id
    left join organizations o on o.id = c.organization_id where ep.event_id = $1 order by ep.status, o.name, c.full_name`,[e.id]);return x(t,{title:e.name,active:"/masters",flash:k(t),body:l`<div><a href="/masters" class="small">← イベント・興味</a><h1>${e.name}</h1></div>
<form class="card grid2" method="post" action="/masters/events/${e.id}">
  <label>名称<input type="text" id="ev_name" name="name" value="${e.name}" required></label>
  <label>開催日<input type="date" id="ev_held_on" name="held_on" value="${e.day??""}"></label>
  <label>種類<select id="ev_kind" name="kind"><option value="">未設定</option>${bs.map(a=>l`<option ${a===e.kind?"selected":""}>${a}</option>`)}</select></label>
  <label>形式<select id="ev_format" name="format"><option value="">未設定</option>${_s.map(a=>l`<option ${a===e.format?"selected":""}>${a}</option>`)}</select></label>
  <div><button>保存する</button></div>
</form>
<div class="card"><h2>参加者 ${s.length}人</h2>
  ${s.length?l`<div class="scroll"><table><tbody>${s.map(a=>l`<tr><td><a href="/contacts/${a.id}">${a.full_name}</a></td><td class="small">${a.org_name??""}</td><td>${z[a.status]}</td></tr>`)}</tbody></table></div>`:l`<p class="muted">まだいません。</p>`}
</div>`})});it.post("/events/:id{[0-9]+}",async t=>{let e=t.req.param("id"),s=await t.req.parseBody(),a=String(s.name??"").trim();return a?(await f("update events set name = $2, held_on = $3, kind = $4, format = $5 where id = $1",[e,a,s.held_on||null,s.kind||null,s.format||null]),g(t,"\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002"),t.redirect("/masters")):(g(t,"\u540D\u79F0\u306F\u5FC5\u9808\u3067\u3059\u3002","bad"),t.redirect(`/masters/events/${e}`))});it.post("/interests",async t=>{let e=await t.req.parseBody(),s=String(e.name??"").trim();return s&&(await f("insert into interests (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from interests)) on conflict (name) do nothing",[s]),g(t,`\u8208\u5473\u300C${s}\u300D\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002`)),t.redirect("/masters")});var $s=it;var rt=new O,wa={"contact.create":"\u9023\u7D61\u5148\u3092\u8FFD\u52A0","contact.update":"\u9023\u7D61\u5148\u3092\u7DE8\u96C6","contact.suppress":"\u914D\u4FE1\u3092\u505C\u6B62","segment.create":"\u914D\u4FE1\u5148\u30EA\u30B9\u30C8\u3092\u4F5C\u6210","segment.update":"\u914D\u4FE1\u5148\u30EA\u30B9\u30C8\u3092\u7DE8\u96C6","campaign.create":"\u914D\u4FE1\u3092\u4F5C\u6210","campaign.update":"\u914D\u4FE1\u3092\u7DE8\u96C6","campaign.test":"\u30C6\u30B9\u30C8\u7528\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057","campaign.confirm":"\u9001\u308A\u5148\u3092\u78BA\u5B9A\u30FB\u4E88\u7D04","campaign.export":"\u9001\u4FE1\u30D5\u30A1\u30A4\u30EB\u3092\u66F8\u304D\u51FA\u3057","campaign.result":"\u9001\u4FE1\u7D50\u679C\u3092\u53D6\u308A\u8FBC\u307F","campaign.cancel":"\u914D\u4FE1\u3092\u9014\u4E2D\u3067\u7D42\u4E86","staff.create":"\u5229\u7528\u8005\u3092\u8FFD\u52A0","staff.update":"\u5229\u7528\u8005\u3092\u5909\u66F4","suppression.lift":"\u914D\u4FE1\u505C\u6B62\u3092\u89E3\u9664","import.apply":"Excel \u304B\u3089\u53D6\u308A\u8FBC\u307F"},ya={unsubscribe:"\u672C\u4EBA\u304C\u914D\u4FE1\u505C\u6B62",hard_bounce:"\u5B9B\u5148\u4E0D\u660E\u3067\u5C4A\u304B\u306A\u3044",complaint:"\u8FF7\u60D1\u30E1\u30FC\u30EB\u5831\u544A",manual:"\u62C5\u5F53\u8005\u304C\u505C\u6B62"};rt.get("/",async t=>{let[e,s,a]=await Promise.all([f("select * from staff_users order by id"),f(`select s.*, c.id contact_id, c.full_name from suppressions s
       left join contacts c on c.email = s.email and c.merged_into_id is null order by s.created_at desc limit 100`),f("select a.*, u.name from audit_log a left join staff_users u on u.id = a.actor_id order by a.at desc limit 100")]),n=t.get("user");return x(t,{title:"\u7BA1\u7406",active:"/admin",flash:k(t),body:l`
<h1>管理</h1>
<p class="lead">管理者だけが使える画面です。</p>

<div class="card"><h2>利用者</h2>
  <p class="small muted" style="margin:0">このシステムにログインできる人です。本番では大学の M365 アカウントでログインします。</p>
  <div class="scroll"><table><thead><tr><th>名前</th><th>メール</th><th>権限</th><th>最終ログイン</th><th></th></tr></thead><tbody>
  ${e.map(i=>l`<tr><td>${i.name}${i.active?"":l` <span class="pill">停止中</span>`}</td><td class="small">${i.email}</td>
    <td>${i.role==="admin"?"\u7BA1\u7406\u8005":"\u62C5\u5F53\u8005"}</td><td class="small">${q(i.last_login_at)}</td>
    <td>${i.id===n.id?l`<span class="small muted">自分</span>`:l`
      <form method="post" action="/admin/users/${i.id}" class="row" style="gap:6px">
        <input type="hidden" name="role" value="${i.role==="admin"?"operator":"admin"}">
        <button class="sub" name="op" value="role">${i.role==="admin"?"\u62C5\u5F53\u8005\u306B\u3059\u308B":"\u7BA1\u7406\u8005\u306B\u3059\u308B"}</button>
      </form>
      <form method="post" action="/admin/users/${i.id}/active" class="inline"><button class="link">${i.active?"\u30ED\u30B0\u30A4\u30F3\u3092\u6B62\u3081\u308B":"\u30ED\u30B0\u30A4\u30F3\u3092\u518D\u958B"}</button></form>`}</td></tr>`)}
  </tbody></table></div>
  <form method="post" action="/admin/users" class="grid2">
    <label>名前<input type="text" id="u_name" name="name" required></label>
    <label>メール（M365のアドレス）<input type="email" id="u_email" name="email" required></label>
    <label>権限<select id="u_role" name="role"><option value="operator">担当者</option><option value="admin">管理者</option></select></label>
    <div style="align-self:end"><button class="sub">利用者を追加</button></div>
  </form>
</div>

<div class="card"><h2>配信停止中のアドレス</h2>
  <p class="small muted" style="margin:0">本人から「また案内がほしい」と連絡があったときだけ解除します。宛先不明のアドレスは、正しいアドレスに直してから解除してください。</p>
  ${s.length?l`<div class="scroll"><table><thead><tr><th>アドレス</th><th>理由</th><th>日時</th><th></th></tr></thead><tbody>
  ${s.map(i=>l`<tr><td class="small">${i.email}${i.contact_id?l`<div><a href="/contacts/${i.contact_id}">${i.full_name}</a></div>`:""}</td>
    <td class="small">${ya[i.reason]}</td><td class="small">${q(i.created_at)}</td>
    <td><form method="post" action="/admin/suppressions/lift"><input type="hidden" name="email" value="${i.email}"><button class="link">解除する</button></form></td></tr>`)}
  </tbody></table></div>`:l`<p class="muted">ありません。</p>`}
</div>

<div class="card"><h2>操作の記録（最新100件）</h2>
  <p class="small muted" style="margin:0">誰がいつ何をしたかの記録です。誤送信などが起きたときの確認に使います。</p>
  ${a.length?l`<div class="scroll"><table><thead><tr><th>日時</th><th>誰が</th><th>操作</th><th>対象</th></tr></thead><tbody>
  ${a.map(i=>l`<tr><td class="small">${q(i.at)}</td><td>${i.name??""}</td><td>${wa[i.action]??i.action}</td>
    <td class="small">${i.target_type==="campaign"?l`<a href="/campaigns/${i.target_id}">配信 #${i.target_id}</a>`:i.target_type==="contact"?l`<a href="/contacts/${i.target_id}">連絡先 #${i.target_id}</a>`:i.target_type?`${i.target_type} #${i.target_id??""}`:""}</td></tr>`)}
  </tbody></table></div>`:l`<p class="muted">まだ記録はありません。</p>`}
</div>`})});rt.post("/users",async t=>{let e=await t.req.parseBody(),s=String(e.name??"").trim(),a=String(e.email??"").trim();if(!s||!a)return g(t,"\u540D\u524D\u3068\u30E1\u30FC\u30EB\u306F\u5FC5\u9808\u3067\u3059\u3002","bad"),t.redirect("/admin");let n=await _("insert into staff_users (entra_object_id, name, email, role) values ($1, $2, $3, $4) returning id",[`pending:${a.toLowerCase()}`,s,a,e.role==="admin"?"admin":"operator"]);return await y(t,"staff.create","staff",n.id),g(t,`${s}\u3055\u3093\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002`),t.redirect("/admin")});rt.post("/users/:id{[0-9]+}",async t=>{let e=Number(t.req.param("id")),s=await t.req.parseBody();return e===t.get("user").id||(await f("update staff_users set role = $2 where id = $1",[e,s.role==="admin"?"admin":"operator"]),await y(t,"staff.update","staff",e,{role:s.role}),g(t,"\u6A29\u9650\u3092\u5909\u66F4\u3057\u307E\u3057\u305F\u3002")),t.redirect("/admin")});rt.post("/users/:id{[0-9]+}/active",async t=>{let e=Number(t.req.param("id"));return e===t.get("user").id||(await f("update staff_users set active = not active where id = $1",[e]),await y(t,"staff.update","staff",e,{toggled:"active"}),g(t,"\u5909\u66F4\u3057\u307E\u3057\u305F\u3002")),t.redirect("/admin")});rt.post("/suppressions/lift",async t=>{let{email:e}=await t.req.parseBody();return await f("delete from suppressions where email = $1",[e]),await y(t,"suppression.lift","suppression",null,{email:e}),g(t,`${e} \u306E\u914D\u4FE1\u505C\u6B62\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002`),t.redirect("/admin")});var vs=rt;var ce="\u9867\u5BA2",Pt={\u6C0F\u540D:"full_name","\u4F01\u696D\u30FB\u56E3\u4F53\u540D":"org_name",\u90E8\u7F72:"department",\u5F79\u8077:"job_title",\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9:"email",\u56E3\u4F53\u6240\u5728\u5730:"location",\u4F01\u696D\u5206\u985E1:"size_class",\u4F01\u696D\u5206\u985E2:"industry",\u8208\u5473\u5206\u985E:"interests",\u53C2\u52A0\u72B6\u6CC1:"status"},xa={customer:["\u6C0F\u540D","\u4F01\u696D\u30FB\u56E3\u4F53\u540D","\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9"],event:["\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9"]},ka=Object.fromEntries(Object.entries(z).map(([t,e])=>[e,t])),ja=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,Sa=/^(なし|無し|-|－|ー)$/,ot=t=>String(t??"").normalize("NFKC").replace(/\s+/g," ").trim();function ws(t,e){let s=ot(t)===ce?"customer":"event",a=e.findIndex(r=>r?.some(d=>ot(d))),n=(e[a]??[]).map(ot),i=Object.fromEntries(Object.keys(Pt).map(r=>[Pt[r],n.indexOf(r)])),o=xa[s].filter(r=>!n.includes(r)),c=[];return e.slice(a+1).forEach((r,d)=>{if(!r?.some(u=>ot(u)))return;let m={};for(let[u,p]of Object.entries(i))m[u]=p>=0?ot(r[p]):"";for(let u of["department","job_title","location"])Sa.test(m[u])&&(m[u]="");m.email=m.email.toLowerCase(),c.push({sheet:t,kind:s,line:a+d+2,data:m})}),{name:t,kind:s,event:s==="event"?ot(t):null,missing:o,records:c}}async function me(t,e){let s=new Map,a=[],n=[];for(let o of e){let c=new Map,r=null;if(o.event){let[u]=await t("select id from events where name = $1 order by id limit 1",[o.event]);r=u?"\u65E2\u5B58\u306E\u30A4\u30D9\u30F3\u30C8":"\u65B0\u3057\u304F\u4F5C\u308B\u30A4\u30D9\u30F3\u30C8"}for(let{line:u,data:p}of o.records){let h=[],b=null;if(p.email?ja.test(p.email)||(b="error",h.push(`\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u300C${p.email}\u300D\u306E\u5F62\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093`)):(b="error",h.push("\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u304C\u7A7A\u6B04\u3067\u3059\uFF08\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3067\u4EBA\u3092\u898B\u5206\u3051\u307E\u3059\uFF09")),p.size_class&&!D.includes(p.size_class)&&(h.push(`\u4F01\u696D\u5206\u985E1\u300C${p.size_class}\u300D\u306F\u533A\u5206\uFF08${D.join("\u30FB")}\uFF09\u306B\u306A\u3044\u305F\u3081\u7A7A\u6B04\u306B\u3057\u307E\u3059`),p.size_class=""),o.event){let w=z[p.status]?p.status:p.status?ka[p.status]:"attended";w||(b="error",h.push(`\u53C2\u52A0\u72B6\u6CC1\u300C${p.status}\u300D\u306F ${Object.values(z).join("\u30FB")} \u306E\u3069\u308C\u304B\u306B\u3057\u3066\u304F\u3060\u3055\u3044`)),p.status=w??p.status}if(!b&&c.has(p.email)&&(b="skip",h.push(`\u3053\u306E\u30B7\u30FC\u30C8\u306E ${c.get(p.email)} \u884C\u76EE\u3068\u540C\u3058\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306A\u306E\u3067\u98DB\u3070\u3057\u307E\u3059`)),!b){let[w]=await t("select id from contacts where email = $1 and merged_into_id is null and archived_at is null",[p.email]),v=s.get(p.email);w?b="update":v?(b="update",h.push(`${v} \u3067\u8FFD\u52A0\u3055\u308C\u308B\u4EBA\u3067\u3059`)):p.full_name?(b="create",s.set(p.email,`\u30B7\u30FC\u30C8\u300C${o.name}\u300D${u}\u884C\u76EE`)):(b="error",h.push("\u767B\u9332\u3055\u308C\u3066\u3044\u306A\u3044\u4EBA\u306A\u306E\u3067\u3001\u6C0F\u540D\u304C\u5FC5\u8981\u3067\u3059")),o.event&&h.push(`\u300C${o.event}\u300D\u306B${z[p.status]}\u3068\u3057\u3066\u8A18\u9332\u3057\u307E\u3059`)}p.email&&c.set(p.email,u),a.push({sheet:o.name,event:o.event,line:u,data:p,action:b,notes:h})}let d=a.filter(u=>u.sheet===o.name),m=u=>d.filter(p=>p.action===u).length;n.push({name:o.name,kind:o.kind,event:o.event,eventNote:r,total:d.length,create:m("create"),update:m("update"),skip:m("skip"),error:m("error")})}let i=o=>a.filter(c=>c.action===o).length;return{rows:a,sheets:n,summary:{total:a.length,create:i("create"),update:i("update"),skip:i("skip"),error:i("error")}}}var U=t=>t||null;async function Ea(t,e){if(!e.org_name)return null;let s=ft(e.org_name),[a]=await t("select id from organizations where normalized_name = $1 limit 1",[s]),n=a?.id??(await t("insert into organizations (name, normalized_name) values ($1, $2) returning id",[e.org_name,s]))[0].id;return await t(`update organizations set location = coalesce($2, location), size_class = coalesce($3, size_class),
    industry = coalesce($4, industry), updated_at = now() where id = $1`,[n,U(e.location),U(e.size_class),U(e.industry)]),n}async function Ra(t,e,s){for(let a of zt(s)){let[n]=await t("select id from interests where name = $1",[a]),i=n?.id??(await t("insert into interests (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from interests)) returning id",[a]))[0].id;await t("insert into contact_interests (contact_id, interest_id, origin) values ($1, $2, 'staff') on conflict do nothing",[e,i])}}async function Oa(t,e){let[s]=await t("select id from events where name = $1 order by id limit 1",[e]);return s?.id??(await t("insert into events (name) values ($1) returning id",[e]))[0].id}async function ys(t,e){let s=e.staged.sheets.map(o=>({name:o.name,kind:o.kind,event:o.event,records:e.staged.rows.filter(c=>c.sheet===o.name).map(({line:c,data:r})=>({line:c,data:r}))})),{rows:a,summary:n}=await me(t,s),i=e.options;for(let o of a){if(o.action!=="create"&&o.action!=="update")continue;let c=o.data,r=await Ea(t,c),[d]=await t("select id from contacts where email = $1 and merged_into_id is null and archived_at is null",[c.email]),m=d?.id;if(!m)[{id:m}]=await t("insert into contacts (full_name, email, organization_id, department, job_title, job_level) values ($1,$2,$3,$4,$5,$6) returning id",[c.full_name,c.email,r,U(c.department),U(c.job_title),K(c.job_title)]);else{let[u]=await t(`update contacts set full_name = coalesce($2, full_name), organization_id = coalesce($3, organization_id),
        department = coalesce($4, department), job_title = coalesce($5, job_title), updated_at = now() where id = $1 returning job_title`,[m,U(c.full_name),r,U(c.department),U(c.job_title)]);await t("update contacts set job_level = $2 where id = $1",[m,K(u.job_title)])}await Ra(t,m,c.interests),o.event&&await t(`insert into event_participations (contact_id, event_id, status) values ($1, $2, $3)
        on conflict (contact_id, event_id) do update set status = excluded.status`,[m,await Oa(t,o.event),c.status]),await t("insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on, import_batch_id, raw) values ($1,$2,$3,$4,$5,$6,$7)",[m,o.event?"\u30A4\u30D9\u30F3\u30C8\u7533\u8FBC":i.source_kind,o.event??U(i.source_detail),i.consent_basis,U(i.acquired_on),e.id,JSON.stringify({sheet:o.sheet,line:o.line,...c})])}return await t(`update import_batches set status = 'done', applied_at = now(), staged = null,
    created_count = $2, updated_count = $3, skipped_count = $4 where id = $1`,[e.id,n.create,n.update,n.skip+n.error]),n}var X=new O,xs=["\u540D\u523A\u4EA4\u63DB","\u30A4\u30D9\u30F3\u30C8\u7533\u8FBC","\u554F\u3044\u5408\u308F\u305B","\u624B\u5165\u529B","\u305D\u306E\u4ED6"],ks={business_card:"\u540D\u523A\u306A\u3069\u66F8\u9762\u3067\u53D7\u3051\u53D6\u3063\u305F",opt_in:"\u30D5\u30A9\u30FC\u30E0\u7B49\u3067\u6848\u5185\u306E\u53D7\u4FE1\u306B\u540C\u610F",unknown:"\u4E0D\u660E\uFF08\u914D\u4FE1\u306E\u5BFE\u8C61\u306B\u3057\u306A\u3044\uFF09"},qa={create:l`<span class="pill ok">追加</span>`,update:l`<span class="pill info">更新</span>`,skip:l`<span class="pill">飛ばす</span>`,error:l`<span class="pill bad">エラー</span>`},pe=(t,e)=>String(t[e]??"").trim()||null;X.get("/",async t=>{let e=await f("select b.*, u.name from import_batches b left join staff_users u on u.id = b.imported_by order by b.id desc limit 20");return x(t,{title:"Excel \u304B\u3089\u53D6\u308A\u8FBC\u3080",active:"/contacts",flash:k(t),body:l`
<div><a href="/contacts" class="small">← 連絡先一覧</a><h1>Excel から取り込む</h1></div>
<p class="lead">事務局の Excel をそのまま取り込めます。取り込む前に確認画面が出るので、その時点ではまだ何も変わりません。</p>

<div class="grid2 split">
<form class="card" method="post" action="/contacts/import" enctype="multipart/form-data">
  <h2>1. ファイルと取り込み方を選ぶ</h2>
  ${$.demo?l`<div class="flash warn">確認用の画面なので、ファイルは選べません。下の「見本のデータで試す」で、架空のデータを使って取り込みの流れを試せます。</div>`:l`<label>Excel ファイル（.xlsx）<input type="file" id="file" name="file" accept=".xlsx" required></label>`}
  <fieldset><legend>全員に共通で記録すること</legend>
    <div class="grid2">
      <label>どこで知り合ったか<span class="hint">イベントのシートの人は「イベント申込」になります</span>
        <select id="source_kind" name="source_kind">${xs.map(s=>l`<option>${s}</option>`)}</select></label>
      <label>詳細<span class="hint">例：2026年度 名刺整理</span><input type="text" id="source_detail" name="source_detail"></label>
      <label>メールを送ってよい根拠<select id="consent_basis" name="consent_basis" required>
        <option value="">選んでください</option>${Object.entries(ks).map(([s,a])=>l`<option value="${s}">${a}</option>`)}</select></label>
      <label>日付<input type="date" id="acquired_on" name="acquired_on"></label>
    </div>
  </fieldset>
  <div class="row">${$.demo?l`<button formaction="/contacts/import/sample">見本のデータで試す</button>`:l`<button>確認画面へ</button>`}</div>
</form>

<div class="card"><h2>Excel の形</h2>
  <p class="small" style="margin:0"><b>人はメールアドレスで見分けます。</b>メールアドレスのない行は取り込みません。</p>
  <p class="small" style="margin:0"><b>シート「${ce}」</b>：連絡先の一覧です。1行目を見出しにして、次の列を並べます（順番は自由、太字は必須）。</p>
  <table><tbody>${Object.keys(Pt).filter(s=>s!=="\u53C2\u52A0\u72B6\u6CC1").map(s=>l`<tr><td class="small">${["\u6C0F\u540D","\u4F01\u696D\u30FB\u56E3\u4F53\u540D","\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9"].includes(s)?l`<b>${s}</b>`:s}</td></tr>`)}</tbody></table>
  <p class="small" style="margin:0"><b>それ以外のシート</b>：シート名のイベントの参加者一覧です。同じ列を使えます。必須は<b>メールアドレス</b>だけで、まだ登録されていない人には氏名も必要です。「参加状況」の列（申込・参加・欠席・キャンセル）があればそれを、なければ全員「参加」として記録します。そのイベントがまだなければ作ります。</p>
  <ul class="small" style="margin:0;padding-left:1.2em">
    <li>空欄のセルで、登録済みの値を消すことはしません。</li>
    <li>興味分類は「新規事業,リベラルアーツ」のようにカンマ区切りで書きます。登録済みの興味に足されます。</li>
    <li>部署・役職の「なし」は空欄として扱います。</li>
  </ul>
</div>
</div>

<div class="card"><h2>これまでの取り込み</h2>
  ${e.length?l`<div class="scroll"><table><thead><tr><th>日時</th><th>ファイル</th><th>担当</th><th>状態</th><th class="num">追加</th><th class="num">更新</th><th class="num">飛ばした</th></tr></thead><tbody>
  ${e.map(s=>l`<tr><td class="small">${q(s.imported_at)}</td><td><a href="/contacts/import/${s.id}">${s.filename}</a></td><td>${s.name??""}</td>
    <td>${s.status==="done"?l`<span class="pill ok">取り込み済み</span>`:s.status==="preview"?l`<span class="pill warn">確認中</span>`:l`<span class="pill">やめた</span>`}</td>
    <td class="num">${s.status==="done"?s.created_count:""}</td><td class="num">${s.status==="done"?s.updated_count:""}</td><td class="num">${s.status==="done"?s.skipped_count:""}</td></tr>`)}
  </tbody></table></div>`:l`<p class="muted">まだありません。</p>`}
</div>`})});function js(t){return{source_kind:xs.includes(t.source_kind)?t.source_kind:"\u305D\u306E\u4ED6",source_detail:pe(t,"source_detail"),consent_basis:pe(t,"consent_basis"),acquired_on:pe(t,"acquired_on")}}async function Ss(t,e,s,a){let n=s.map(d=>ws(d.name,d.rows)).filter(d=>d.records.length),i=n.filter(d=>!d.missing.length),o=n.filter(d=>d.missing.length).map(d=>({name:d.name,reason:`\u5FC5\u8981\u306A\u5217\u300C${d.missing.join("\u300D\u300C")}\u300D\u304C\u3042\u308A\u307E\u305B\u3093`}));if(!i.length)return g(t,o.length?`\u53D6\u308A\u8FBC\u3081\u308B\u30B7\u30FC\u30C8\u304C\u3042\u308A\u307E\u305B\u3093\u3002${o.map(d=>`\u30B7\u30FC\u30C8\u300C${d.name}\u300D\uFF1A${d.reason}`).join("\uFF0F")}`:"\u53D6\u308A\u8FBC\u3080\u884C\u304C\u3042\u308A\u307E\u305B\u3093\u3002","bad"),t.redirect("/contacts/import");i.sort((d,m)=>(d.kind==="customer"?-1:0)-(m.kind==="customer"?-1:0));let c={...await me(f,i),ignored:o},r=await _("insert into import_batches (filename, sheet_name, options, staged, imported_by, row_count) values ($1,$2,$3,$4,$5,$6) returning id",[e,i.map(d=>d.name).join("\u3001"),JSON.stringify(a),JSON.stringify(c),t.get("user").id,c.summary.total]);return t.redirect(`/contacts/import/${r.id}`)}X.post("/",async t=>{if($.demo)return t.text("\u78BA\u8A8D\u7528\u306E\u753B\u9762\u3067\u306F\u30D5\u30A1\u30A4\u30EB\u3092\u53D6\u308A\u8FBC\u3081\u307E\u305B\u3093\u3002",403);let e=await t.req.parseBody(),s=js(e);if(!s.consent_basis)return g(t,"\u300C\u30E1\u30FC\u30EB\u3092\u9001\u3063\u3066\u3088\u3044\u6839\u62E0\u300D\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002","bad"),t.redirect("/contacts/import");let a=e.file;if(!a||typeof a=="string"||!a.size)return g(t,"\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002","bad"),t.redirect("/contacts/import");let n;try{let{readXlsx:i}=await import("../xlsx-read.js");n=i(await a.arrayBuffer())}catch(i){return g(t,`\u30D5\u30A1\u30A4\u30EB\u3092\u8AAD\u3081\u307E\u305B\u3093\u3067\u3057\u305F\uFF08${i.message}\uFF09\u3002Excel \u3067\u300C.xlsx\u300D\u5F62\u5F0F\u3067\u4FDD\u5B58\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002`,"bad"),t.redirect("/contacts/import")}return Ss(t,a.name,n,s)});X.post("/sample",async t=>{if(!$.demo)return t.notFound();let e=await t.req.parseBody(),s=js(e);if(!s.consent_basis)return g(t,"\u300C\u30E1\u30FC\u30EB\u3092\u9001\u3063\u3066\u3088\u3044\u6839\u62E0\u300D\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002","bad"),t.redirect("/contacts/import");let a=await _("select c.full_name, c.email, o.name org from contacts c join organizations o on o.id = c.organization_id order by c.id limit 1"),i=[{name:"\u9867\u5BA2",rows:[["\u6C0F\u540D","\u4F01\u696D\u30FB\u56E3\u4F53\u540D","\u90E8\u7F72","\u5F79\u8077","\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9","\u56E3\u4F53\u6240\u5728\u5730","\u4F01\u696D\u5206\u985E1","\u4F01\u696D\u5206\u985E2","\u8208\u5473\u5206\u985E"],["\u898B\u672C \u4E00\u90CE","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u7269\u7523","\u7D4C\u55B6\u4F01\u753B\u90E8","\u4EE3\u8868\u53D6\u7DE0\u5F79","ichiro@example.jp","\u5E83\u5CF6\u770C\u5E83\u5CF6\u5E02\u4E2D\u533A","\u4E2D\u5805\u4F01\u696D","\u5378\u58F2","\u65B0\u898F\u4E8B\u696D,DX"],["\u898B\u672C \u4E8C\u90CE","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u7269\u7523","\u55B6\u696D\u90E8","\u8AB2\u9577","jiro@example.jp","\u5E83\u5CF6\u770C\u5E83\u5CF6\u5E02\u4E2D\u533A","\u4E2D\u5805\u4F01\u696D","\u5378\u58F2","\u4EBA\u6750\u80B2\u6210"],["\u898B\u672C \u4E09\u5B50","\u30B5\u30F3\u30D7\u30EB\u5927\u5B66","\u4EBA\u9593\u793E\u4F1A\u5B66\u90E8","\u51C6\u6559\u6388","mitsuko@example.jp","\u5E83\u5CF6\u770C\u6771\u5E83\u5CF6\u5E02","\u6559\u80B2\u6A5F\u95A2","\u6559\u80B2","\u30EA\u30D9\u30E9\u30EB\u30A2\u30FC\u30C4\u3001\u30BD\u30FC\u30B7\u30E3\u30EB\u30C7\u30B6\u30A4\u30F3"],[a.full_name,a.org,"\u65B0\u898F\u4E8B\u696D\u958B\u767A\u5BA4","\u30B7\u30CB\u30A2\u30DE\u30CD\u30FC\u30B8\u30E3\u30FC",a.email,"","","","\u65B0\u898F\u4E8B\u696D"],["\u898B\u672C \u4E94\u90CE","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u7269\u7523","\u55B6\u696D\u90E8","\u4E3B\u4EFB","jiro@example.jp","","","",""],["\u898B\u672C \u56DB\u90CE","\u30B5\u30F3\u30D7\u30EB\u5E02\u5F79\u6240\uFF08\u67B6\u7A7A\uFF09","\u306A\u3057","\u4E3B\u67FB","","\u5E83\u5CF6\u770C\u798F\u5C71\u5E02","\u305D\u306E\u4ED6","\u884C\u653F","\u5730\u57DF\u5171\u5275"],["\u898B\u672C \u516D\u5B50","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u98DF\u54C1","\u7DCF\u52D9\u90E8","\u4E00\u822C","rokuko@example","","\u96F6\u7D30","\u98DF\u54C1",""]]},{name:"\u65B0\u898F\u4E8B\u696D\u30BB\u30DF\u30CA\u30FC 2026\u79CB",rows:[["\u6C0F\u540D","\u4F01\u696D\u30FB\u56E3\u4F53\u540D","\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9","\u53C2\u52A0\u72B6\u6CC1","\u8208\u5473\u5206\u985E"],["\u898B\u672C \u4E00\u90CE","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u7269\u7523","ichiro@example.jp","\u53C2\u52A0","\u65B0\u898F\u4E8B\u696D"],["","",a.email,"\u53C2\u52A0",""],["\u898B\u672C \u4E03\u6D77","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u98DF\u54C1","nanami@example.jp","\u7533\u8FBC","\u65B0\u898F\u4E8B\u696D"],["","","shiranai@example.jp","\u53C2\u52A0",""],["\u898B\u672C \u516B\u90CE","\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u98DF\u54C1","hachiro@example.jp","\u898B\u5B66",""]]}];return Ss(t,"\u898B\u672C\u30C7\u30FC\u30BF\uFF08\u67B6\u7A7A\uFF09.xlsx",i,s)});X.get("/:id{[0-9]+}",async t=>{let e=await _("select b.*, u.name from import_batches b left join staff_users u on u.id = b.imported_by where b.id = $1",[t.req.param("id")]);if(!e)return t.notFound();let s=e.options,a=l`<div><a href="/contacts/import" class="small">← Excel から取り込む</a><h1>${e.filename}</h1>
    <div class="muted small">${e.row_count}行・${e.name??""}さん・${q(e.imported_at)}</div></div>
    <div class="small">全員に記録すること：${s.source_kind}${s.source_detail?`\uFF08${s.source_detail}\uFF09`:""}／送ってよい根拠：${ks[s.consent_basis]}${s.acquired_on?`\uFF0F${s.acquired_on}`:""}</div>`;if(e.status!=="preview")return x(t,{title:e.filename,active:"/contacts",flash:k(t),body:l`${a}<div class="card">${e.status==="done"?l`<h2>取り込み済み</h2><div class="row" style="gap:32px">
            <div><div class="muted small">追加</div><div class="big">${e.created_count}</div></div>
            <div><div class="muted small">更新</div><div class="big">${e.updated_count}</div></div>
            <div><div class="muted small">飛ばした・エラー</div><div class="big">${e.skipped_count}</div></div></div>
            <div class="row"><a href="/contacts">連絡先一覧を見る</a><a href="/masters">イベントを見る</a></div>`:l`<p class="muted">この取り込みはやめました。データは何も変わっていません。</p>`}</div>`});let{rows:n,summary:i,sheets:o,ignored:c=[]}=e.staged,r={error:0,skip:1,update:2,create:3},d=[...n].sort((m,u)=>r[m.action]-r[u.action]).slice(0,500);return x(t,{title:e.filename,active:"/contacts",flash:k(t),body:l`${a}
<div class="card"><h2>2. 内容を確認する</h2>
  <p class="small muted" style="margin:0">まだ何も変わっていません。内容を確かめてから「取り込む」を押してください。エラーと飛ばす行は取り込まれません。</p>
  <div class="scroll"><table>
    <thead><tr><th>シート</th><th>扱い</th><th class="num">追加</th><th class="num">更新</th><th class="num">飛ばす</th><th class="num">エラー</th></tr></thead>
    <tbody>${o.map(m=>l`<tr><td>${m.name}</td>
      <td class="small">${m.kind==="customer"?"\u9023\u7D61\u5148\u306E\u4E00\u89A7":l`イベント「${m.event}」の参加者 <span class="pill ${m.eventNote==="\u65B0\u3057\u304F\u4F5C\u308B\u30A4\u30D9\u30F3\u30C8"?"warn":""}">${m.eventNote}</span>`}</td>
      <td class="num">${m.create}</td><td class="num">${m.update}</td><td class="num">${m.skip}</td><td class="num" style="color:${m.error?"var(--bad)":"inherit"}">${m.error}</td></tr>`)}
    <tr><td><b>合計</b></td><td></td><td class="num"><b>${i.create}</b></td><td class="num"><b>${i.update}</b></td><td class="num"><b>${i.skip}</b></td><td class="num"><b>${i.error}</b></td></tr></tbody>
  </table></div>
  ${c.length?l`<div class="flash warn">読まなかったシート：${c.map(m=>`\u300C${m.name}\u300D\uFF08${m.reason}\uFF09`).join("\u3001")}</div>`:""}
  <div class="row">
    <form method="post" action="/contacts/import/${e.id}/apply"><button ${i.create+i.update===0?"disabled":""}>取り込む（追加${i.create}件・更新${i.update}件）</button></form>
    <form method="post" action="/contacts/import/${e.id}/cancel"><button class="sub">やめる</button></form>
  </div>
  ${i.error?l`<p class="small" style="margin:0">エラーの行を直したいときは、Excel を直してから最初からやり直してください。</p>`:""}
</div>
<div class="card"><div class="scroll"><table>
  <thead><tr><th>シート</th><th class="num">行</th><th>判定</th><th>氏名</th><th>企業・団体名</th><th>メールアドレス</th><th>メモ</th></tr></thead>
  <tbody>${d.map(m=>l`<tr><td class="small">${m.sheet}</td><td class="num small">${m.line}</td><td>${qa[m.action]}</td><td>${m.data.full_name}</td>
    <td class="small">${m.data.org_name}</td><td class="small">${m.data.email}</td><td class="small">${m.notes.join("\u3002")}</td></tr>`)}</tbody>
</table></div>${n.length>d.length?l`<p class="small muted">${n.length}行のうち${d.length}行を表示しています（エラー・飛ばす行が先）。</p>`:""}</div>`})});X.post("/:id{[0-9]+}/apply",async t=>{let e=Number(t.req.param("id")),s=await _("select * from import_batches where id = $1 and status = 'preview'",[e]);if(!s)return t.redirect(`/contacts/import/${e}`);let a=await A(n=>ys(n,s));return await y(t,"import.apply","import",e,a),g(t,`\u53D6\u308A\u8FBC\u307F\u307E\u3057\u305F\uFF1A\u8FFD\u52A0${a.create}\u4EF6\u30FB\u66F4\u65B0${a.update}\u4EF6${a.skip+a.error?`\uFF08${a.skip+a.error}\u884C\u306F\u98DB\u3070\u3057\u307E\u3057\u305F\uFF09`:""}\u3002`),t.redirect(`/contacts/import/${e}`)});X.post("/:id{[0-9]+}/cancel",async t=>{let e=Number(t.req.param("id"));return await f("update import_batches set status = 'cancelled', staged = null where id = $1 and status = 'preview'",[e]),g(t,"\u53D6\u308A\u8FBC\u307F\u3092\u3084\u3081\u307E\u3057\u305F\u3002\u30C7\u30FC\u30BF\u306F\u5909\u308F\u3063\u3066\u3044\u307E\u305B\u3093\u3002","warn"),t.redirect("/contacts/import")});var Es=X;function Rs(){let t=new O;Ie(t);for(let e of["/contacts","/segments","/campaigns","/masters","/outbox","/admin"])t.use(e,se),t.use(`${e}/*`,se);return t.use("/admin",ae),t.use("/admin/*",ae),t.get("/",e=>e.redirect("/contacts")),t.route("/contacts/import",Es),t.route("/contacts",Je),t.route("/segments",Xe),t.route("/campaigns",$.sendMode==="export"?os:fs),$.sendMode==="outbox"&&t.route("/outbox",gs),t.route("/masters",$s),t.route("/admin",vs),t.onError((e,s)=>(console.error(e),s.text(`\u30A8\u30E9\u30FC\u304C\u8D77\u304D\u307E\u3057\u305F\uFF1A${e.message}`,500))),t}async function Os(t){let e=42,s=()=>(e=(e*1103515245+12345)%2147483648)/2147483648,a=v=>v[Math.floor(s()*v.length)],n=v=>s()<v,i=["\u4F50\u85E4","\u9234\u6728","\u9AD8\u6A4B","\u7530\u4E2D","\u4F0A\u85E4","\u6E21\u8FBA","\u5C71\u672C","\u4E2D\u6751","\u5C0F\u6797","\u52A0\u85E4","\u5409\u7530","\u5C71\u7530","\u677E\u672C","\u4E95\u4E0A","\u6728\u6751","\u6797","\u6E05\u6C34","\u68EE","\u6C60\u7530","\u6A4B\u672C","\u85E4\u4E95","\u5CA1\u7530","\u6751\u4E0A","\u539F\u7530"],o=["\u5927\u8F14","\u5065\u592A","\u7FD4","\u76F4\u6A39","\u967D\u5B50","\u7F8E\u7A42","\u6075","\u4EAE","\u771F\u7531\u7F8E","\u8AA0","\u7531\u7D00","\u62D3\u4E5F","\u5F69","\u6D69\u4E8C","\u88D5\u5B50","\u9686"],c=[["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u81EA\u52D5\u8ECA","\u5927\u4F01\u696D","\u81EA\u52D5\u8ECA"],["\u30B5\u30F3\u30D7\u30EB\u96FB\u529B\u682A\u5F0F\u4F1A\u793E","\u5927\u4F01\u696D","\u96FB\u529B"],["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u7CBE\u6A5F","\u4E2D\u5805\u4F01\u696D","\u7CBE\u5BC6\u6A5F\u5668"],["\u30B5\u30F3\u30D7\u30EB\u4EA4\u901A\u682A\u5F0F\u4F1A\u793E","\u5927\u4F01\u696D","\u9244\u9053\u30FB\u30D0\u30B9"],["\u30B5\u30F3\u30D7\u30EB\u30AD\u30E3\u30D4\u30BF\u30EB\u682A\u5F0F\u4F1A\u793E","\u4E2D\u5805\u4F01\u696D","\u305D\u306E\u4ED6\u91D1\u878D"],["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u30B3\u30F3\u30B5\u30EB\u30C6\u30A3\u30F3\u30B0","\u4E2D\u5C0F\u4F01\u696D","\u30B5\u30FC\u30D3\u30B9"],["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u30C7\u30B6\u30A4\u30F3","\u5C0F\u898F\u6A21\u4E8B\u696D\u8005","\u30B5\u30FC\u30D3\u30B9"],["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u90E8\u54C1","\u4E2D\u5C0F\u4F01\u696D","\u81EA\u52D5\u8ECA"],["\u30B5\u30F3\u30D7\u30EB\u7DCF\u7814\u682A\u5F0F\u4F1A\u793E","\u4E2D\u5805\u4F01\u696D","\u30B5\u30FC\u30D3\u30B9"],["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u65C5\u884C","\u5927\u4F01\u696D","\u30B5\u30FC\u30D3\u30B9"],["\u30B5\u30F3\u30D7\u30EB\u798F\u7949\u682A\u5F0F\u4F1A\u793E","\u4E2D\u5C0F\u4F01\u696D","\u30B5\u30FC\u30D3\u30B9"],["\u30B5\u30F3\u30D7\u30EB\u5B66\u5712","\u6559\u80B2\u6A5F\u95A2","\u6559\u80B2"],["\u30B5\u30F3\u30D7\u30EB\u5927\u5B66","\u6559\u80B2\u6A5F\u95A2","\u6559\u80B2"],["\u682A\u5F0F\u4F1A\u793E\u30B5\u30F3\u30D7\u30EB\u30E9\u30DC","\u5C0F\u898F\u6A21\u4E8B\u696D\u8005","\u60C5\u5831\u901A\u4FE1"],["\u30B5\u30F3\u30D7\u30EB\u30B7\u30B9\u30C6\u30E0\u30BA\u682A\u5F0F\u4F1A\u793E","\u4E2D\u5805\u4F01\u696D","\u60C5\u5831\u901A\u4FE1"]],r=["\u5E83\u5CF6\u770C\u5E83\u5CF6\u5E02\u4E2D\u533A","\u5E83\u5CF6\u770C\u5E83\u5CF6\u5E02\u5357\u533A","\u5E83\u5CF6\u770C\u5E83\u5CF6\u5E02\u6771\u533A","\u5E83\u5CF6\u770C\u5B89\u82B8\u90E1\u5E9C\u4E2D\u753A","\u5E83\u5CF6\u770C\u6771\u5E83\u5CF6\u5E02","\u5E83\u5CF6\u770C\u798F\u5C71\u5E02","\u5CA1\u5C71\u770C\u5CA1\u5C71\u5E02\u5317\u533A","\u6771\u4EAC\u90FD\u6E2F\u533A","\u6771\u4EAC\u90FD\u4E2D\u592E\u533A"],d=["\u7D4C\u55B6\u4F01\u753B\u90E8","\u65B0\u898F\u4E8B\u696D\u958B\u767A\u5BA4","\u4EBA\u4E8B\u90E8","\u7814\u7A76\u958B\u767A\u672C\u90E8","\u55B6\u696D\u90E8","\u30C7\u30B6\u30A4\u30F3\u672C\u90E8","\u5730\u57DF\u5171\u5275\u672C\u90E8","\u8CFC\u8CB7\u672C\u90E8",null],m=["\u4EE3\u8868\u53D6\u7DE0\u5F79","\u53D6\u7DE0\u5F79","\u90E8\u9577","\u6B21\u9577","\u8AB2\u9577","\u30DE\u30CD\u30FC\u30B8\u30E3\u30FC","\u30B7\u30CB\u30A2\u30DE\u30CD\u30FC\u30B8\u30E3\u30FC","\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u30DE\u30CD\u30FC\u30B8\u30E3\u30FC","\u4E3B\u4EFB","\u4E3B\u67FB","\u4E00\u822C","\u652F\u5E97\u9577","\u7814\u7A76\u54E1","\u9867\u554F",null],u=["\u65B0\u898F\u4E8B\u696D","\u30EA\u30D9\u30E9\u30EB\u30A2\u30FC\u30C4","DX","\u4EBA\u6750\u80B2\u6210","\u7D44\u7E54\u958B\u767A","\u30BD\u30FC\u30B7\u30E3\u30EB\u30C7\u30B6\u30A4\u30F3","\u5730\u57DF\u5171\u5275","\u30B5\u30B9\u30C6\u30CA\u30D3\u30EA\u30C6\u30A3"],p=["\u6559\u54E1A","\u6559\u54E1B","\u6559\u54E1C","\u6559\u54E1D"];await t(`insert into staff_users (entra_object_id, name, email, role) values
    ('dev-1', '\u4E8B\u52D9\u30B9\u30BF\u30C3\u30D5A', 'staff-a@example.jp', 'operator'),
    ('dev-2', '\u4E8B\u52D9\u30B9\u30BF\u30C3\u30D5B', 'staff-b@example.jp', 'operator'),
    ('dev-3', '\u7BA1\u7406\u8005', 'admin@example.jp', 'admin')`);for(let[v,S]of u.entries())await t("insert into interests (name, sort_order) values ($1, $2)",[S,v+1]);let h=[["DX\u63A8\u9032\u30BB\u30DF\u30CA\u30FC 2025","\u30BB\u30DF\u30CA\u30FC","2025-06-14","\u30CF\u30A4\u30D6\u30EA\u30C3\u30C9",[3,1]],["\u7D44\u7E54\u958B\u767A\u30EF\u30FC\u30AF\u30B7\u30E7\u30C3\u30D7","\u30EF\u30FC\u30AF\u30B7\u30E7\u30C3\u30D7","2025-09-20","\u5BFE\u9762",[5,4]],["\u30BD\u30FC\u30B7\u30E3\u30EB\u30C7\u30B6\u30A4\u30F3\u30FB\u30B7\u30F3\u30DD\u30B8\u30A6\u30E0","\u30B7\u30F3\u30DD\u30B8\u30A6\u30E0","2025-12-06","\u5BFE\u9762",[6,7]],["\u30EA\u30D9\u30E9\u30EB\u30A2\u30FC\u30C4\u516C\u958B\u8B1B\u5EA7","\u8B1B\u5EA7","2026-02-21","\u30AA\u30F3\u30E9\u30A4\u30F3",[2]],["\u5730\u57DF\u4F01\u696D\u4EA4\u6D41\u4F1A 2026\u6625","\u4EA4\u6D41\u4F1A","2026-05-16","\u5BFE\u9762",[7,1]],["\u65B0\u898F\u4E8B\u696D\u5275\u51FA\u30D7\u30ED\u30B0\u30E9\u30E0 \u8AAC\u660E\u4F1A","\u30BB\u30DF\u30CA\u30FC","2026-07-11","\u30CF\u30A4\u30D6\u30EA\u30C3\u30C9",[1,8]]];for(let[v,S,R,I]of h)await t("insert into events (name, kind, held_on, format) values ($1,$2,$3,$4)",[v,S,R,I]);let b=[];for(let[v,S,R]of c){let[I]=await t("insert into organizations (name, normalized_name, location, size_class, industry) values ($1,$2,$3,$4,$5) returning id",[v,ft(v),a(r),S,R]);b.push(I.id)}let w=new Set;for(let v=1;v<=320;v++){let S=`user${v}@${a(["example.com","example.jp"])}`;if(w.has(S))continue;w.add(S);let[R]=await t("insert into contacts (full_name, email, organization_id, department, job_title) values ($1,$2,$3,$4,$5) returning id",[`${a(i)} ${a(o)}`,S,a(b),a(d),a(m)]),I=n(.55);await t("insert into contact_sources (contact_id, source_kind, source_detail, consent_basis, acquired_on) values ($1,$2,$3,$4,$5)",[R.id,I?"\u540D\u523A\u4EA4\u63DB":"\u30A4\u30D9\u30F3\u30C8\u7533\u8FBC",I?`${a(p)}\u3068\u540D\u523A\u4EA4\u63DB`:a(h)[0],n(.06)?"unknown":I?"business_card":"opt_in",`2025-0${1+Math.floor(s()*9)}-1${Math.floor(s()*9)}`]);for(let[V,Y]of h.entries())if(n(.22)){let F=n(.78)?"attended":a(["applied","absent","cancelled"]);if(await t("insert into event_participations (contact_id, event_id, status) values ($1,$2,$3)",[R.id,V+1,F]),F==="attended"&&n(.6))for(let $t of Y[4])await t("insert into contact_interests (contact_id, interest_id, origin) values ($1,$2,'event') on conflict do nothing",[R.id,$t])}n(.3)&&await t("insert into contact_interests (contact_id, interest_id, origin) values ($1,$2,'self_reported') on conflict do nothing",[R.id,1+Math.floor(s()*u.length)]),S&&n(.03)&&await t("insert into suppressions (email, reason) values ($1, $2)",[S,a(["unsubscribe","hard_bounce"])])}await Tt(t),await t(`insert into segments (name, definition, created_by) values
    ('DX\u30BB\u30DF\u30CA\u30FC\u53C2\u52A0\u8005', $1, 3), ('\u65B0\u898F\u4E8B\u696D\u306B\u95A2\u5FC3\u306E\u3042\u308B\u5927\u4F01\u696D\u30FB\u4E2D\u5805\u4F01\u696D', $2, 3)`,[JSON.stringify({events:[1],event_status:["attended"]}),JSON.stringify({interests:[1],size_classes:["\u5927\u4F01\u696D","\u4E2D\u5805\u4F01\u696D"]})])}var qs="sdc-demo-v8",ue="sdc-demo-cookies",lt={get(t){try{return localStorage.getItem(t)}catch{return null}},set(t,e){try{localStorage.setItem(t,e)}catch{}},del(t){try{localStorage.removeItem(t)}catch{}}};lt.get("sdc-demo-reset")&&(lt.del("sdc-demo-reset"),lt.del(ue),await new Promise(t=>{let e=indexedDB.deleteDatabase(`/pglite/${qs}`);e.onsuccess=e.onerror=e.onblocked=t}));ge({schema:he,pglite:await import("./pglite/index.js"),citext:await import("./pglite/contrib/citext.js"),dataDir:`idb://${qs}`});try{let[{n:t}]=await f("select count(*)::int n from staff_users");t===0?await A(e=>Os(e)):await Tt(f)}catch(t){throw document.getElementById("boot-err").textContent=`\u6E96\u5099\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF1A${t.message}`,t}var Aa=Rs(),It=new Map(Object.entries(JSON.parse(lt.get(ue)??"{}")));function Ta(t){if(t){for(let e of t.split(/,\s*(?=[A-Za-z0-9_-]+=)/)){let[s,...a]=e.split(";"),n=s.indexOf("="),i=s.slice(0,n).trim(),o=s.slice(n+1).trim();!o||a.some(c=>/max-age=0/i.test(c))?It.delete(i):It.set(i,o)}lt.set(ue,JSON.stringify(Object.fromEntries(It)))}}var za=()=>[...It].map(([t,e])=>`${t}=${e}`).join("; ");async function As(t,e={}){for(let s=0;s<5;s++){let a=new Headers(e.headers);a.set("x-cookie",za());let n=await Aa.request(t,{...e,headers:a});if(Ta(n.headers.get("x-set-cookie")),n.status>=300&&n.status<400&&n.headers.get("location")){t=n.headers.get("location"),e={};continue}return{path:t,res:n}}throw new Error("\u8EE2\u9001\u304C\u591A\u3059\u304E\u307E\u3059")}var Ca=window.fetch.bind(window);window.fetch=async(t,e)=>{let s=typeof t=="string"?t:t.url;return s.startsWith("/")?(await As(s,e)).res:Ca(t,e)};var _t=null;async function dt(t,e,{push:s=!0}={}){let{path:a,res:n}=await As(t,e),i=n.headers.get("content-disposition")??"";if(i.startsWith("attachment")){let d=decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(i)?.[1]??"download"),m=Object.assign(document.createElement("a"),{href:URL.createObjectURL(await n.blob()),download:d});return m.click(),setTimeout(()=>URL.revokeObjectURL(m.href),1e4),dt(_t,void 0,{push:!1})}let o=n.headers.get("content-type")??"",c=await n.text(),r=o.includes("html")?new DOMParser().parseFromString(c,"text/html"):null;if(r){document.title=r.title,document.head.querySelectorAll("style").forEach(d=>d.remove()),r.head.querySelectorAll("style").forEach(d=>document.head.append(d)),document.body.replaceChildren(...r.body.childNodes);for(let d of document.body.querySelectorAll("script")){let m=document.createElement("script");m.textContent=`{${d.textContent}}`,d.replaceWith(m)}}else{let d=document.createElement("pre");d.style.cssText="padding:24px;white-space:pre-wrap",d.textContent=c,document.body.replaceChildren(d)}_t=a,s&&location.hash!==`#${a}`?history.pushState(null,"",`#${a}`):s||history.replaceState(null,"",`#${a}`),e||window.scrollTo(0,0)}document.addEventListener("click",t=>{if(t.target.closest("#demo-reset")){lt.set("sdc-demo-reset","1"),location.hash="",location.reload();return}let e=t.target.closest("a[href]"),s=e?.getAttribute("href");!s||!(s.startsWith("/")||s.startsWith("?"))||e.target||t.metaKey||t.ctrlKey||(t.preventDefault(),dt(s.startsWith("?")?`${_t.split("?")[0]}${s}`:s))});document.addEventListener("submit",t=>{let e=t.target;t.preventDefault();let s=t.submitter?.getAttribute("formaction")||e.getAttribute("action")||_t.split("?")[0],a=new URLSearchParams(new FormData(e));(e.getAttribute("method")??"get").toLowerCase()==="post"?dt(s,{method:"POST",body:a}):dt(`${s}?${a}`)});window.addEventListener("popstate",()=>{let t=location.hash.slice(1)||"/";t!==_t&&dt(t,void 0,{push:!1})});await dt(location.hash.slice(1)||"/",void 0,{push:!1});
