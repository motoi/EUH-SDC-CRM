// 送信部分。差し替えられるように send({ to, subject, text, deliveryId }) だけを外に出す。
//   outbox：実際には送らず outbox_messages に保存する（ローカル確認・操作テスト用）
//   graph ：Microsoft Graph で共有メールボックスから送る（情シスのアプリ登録が必要）
import { one } from './db.js';
import { config } from './config.js';

export class RetryLater extends Error {
  constructor(message, waitMs) { super(message); this.waitMs = waitMs; }
}

const outbox = {
  async send({ to, subject, text, deliveryId }) {
    const r = await one(`insert into outbox_messages (to_address, subject, body_text, delivery_ref) values ($1, $2, $3, $4) returning id`,
      [to, subject, text, String(deliveryId ?? 'test')]);
    return { id: `outbox-${r.id}` };
  },
};

let token = null;
async function graphToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const { tenantId, clientId, clientSecret } = config.graph;
  if (!tenantId || !clientId || !clientSecret) throw new Error('GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET が設定されていません');
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`トークン取得に失敗: ${j.error_description ?? res.status}`);
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

const graph = {
  async send({ to, subject, text, deliveryId }) {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.fromAddress)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: text },
          toRecipients: [{ emailAddress: { address: to } }],
          // Graph で付けられるのは x- で始まる独自ヘッダーだけ。戻ってきた不達メールと配信を突き合わせるのに使う
          internetMessageHeaders: [{ name: 'X-SDC-Delivery', value: String(deliveryId ?? 'test') }],
        },
        saveToSentItems: false,   // 問い合わせ窓口の送信済みフォルダーを埋めない
      }),
    });
    if (res.status === 202) return { id: null };
    const detail = await res.text();
    if (res.status === 429 || res.status === 503) {
      throw new RetryLater(`Graph が混雑（${res.status}）`, Number(res.headers.get('retry-after') ?? 60) * 1000);
    }
    throw new Error(`Graph 送信に失敗（${res.status}）: ${detail.slice(0, 300)}`);
  },
};

export const mailer = config.mailer === 'graph' ? graph : outbox;
