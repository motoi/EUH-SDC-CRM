// 環境変数で上書きできる設定。本番では .env などで与える。
const env = typeof process === 'undefined' ? {} : process.env;
// 確認用サイト：ブラウザ内で動き、ダミーデータだけを使い、メールは送らない
const demo = typeof process === 'undefined' || env.DEMO === '1';

export const config = {
  demo,
  port: Number(env.PORT ?? 3000),
  baseUrl: env.PUBLIC_BASE_URL ?? (demo ? 'https://（このシステムのURL）' : `http://localhost:${env.PORT ?? 3000}`),

  // 'dev'：画面で利用者を選ぶだけのログイン（ローカル確認用）。'entra'：M365 でログイン（未実装）
  authMode: env.AUTH_MODE ?? 'dev',

  // 'outbox'：.outbox/ にファイルとして保存するだけで実際には送らない。'graph'：Microsoft Graph で送る
  mailer: demo ? 'outbox' : (env.MAILER ?? 'outbox'),
  fromAddress: env.MAIL_FROM ?? 'social-design-center@eikei.ac.jp',
  graph: {
    tenantId: env.GRAPH_TENANT_ID,
    clientId: env.GRAPH_CLIENT_ID,
    clientSecret: env.GRAPH_CLIENT_SECRET,
  },

  // 流量。M365 の上限（約30通/分、1日あたり約1万受信者）よりかなり低く抑える
  sendPerMinute: Number(env.SEND_PER_MINUTE ?? 10),
  sendPerDay: Number(env.SEND_PER_DAY ?? 1500),
  // 何秒ごとに送信待ちを確認するか。確認用サイトでは動きが見えるよう短くする
  sendTickSeconds: Number(env.SEND_TICK_SECONDS ?? (demo ? 5 : 60)),

  // 特定電子メール法で必要な送信者表示（名称・住所・問い合わせ先）。全メールの末尾に付く
  footer: {
    sender: '叡啓大学',
    contact: 'social-design-center@eikei.ac.jp',
    signature: [
      '広島県公立大学法人　叡啓大学',
      '価値創造ブランド推進課（社会連携係）',
      '〒730-0016　広島市中区幟町1-5',
      'TEL：082-225-6312',
      'Mail：social-design-center@eikei.ac.jp',
    ],
  },
};
