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

  fromAddress: env.MAIL_FROM ?? 'social-design-center@eikei.ac.jp',

  // 送り方。'export'：送信ファイル（Excel）を書き出し、Power Automate で送る（アプリ登録なしで使える）
  //         'graph' ：CRM が Microsoft Graph で共有メールボックスから直接送る（.env に情シスのアプリ登録の値が要る）
  //         'outbox'：直接送る流れを、実際には送らずに試す（送信箱に保存するだけ）
  sendMode: demo ? 'export' : (env.SEND_MODE ?? 'export'),
  graph: {
    tenantId: env.GRAPH_TENANT_ID,
    clientId: env.GRAPH_CLIENT_ID,
    clientSecret: env.GRAPH_CLIENT_SECRET,
  },
  // 直接送るときの流量。M365 の上限（1分30通、1日1万受信者）よりかなり低く抑える
  sendPerMinute: Number(env.SEND_PER_MINUTE ?? 10),
  sendPerDay: Number(env.SEND_PER_DAY ?? 1500),
  sendTickSeconds: Number(env.SEND_TICK_SECONDS ?? 60),

  // 送信は Power Automate が行う。CRM が書き出すファイルの名前・テーブル名と、それを読むフローの名前
  // （フローは共有フォルダーのこのファイルを読むので、名前を変えるときはフローも直す）
  sendFile: { name: '配信.xlsx', table: '送信', flow: 'SDC配信の送信' },

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
