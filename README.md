# SDC配信

叡啓大学 社会連携係の、名刺・イベント参加者向けメール配信システム。連絡先・配信先リスト・配信・イベント/興味の4画面を持つ。

メールを送るのは Power Automate。CRM は送り先ごとの文面を入れた送信ファイル（Excel、テーブル「送信」）を書き出し、担当者がチームの共有フォルダー（Teams など）の「配信.xlsx」と置き換えてフローを実行する。フローは大学 M365 の共有メールボックス（social-design-center@eikei.ac.jp）から1通ずつ間をあけて送り、各行の「状態」に「送信済み」と書く。CRM は書き出した時点で送信済みとして記録し、途中で止まったときだけ共有フォルダーのファイルを取り込んで送り残しを戻す。情報システム部門へのアプリ登録の依頼は不要。

**実在の個人情報（名刺・参加者リストなど）は、このリポジトリにも確認用サイトにも絶対に入れない。** 手元のデータは `.data/` など `.gitignore` 済みの場所にだけ置く。

## 手元で動かす

```bash
npm install
npm run seed    # ダミーデータ（架空の320人）で作り直す
npm run dev     # http://localhost:3000
npm test
```

CRM 自体はメールを送らない。

## 確認用サイト

サーバーなしで、見る人のブラウザの中だけで動く版。データは架空で各自のブラウザにだけ保存され、メールは送らない。

```bash
npm run build:demo   # site/ を作る
npm run deploy:demo  # site/ を gh-pages ブランチに置く
```

## 構成

- `db/schema.sql`：PostgreSQL のスキーマ（開発時は組み込みの PGlite）
- `src/`：画面（Hono のサーバー側描画）、Excel の読み書き（`xlsx-read.js` / `xlsx-write.js`）
- `demo/`：確認用サイトの入口
- `docs/`：操作テスト・送信テストの手順、開発ボード

## 本番で送るとき

Power Automate のフローの作り方は `docs/power-automate-flow.md`。送信テストの記録は `docs/send-test.md`。
