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
