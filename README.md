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
- `gas/`：比較用の Google スプレッドシート版（名簿と配信の準備をスプレッドシートで行い、複数人で使える）。設置手順は `gas/README.md`
- `docs/`：操作テスト・送信テストの手順、開発ボード

## 送り方の切り替え

`.env` の `SEND_MODE` で選ぶ（`.env` は GitHub に上がらない。`npm run dev` / `npm start` が読み込む）。

| SEND_MODE | 送り方 | 必要なもの |
|---|---|---|
| `export`（既定） | 送信ファイル（Excel）を書き出し、Power Automate で送る | Power Automate のフロー（`docs/power-automate-flow.md`） |
| `graph` | CRM が Microsoft Graph で共有メールボックスから直接、予約した時刻に1分10通ずつ送る | 情シスのアプリ登録（`GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET`）。**送れる範囲を social-design-center@ だけに制限してもらってから使う** |
| `outbox` | `graph` と同じ画面と流れで、実際には送らず「送信箱（確認用）」に保存する | なし |

どちらの形でも、配信停止は本文末尾の案内（「配信停止」と返信）で受け付け、担当者が連絡先の画面で止める。

送信テストの記録は `docs/send-test.md`。
