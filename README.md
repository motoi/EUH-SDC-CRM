# SDC配信

叡啓大学 社会連携係の、名刺・イベント参加者向けメール配信システム。連絡先・配信先リスト・配信・イベント/興味の4画面と、流量を抑えて送る送信ワーカー、配信停止ページを持つ。送信は大学 M365 の共有メールボックス（social-design-center@eikei.ac.jp）から Microsoft Graph で行う。

**実在の個人情報（名刺・参加者リストなど）は、このリポジトリにも確認用サイトにも絶対に入れない。** 手元のデータは `.data/` など `.gitignore` 済みの場所にだけ置く。

## 手元で動かす

```bash
npm install
npm run seed    # ダミーデータ（架空の320人）で作り直す
npm run dev     # http://localhost:3000
npm test
```

初期設定ではメールを実際には送らず、画面の「送信箱（確認用）」に保存する。

## 確認用サイト

サーバーなしで、見る人のブラウザの中だけで動く版。データは架空で各自のブラウザにだけ保存され、メールは送らない。

```bash
npm run build:demo   # site/ を作る
npm run deploy:demo  # site/ を gh-pages ブランチに置く
```

## 構成

- `db/schema.sql`：PostgreSQL のスキーマ（開発時は組み込みの PGlite）
- `src/`：画面（Hono のサーバー側描画）、送信ワーカー、送信方式（outbox / graph）
- `demo/`：確認用サイトの入口
- `docs/`：操作テスト・送信テストの手順、開発ボード

## 本番で送るとき

`.env` に `MAILER=graph` と、情報システム部門から受け取る `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` を設定する。手順は `docs/send-test.md`。
