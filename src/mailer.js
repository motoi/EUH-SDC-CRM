// 直接送るときの送信部分（送り方が 'graph' か 'outbox' のとき）。send({ to, subject, text, deliveryId }) だけを外に出す。
//   outbox：実際には送らず outbox_messages に保存する（操作の確認用）
//   graph ：Microsoft Graph で共有メールボックスから送る（情シスのアプリ登録。送れる範囲は共有メールボックスだけに制限してもらう）
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

// メールをまるごと組み立てて（MIME 形式）渡す。件名と本文を UTF-8 に固定するため。
// JSON で本文だけ渡すと Exchange が日本語を iso-2022-jp に変換し、Gmail で「英語で書かれているようです」と出て末尾が省略表示された（送信テストF・H・J）
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ');
export function mime({ to, subject, text, deliveryId }) {
  return [
    `From: ${config.fromAddress}`,
    `To: ${oneLine(to)}`,
    `Subject: =?UTF-8?B?${b64(oneLine(subject))}?=`,
    'MIME-Version: 1.0',
    // 戻ってきた不達メールと配信を突き合わせるのに使う
    `X-SDC-Delivery: ${oneLine(deliveryId ?? 'test')}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text.replace(/\r?\n/g, '\r\n')).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

const graph = {
  async send({ to, subject, text, deliveryId }) {
    // MIME 形式では「送信済みに残さない」を指定できないので、共有メールボックスの送信済みアイテムに1通ずつ残る
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.fromAddress)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'text/plain' },
      body: b64(mime({ to, subject, text, deliveryId })),
    });
    if (res.status === 202) return { id: null };
    const detail = await res.text();
    if (res.status === 429 || res.status === 503) {
      throw new RetryLater(`Graph が混雑（${res.status}）`, Number(res.headers.get('retry-after') ?? 60) * 1000);
    }
    throw new Error(`Graph 送信に失敗（${res.status}）: ${detail.slice(0, 300)}`);
  },
};

export const mailer = config.sendMode === 'graph' ? graph : outbox;
