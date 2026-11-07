// メール本文の組み立て（差し込みと、必ず付けるフッター）
import { config } from './config.js';

export const MERGE_FIELDS = {
  '{{氏名}}': (c) => c.full_name ?? '',
  '{{企業・団体名}}': (c) => c.org_name ?? '',
  '{{部署}}': (c) => c.department ?? '',
  '{{役職}}': (c) => c.job_title ?? '',
};

export function merge(text, contact) {
  let out = text;
  for (const [k, f] of Object.entries(MERGE_FIELDS)) out = out.split(k).join(f(contact));
  return out;
}

// 特定電子メール法の表示（送信者・住所・問い合わせ先・配信停止の方法）。本文から消せないよう常に末尾に付ける。
// 配信停止は、このメールへの返信で受け付ける（共有メールボックスに届いた返信を見て、担当者が CRM で止める）
export const UNSUBSCRIBE_NOTE = '今後このようなご案内が不要な場合は、このメールに「配信停止」とご返信ください。';

export function footer() {
  const line = '************************************************';
  return ['', line, ...config.footer.signature, line, UNSUBSCRIBE_NOTE].join('\n');
}

// Power Automate の「共有メールボックスからメールを送信する (V2)」は本文を HTML として送るので、
// 文字をエスケープし、改行を <br> にする。lang="ja" は Gmail が英語と取り違えないようにするため
export function toHtml(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<div lang="ja">${esc.replace(/\r?\n/g, '<br>\n')}</div>`;
}

export function compose(campaign, contact) {
  const text = `${merge(campaign.body_text, contact)}\n${footer()}`;
  return { subject: merge(campaign.subject, contact), text, html: toHtml(text) };
}
